from datetime import datetime, timedelta

from ortools.sat.python import cp_model

from .academic_year import academic_year_start_year, build_month_keys, october_month_key
from .calendar_rules import build_call_blocks, idx, month_key, parse_iso, validate_schedule_inputs
from .constants import (
    CATH_THURSDAY_WEIGHT,
    DIFFICULT_ROTATION_STREAK_WEIGHT,
    HOLIDAY_WEEKENDS,
    IN_HOUSE_TARGET_MAX,
    IN_HOUSE_TARGET_MIN,
    MAX_SOLVER_SECONDS,
    OCTOBER_BOARD_WEIGHT,
    PGY_PREFERENCE_WEIGHTS,
    PGY_WEEKEND_TARGETS,
    ROTATIONS,
)
from .objective import configure_objective
from .rotation_rules import add_rotation_constraints, build_hard_month_vars
from .serialization import serialize_solution
from .validation import build_validation


def generate_schedule(
    fellows: list[str],
    start_date: datetime,
    end_date: datetime,
    vacations: dict[str, list[datetime]],
    call_avoid_requests: dict[str, list[datetime]],
    holidays: dict[str, list[datetime]],
    pgy_years: dict[str, str],
    board_exam_fellows: list[str],
    holiday_preferences: dict[str, dict[str, list[str]]],
    major_holiday_blocks: dict | None,
    conference_blocks: dict | None,
    pcicu_exception_months: list[str],
    solver_seed: int | None = None,
) -> dict:
    del holidays

    major_holidays, conference_windows, exception_tuesday_months, normalized_holiday_preferences = validate_schedule_inputs(
        fellows,
        start_date,
        end_date,
        pgy_years,
        holiday_preferences,
        major_holiday_blocks,
        conference_blocks,
        pcicu_exception_months,
    )

    days = (end_date - start_date).days + 1
    fellow_count = len(fellows)
    start_year = academic_year_start_year(start_date, end_date)
    month_keys = build_month_keys(start_year)
    month_index = {month: month_idx for month_idx, month in enumerate(month_keys)}
    rotation_index = {rotation: rotation_idx for rotation_idx, rotation in enumerate(ROTATIONS)}
    month_dates = [month_key(start_date + timedelta(days=day_idx)) for day_idx in range(days)]

    model = cp_model.CpModel()
    rotation = {
        (fellow_idx, month_idx, rotation_idx): model.new_bool_var(
            f"rot_{fellows[fellow_idx]}_{month_keys[month_idx]}_{ROTATIONS[rotation_idx]}"
        )
        for fellow_idx in range(fellow_count)
        for month_idx in range(len(month_keys))
        for rotation_idx in range(len(ROTATIONS))
    }
    call = {
        (fellow_idx, day_idx): model.new_bool_var(f"call_{fellows[fellow_idx]}_{day_idx}")
        for fellow_idx in range(fellow_count)
        for day_idx in range(days)
    }

    add_rotation_constraints(
        model=model,
        rotation=rotation,
        fellow_count=fellow_count,
        rotation_index=rotation_index,
        month_index=month_index,
        month_keys=month_keys,
        pgy_years=pgy_years,
        fellows=fellows,
        exception_tuesday_months=exception_tuesday_months,
        board_exam_fellows=board_exam_fellows,
        start_year=start_year,
    )
    hard_month = build_hard_month_vars(
        model=model,
        rotation=rotation,
        fellow_count=fellow_count,
        rotation_index=rotation_index,
        month_keys=month_keys,
    )

    call_blocks = build_call_blocks(start_date, end_date, major_holidays)
    block_starts = call_blocks["block_starts"]
    block_days_by_start = call_blocks["block_days_by_start"]
    holiday_block_starts = call_blocks["holiday_block_starts"]
    weekend_block_starts = call_blocks["weekend_block_starts"]
    major_block_starts = call_blocks["major_block_starts"]
    covered_block_days = call_blocks["covered_block_days"]
    major_half_info = call_blocks["major_half_info"]
    weekend_credit_major_starts = call_blocks["weekend_credit_major_starts"]
    day_to_block_start = {}
    for start_idx, days_in_block in block_days_by_start.items():
        for day_idx in days_in_block:
            day_to_block_start[day_idx] = start_idx

    for start_idx, days_in_block in block_days_by_start.items():
        for later_idx in days_in_block[1:]:
            for fellow_idx in range(fellow_count):
                model.add(call[(fellow_idx, start_idx)] == call[(fellow_idx, later_idx)])

    ordered_weekend_starts = sorted(weekend_block_starts.union(weekend_credit_major_starts))
    for weekend_idx in range(len(ordered_weekend_starts) - 1):
        current_start = ordered_weekend_starts[weekend_idx]
        next_start = ordered_weekend_starts[weekend_idx + 1]
        for fellow_idx in range(fellow_count):
            model.add(call[(fellow_idx, current_start)] + call[(fellow_idx, next_start)] <= 1)

    for fellow_idx, fellow in enumerate(fellows):
        for vac_date in vacations.get(fellow, []):
            date_idx = idx(vac_date, start_date)
            if 0 <= date_idx < days:
                block_start = day_to_block_start.get(date_idx)
                if block_start in holiday_block_starts or block_start in major_block_starts:
                    continue
                model.add(call[(fellow_idx, date_idx)] == 0)

    heart_camp_start = parse_iso(conference_windows["heart_camp"]["start"])
    heart_camp_end = parse_iso(conference_windows["heart_camp"]["end"])
    chop_start = parse_iso(conference_windows["chop_conference"]["start"])
    chop_end = parse_iso(conference_windows["chop_conference"]["end"])
    for fellow_idx, fellow in enumerate(fellows):
        if pgy_years[fellow] == "PGY-6":
            current = heart_camp_start
            while current <= heart_camp_end:
                date_idx = idx(current, start_date)
                if 0 <= date_idx < days:
                    model.add(call[(fellow_idx, date_idx)] == 0)
                current += timedelta(days=1)
        if pgy_years[fellow] == "PGY-4":
            current = chop_start
            while current <= chop_end:
                date_idx = idx(current, start_date)
                if 0 <= date_idx < days:
                    model.add(call[(fellow_idx, date_idx)] == 0)
                current += timedelta(days=1)

    for day_idx in range(days):
        if day_idx in covered_block_days and day_idx not in block_starts:
            continue

        date = start_date + timedelta(days=day_idx)
        month = month_dates[day_idx]
        month_idx = month_index[month]
        weekday = date.weekday()

        if day_idx in block_starts:
            model.add(sum(call[(fellow_idx, day_idx)] for fellow_idx in range(fellow_count)) == 1)
            continue

        if weekday == 0:
            for fellow_idx in range(fellow_count):
                model.add(call[(fellow_idx, day_idx)] == rotation[(fellow_idx, month_idx, rotation_index["consult"])])
        elif weekday == 1:
            target_rotation = "consult" if month in exception_tuesday_months else "pcicu"
            for fellow_idx in range(fellow_count):
                model.add(call[(fellow_idx, day_idx)] == rotation[(fellow_idx, month_idx, rotation_index[target_rotation])])
        else:
            model.add(sum(call[(fellow_idx, day_idx)] for fellow_idx in range(fellow_count)) == 1)

        for fellow_idx in range(fellow_count):
            consult_var = rotation[(fellow_idx, month_idx, rotation_index["consult"])]
            if weekday == 0:
                continue
            if weekday == 1 and month in exception_tuesday_months:
                continue
            model.add(call[(fellow_idx, day_idx)] + consult_var <= 1)

    for start_idx in block_days_by_start:
        month = month_dates[start_idx]
        month_idx = month_index[month]
        for fellow_idx in range(fellow_count):
            model.add(call[(fellow_idx, start_idx)] + rotation[(fellow_idx, month_idx, rotation_index["consult"])] <= 1)
            if start_idx in weekend_block_starts or start_idx in major_block_starts:
                model.add(call[(fellow_idx, start_idx)] + rotation[(fellow_idx, month_idx, rotation_index["pcicu"])] <= 1)

    holiday_call_starts = holiday_block_starts.union(major_block_starts)
    in_house_days = set()
    for day_idx in range(days):
        date = start_date + timedelta(days=day_idx)
        month = month_dates[day_idx]
        weekday = date.weekday()
        if day_idx in covered_block_days:
            continue
        if weekday == 1 and month not in exception_tuesday_months:
            in_house_days.add(day_idx)
        elif weekday in (2, 3):
            in_house_days.add(day_idx)

    for day_idx in range(days - 1):
        next_day = day_idx + 1
        date = start_date + timedelta(days=day_idx)
        next_date = start_date + timedelta(days=next_day)
        month = month_dates[day_idx]

        if day_to_block_start.get(day_idx) is not None and day_to_block_start.get(day_idx) == day_to_block_start.get(next_day):
            continue
        if date.weekday() == 0 and next_date.weekday() == 1 and month in exception_tuesday_months:
            continue

        for fellow_idx in range(fellow_count):
            model.add(call[(fellow_idx, day_idx)] + call[(fellow_idx, next_day)] <= 1)

    ordered_in_house_days = sorted(in_house_days)
    in_house_counts = [
        sum(call[(fellow_idx, day_idx)] for day_idx in ordered_in_house_days)
        for fellow_idx in range(fellow_count)
    ]
    for total in in_house_counts:
        model.add(total >= IN_HOUSE_TARGET_MIN)
        model.add(total <= IN_HOUSE_TARGET_MAX)

    for fellow_idx, fellow in enumerate(fellows):
        target = PGY_WEEKEND_TARGETS[pgy_years[fellow]]
        model.add(
            sum(call[(fellow_idx, start_idx)] for start_idx in weekend_block_starts)
            + sum(call[(fellow_idx, start_idx)] for start_idx in weekend_credit_major_starts)
            == target
        )
        model.add(sum(call[(fellow_idx, start_idx)] for start_idx in holiday_block_starts) == 1)
        model.add(sum(call[(fellow_idx, info["start_idx"])] for info in major_half_info) == 1)

    for holiday_label in major_holidays:
        holiday_starts = [
            info["start_idx"]
            for info in major_half_info
            if info["holiday"] == holiday_label
        ]
        model.add(sum(call[(fellow_idx, start_idx)] for fellow_idx in range(fellow_count) for start_idx in holiday_starts) == 2)

    october_idx = month_index[october_month_key(start_year)]
    soft_terms = []
    for fellow in board_exam_fellows:
        if fellow not in fellows:
            continue
        fellow_idx = fellows.index(fellow)
        soft_terms.append(OCTOBER_BOARD_WEIGHT * rotation[(fellow_idx, october_idx, rotation_index["imaging"])])
        soft_terms.append(OCTOBER_BOARD_WEIGHT * rotation[(fellow_idx, october_idx, rotation_index["research"])])

    for fellow in fellows:
        fellow_idx = fellows.index(fellow)
        seniority_weight = PGY_PREFERENCE_WEIGHTS[pgy_years[fellow]]
        for requested_date in call_avoid_requests.get(fellow, []):
            date_idx = idx(requested_date, start_date)
            if 0 <= date_idx < days:
                soft_terms.append(-seniority_weight * call[(fellow_idx, date_idx)])

    for fellow in fellows:
        fellow_idx = fellows.index(fellow)
        seniority_weight = PGY_PREFERENCE_WEIGHTS[pgy_years[fellow]]
        prefs = normalized_holiday_preferences[fellow]

        major_scores = {
            label: len(prefs["majorHolidays"]) - pref_idx
            for pref_idx, label in enumerate(prefs["majorHolidays"])
        }
        for label, halves in major_holidays.items():
            for half in halves:
                start_idx = idx(parse_iso(half["start"]), start_date)
                soft_terms.append(seniority_weight * major_scores[label] * call[(fellow_idx, start_idx)])

        weekend_scores = {
            label: len(prefs["holidayWeekends"]) - pref_idx
            for pref_idx, label in enumerate(prefs["holidayWeekends"])
        }
        for start_iso, info in HOLIDAY_WEEKENDS.items():
            start_idx = idx(parse_iso(start_iso), start_date)
            soft_terms.append(seniority_weight * weekend_scores[info["label"]] * call[(fellow_idx, start_idx)])

    for day_idx in range(days):
        date = start_date + timedelta(days=day_idx)
        if date.weekday() != 3 or day_idx in holiday_block_starts:
            continue
        month_idx = month_index[month_dates[day_idx]]
        for fellow_idx in range(fellow_count):
            cath_match = model.new_bool_var(f"cath_thu_{fellow_idx}_{day_idx}")
            model.add(cath_match <= call[(fellow_idx, day_idx)])
            model.add(cath_match <= rotation[(fellow_idx, month_idx, rotation_index["cath"])])
            model.add(cath_match >= call[(fellow_idx, day_idx)] + rotation[(fellow_idx, month_idx, rotation_index["cath"])] - 1)
            soft_terms.append(CATH_THURSDAY_WEIGHT * cath_match)

    for day_idx in range(days):
        date = start_date + timedelta(days=day_idx)
        if date.weekday() != 3:
            continue
        if day_idx in major_block_starts or day_idx in holiday_block_starts:
            continue
        next_day = day_idx + 1
        if next_day not in block_days_by_start:
            continue
        for fellow_idx in range(fellow_count):
            model.add(call[(fellow_idx, day_idx)] + call[(fellow_idx, next_day)] <= 1)

    for fellow_idx in range(fellow_count):
        for month_idx in range(len(month_keys) - 2):
            hard_run = model.new_bool_var(f"hard_run_{fellow_idx}_{month_idx}")
            model.add(hard_run <= hard_month[(fellow_idx, month_idx)])
            model.add(hard_run <= hard_month[(fellow_idx, month_idx + 1)])
            model.add(hard_run <= hard_month[(fellow_idx, month_idx + 2)])
            model.add(hard_run >= hard_month[(fellow_idx, month_idx)] + hard_month[(fellow_idx, month_idx + 1)] + hard_month[(fellow_idx, month_idx + 2)] - 2)
            soft_terms.append(-DIFFICULT_ROTATION_STREAK_WEIGHT * hard_run)

    configure_objective(
        model=model,
        call=call,
        soft_terms=soft_terms,
        call_avoid_request_count=sum(len(call_avoid_requests.get(fellow, [])) for fellow in fellows),
        in_house_days=in_house_days,
        fellow_count=fellow_count,
        days=days,
        start_date=start_date,
        holiday_block_starts=holiday_block_starts,
        major_half_info=major_half_info,
        month_count=len(month_keys),
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = MAX_SOLVER_SECONDS
    if solver_seed is not None:
        solver.parameters.random_seed = solver_seed
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError("No feasible schedule found for the current rotation, vacation, and call rules.")

    result = serialize_solution(
        solver,
        fellows,
        start_date,
        days,
        call,
        rotation,
        rotation_index,
        major_half_info,
        exception_tuesday_months,
        month_keys,
    )
    result["validation"] = build_validation(
        schedule=result["schedule"],
        rotations=result["rotations"],
        holiday_weekends=result["holiday_weekends"],
        major_holidays=result["major_holidays"],
        start_date=start_date,
        end_date=end_date,
        exception_months=sorted(exception_tuesday_months),
        fellows=fellows,
        pgy_years=pgy_years,
        month_keys=month_keys,
        start_year=start_year,
        conference_blocks=conference_windows,
        board_exam_fellows=board_exam_fellows,
    )
    return result
