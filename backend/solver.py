"""
solver.py - OR-Tools CP-SAT model for fellowship rotation and call scheduling.
"""

from datetime import datetime, timedelta

from ortools.sat.python import cp_model

MAX_SOLVER_SECONDS = 60
OCTOBER_BOARD_WEIGHT = 10
CATH_THURSDAY_WEIGHT = 2
DIFFICULT_ROTATION_STREAK_WEIGHT = 3
IN_HOUSE_RANGE_WEIGHT = 60
IN_HOUSE_PAIRWISE_WEIGHT = 8
TOTAL_CALL_RANGE_WEIGHT = 5
PGY_PREFERENCE_WEIGHTS = {"PGY-1": 1, "PGY-2": 2, "PGY-3": 3}

# The solver is intentionally scoped to one academic year so the quota
# checks, holiday windows, and monthly rotation counts stay deterministic.
MONTH_KEYS = [
    "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06",
]
DEFAULT_EXCEPTION_TUESDAY_MONTHS = {
    "2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05",
}
ROTATIONS = ["consult", "imaging", "research", "cath", "achd_ep", "pcicu"]
PGY_WEEKEND_TARGETS = {"PGY-1": 12, "PGY-2": 9, "PGY-3": 5}
PGY_ROTATION_TARGETS = {
    "PGY-1": {"consult": 3, "pcicu": 1, "cath": 4, "imaging": 3, "research": 1, "achd_ep": 0},
    "PGY-2": {"consult": 2, "pcicu": 1, "cath": 1, "imaging": 3, "research": 4, "achd_ep": 1},
    "PGY-3": {"consult": 1, "pcicu": 1, "cath": 1, "imaging": 1, "research": 7, "achd_ep": 1},
}
REQUIRED_PGY_COUNTS = {"PGY-1": 2, "PGY-2": 2, "PGY-3": 2}
HOLIDAY_WEEKENDS = {
    "2026-07-03": {
        "label": "July 4",
        "start": "2026-07-03",
        "end": "2026-07-06",
        "holiday_date": "2026-07-04",
    },
    "2026-09-04": {
        "label": "Labor Day",
        "start": "2026-09-04",
        "end": "2026-09-07",
        "holiday_date": "2026-09-07",
    },
    "2027-01-15": {
        "label": "MLK Day",
        "start": "2027-01-15",
        "end": "2027-01-18",
        "holiday_date": "2027-01-18",
    },
    "2027-03-25": {
        "label": "Good Friday",
        "start": "2027-03-25",
        "end": "2027-03-28",
        "holiday_date": "2027-03-26",
    },
    "2027-05-28": {
        "label": "Memorial Day",
        "start": "2027-05-28",
        "end": "2027-05-31",
        "holiday_date": "2027-05-31",
    },
    "2027-06-18": {
        "label": "Juneteenth",
        "start": "2027-06-18",
        "end": "2027-06-21",
        "holiday_date": "2027-06-19",
    },
}
DEFAULT_MAJOR_HOLIDAYS = {
    "Thanksgiving": [
        {"label": "Thanksgiving A", "start": "2026-11-25", "end": "2026-11-26"},
        {"label": "Thanksgiving B", "start": "2026-11-27", "end": "2026-11-29"},
    ],
    "Christmas": [
        {"label": "Christmas A", "start": "2026-12-22", "end": "2026-12-24"},
        {"label": "Christmas B", "start": "2026-12-25", "end": "2026-12-27"},
    ],
    "New Year's": [
        {"label": "New Year's A", "start": "2026-12-28", "end": "2026-12-30"},
        {"label": "New Year's B", "start": "2026-12-31", "end": "2027-01-03"},
    ],
}
# These rotations are still allowed to repeat, but the objective penalizes
# runs longer than two months to keep the final schedule more balanced.
DIFFICULT_ROTATIONS = ("consult", "cath", "pcicu")


def _idx(date: datetime, start: datetime) -> int:
    return (date - start).days


def _month_key(date: datetime) -> str:
    return date.strftime("%Y-%m")


def _parse_iso(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d")


def _normalize_major_holidays(major_holiday_blocks: dict | None) -> dict[str, list[dict[str, str]]]:
    # The frontend can edit major-holiday date windows, but the backend keeps
    # the holiday names/half labels stable so downstream validation and exports
    # always have predictable identifiers.
    major_holidays = major_holiday_blocks or DEFAULT_MAJOR_HOLIDAYS
    expected = set(DEFAULT_MAJOR_HOLIDAYS)
    if set(major_holidays) != expected:
        raise ValueError("major_holiday_blocks must include Thanksgiving, Christmas, and New Year's")

    normalized: dict[str, list[dict[str, str]]] = {}
    for holiday, default_halves in DEFAULT_MAJOR_HOLIDAYS.items():
        halves = major_holidays.get(holiday, [])
        if len(halves) != 2:
            raise ValueError(f"{holiday} must define exactly two holiday halves")
        normalized_halves = []
        for idx, half in enumerate(halves):
            start = half.get("start")
            end = half.get("end")
            if not start or not end:
                raise ValueError(f"{holiday} holiday halves must include start and end dates")
            start_dt = _parse_iso(start)
            end_dt = _parse_iso(end)
            if end_dt < start_dt:
                raise ValueError(f"{holiday} holiday half end must be on or after the start date")
            normalized_halves.append(
                {
                    "label": default_halves[idx]["label"],
                    "start": start_dt.strftime("%Y-%m-%d"),
                    "end": end_dt.strftime("%Y-%m-%d"),
                }
            )
        normalized[holiday] = normalized_halves
    return normalized


def generate_schedule(
    fellows: list[str],
    start_date: datetime,
    end_date: datetime,
    vacations: dict[str, list[datetime]],
    holidays: dict[str, list[datetime]],
    pgy_years: dict[str, str],
    board_exam_fellows: list[str],
    holiday_preferences: dict[str, dict[str, list[str]]],
    major_holiday_blocks: dict | None,
    pcicu_exception_months: list[str],
    solver_seed: int | None = None,
) -> dict:
    del holidays

    if len(fellows) != 6:
        raise ValueError("the schedule must include exactly 6 fellows")
    if start_date.strftime("%Y-%m-%d") != "2026-07-01" or end_date.strftime("%Y-%m-%d") != "2027-06-30":
        raise ValueError("the current rules require the window 07/01/2026 through 06/30/2027")
    if not pcicu_exception_months:
        pcicu_exception_months = sorted(DEFAULT_EXCEPTION_TUESDAY_MONTHS)
    exception_tuesday_months = set(pcicu_exception_months)
    if len(exception_tuesday_months) != 6:
        raise ValueError("exactly 6 PCICU exception months must be selected")
    invalid_exception_months = exception_tuesday_months.difference(MONTH_KEYS)
    if invalid_exception_months:
        raise ValueError(
            "pcicu exception months must fall within the academic year window"
        )

    pgy_counts = {pgy: 0 for pgy in REQUIRED_PGY_COUNTS}
    for fellow in fellows:
        pgy = pgy_years.get(fellow)
        if pgy not in PGY_ROTATION_TARGETS:
            raise ValueError("each fellow must have a valid PGY value of PGY-1, PGY-2, or PGY-3")
        pgy_counts[pgy] += 1
    for pgy, required in REQUIRED_PGY_COUNTS.items():
        if pgy_counts[pgy] != required:
            raise ValueError("the roster must include exactly two fellows in each of PGY-1, PGY-2, and PGY-3")

    major_holidays = _normalize_major_holidays(major_holiday_blocks)
    expected_major = set(major_holidays)
    expected_weekends = {info["label"] for info in HOLIDAY_WEEKENDS.values()}
    for fellow in fellows:
        prefs = holiday_preferences.get(fellow)
        if not prefs:
            raise ValueError(f"missing holiday preferences for {fellow}")
        major_list = prefs.get("majorHolidays", [])
        weekend_list = prefs.get("holidayWeekends", [])
        if set(major_list) != expected_major or len(major_list) != len(expected_major):
            raise ValueError(
                f"{fellow} must rank each major holiday exactly once"
            )
        if set(weekend_list) != expected_weekends or len(weekend_list) != len(expected_weekends):
            raise ValueError(
                f"{fellow} must rank each holiday weekend exactly once"
            )

    days = (end_date - start_date).days + 1
    n = len(fellows)
    month_index = {month: idx for idx, month in enumerate(MONTH_KEYS)}
    rotation_index = {rotation: idx for idx, rotation in enumerate(ROTATIONS)}
    month_dates = [_month_key(start_date + timedelta(days=d)) for d in range(days)]

    model = cp_model.CpModel()
    # `rotation` is the monthly daytime assignment grid; `call` is the daily
    # overnight call grid. The model solves both together so call rules can
    # depend on who is on consult/PCICU/cath in a given month.
    rotation = {
        (f, m, r): model.new_bool_var(f"rot_{fellows[f]}_{MONTH_KEYS[m]}_{ROTATIONS[r]}")
        for f in range(n)
        for m in range(len(MONTH_KEYS))
        for r in range(len(ROTATIONS))
    }
    call = {
        (f, d): model.new_bool_var(f"call_{fellows[f]}_{d}")
        for f in range(n)
        for d in range(days)
    }

    for f in range(n):
        for m in range(len(MONTH_KEYS)):
            model.add(sum(rotation[(f, m, r)] for r in range(len(ROTATIONS))) == 1)

    for m in range(len(MONTH_KEYS)):
        model.add(sum(rotation[(f, m, rotation_index["consult"])] for f in range(n)) == 1)
        model.add(sum(rotation[(f, m, rotation_index["cath"])] for f in range(n)) == 1)
        if MONTH_KEYS[m] in exception_tuesday_months:
            model.add(sum(rotation[(f, m, rotation_index["pcicu"])] for f in range(n)) == 0)
        else:
            model.add(sum(rotation[(f, m, rotation_index["pcicu"])] for f in range(n)) == 1)
        model.add(sum(rotation[(f, m, rotation_index["achd_ep"])] for f in range(n)) <= 1)

    for f, fellow in enumerate(fellows):
        targets = PGY_ROTATION_TARGETS[pgy_years[fellow]]
        for rotation_name, target in targets.items():
            r = rotation_index[rotation_name]
            model.add(sum(rotation[(f, m, r)] for m in range(len(MONTH_KEYS))) == target)

    july_index = month_index["2026-07"]
    for f, fellow in enumerate(fellows):
        if pgy_years[fellow] == "PGY-1":
            model.add(rotation[(f, july_index, rotation_index["imaging"])] == 1)

    for f in range(n):
        for m in range(len(MONTH_KEYS) - 1):
            for rotation_name in ROTATIONS:
                if rotation_name == "research":
                    continue
                r = rotation_index[rotation_name]
                model.add(rotation[(f, m, r)] + rotation[(f, m + 1, r)] <= 1)

    research_idx = rotation_index["research"]
    for f in range(n):
        for m in range(len(MONTH_KEYS) - 2):
            model.add(
                rotation[(f, m, research_idx)]
                + rotation[(f, m + 1, research_idx)]
                + rotation[(f, m + 2, research_idx)]
                <= 2
            )

    hard_month = {}
    for f in range(n):
        for m in range(len(MONTH_KEYS)):
            hard_month[(f, m)] = model.new_bool_var(f"hard_month_{f}_{m}")
            difficult_sum = sum(rotation[(f, m, rotation_index[name])] for name in DIFFICULT_ROTATIONS)
            model.add(hard_month[(f, m)] == difficult_sum)

    block_starts: list[int] = []
    block_days_by_start: dict[int, list[int]] = {}
    holiday_block_starts: set[int] = set()
    weekend_block_starts: set[int] = set()
    major_block_starts: set[int] = set()
    covered_block_days: set[int] = set()
    major_half_info: list[dict] = []

    # `block_starts` tracks every multi-day call block that must stay with one
    # fellow: holiday weekends, standard weekends, and major-holiday halves.
    for start_iso, info in HOLIDAY_WEEKENDS.items():
        start_dt = _parse_iso(start_iso)
        end_dt = _parse_iso(info["end"])
        start_idx = _idx(start_dt, start_date)
        end_idx = _idx(end_dt, start_date)
        days_in_block = list(range(start_idx, end_idx + 1))
        block_starts.append(start_idx)
        block_days_by_start[start_idx] = days_in_block
        holiday_block_starts.add(start_idx)
        weekend_block_starts.add(start_idx)
        covered_block_days.update(days_in_block)

    # Only the major-holiday halves that include an actual Friday count toward
    # the weekend quota requirement.
    weekend_credit_major_starts: set[int] = set()
    for holiday_label, halves in major_holidays.items():
        for half in halves:
            start_dt = _parse_iso(half["start"])
            end_dt = _parse_iso(half["end"])
            if start_dt < start_date or end_dt > end_date:
                raise ValueError(f"{holiday_label} holiday halves must fall within the academic year window")
            start_idx = _idx(start_dt, start_date)
            end_idx = _idx(end_dt, start_date)
            days_in_block = list(range(start_idx, end_idx + 1))
            if any(day_idx in covered_block_days for day_idx in days_in_block):
                raise ValueError(f"{holiday_label} holiday halves overlap another reserved holiday block")
            block_starts.append(start_idx)
            block_days_by_start[start_idx] = days_in_block
            major_block_starts.add(start_idx)
            covered_block_days.update(days_in_block)
            if any((start_date + timedelta(days=day_idx)).weekday() == 4 for day_idx in days_in_block):
                weekend_credit_major_starts.add(start_idx)
            major_half_info.append(
                {
                    "holiday": holiday_label,
                    "label": half["label"],
                    "start": half["start"],
                    "end": half["end"],
                    "start_idx": start_idx,
                }
            )

    for d in range(days):
        date = start_date + timedelta(days=d)
        if date.weekday() != 4 or d in covered_block_days:
            continue
        if d + 2 >= days:
            continue
        days_in_block = [d, d + 1, d + 2]
        block_starts.append(d)
        block_days_by_start[d] = days_in_block
        weekend_block_starts.add(d)
        covered_block_days.update(days_in_block)

    if len(weekend_block_starts) != 49:
        raise ValueError("expected exactly 49 weekend call blocks after carving out major holiday halves")
    if len(major_half_info) != 6:
        raise ValueError("expected exactly 6 major holiday half-blocks in the academic year window")
    if len(weekend_block_starts) + len(weekend_credit_major_starts) != sum(PGY_WEEKEND_TARGETS[pgy] * REQUIRED_PGY_COUNTS[pgy] for pgy in REQUIRED_PGY_COUNTS):
        raise ValueError("weekend coverage implied by the configured major holiday halves does not match the required annual weekend totals")

    for start_idx, days_in_block in block_days_by_start.items():
        for later_idx in days_in_block[1:]:
            for f in range(n):
                model.add(call[(f, start_idx)] == call[(f, later_idx)])

    ordered_weekend_starts = sorted(weekend_block_starts.union(weekend_credit_major_starts))
    for i in range(len(ordered_weekend_starts) - 1):
        current_start = ordered_weekend_starts[i]
        next_start = ordered_weekend_starts[i + 1]
        for f in range(n):
            model.add(call[(f, current_start)] + call[(f, next_start)] <= 1)

    for f, fellow in enumerate(fellows):
        for vac_date in vacations.get(fellow, []):
            idx = _idx(vac_date, start_date)
            if 0 <= idx < days:
                model.add(call[(f, idx)] == 0)

    for d in range(days):
        if d in covered_block_days and d not in block_starts:
            continue

        date = start_date + timedelta(days=d)
        month = month_dates[d]
        m = month_index[month]
        dow = date.weekday()

        if d in block_starts:
            model.add(sum(call[(f, d)] for f in range(n)) == 1)
            continue

        if dow == 0:
            for f in range(n):
                model.add(call[(f, d)] == rotation[(f, m, rotation_index["consult"])])
        elif dow == 1:
            target_rotation = "consult" if month in exception_tuesday_months else "pcicu"
            for f in range(n):
                model.add(call[(f, d)] == rotation[(f, m, rotation_index[target_rotation])])
        else:
            model.add(sum(call[(f, d)] for f in range(n)) == 1)

        for f in range(n):
            consult_var = rotation[(f, m, rotation_index["consult"])]
            if dow == 0:
                continue
            if dow == 1 and month in exception_tuesday_months:
                continue
            model.add(call[(f, d)] + consult_var <= 1)

    for start_idx, days_in_block in block_days_by_start.items():
        month = month_dates[start_idx]
        m = month_index[month]
        for f in range(n):
            model.add(call[(f, start_idx)] + rotation[(f, m, rotation_index["consult"])] <= 1)
            if start_idx in weekend_block_starts or start_idx in major_block_starts:  # <-- add major_block_starts
                model.add(call[(f, start_idx)] + rotation[(f, m, rotation_index["pcicu"])] <= 1)

    holiday_call_starts = holiday_block_starts.union(major_block_starts)
    in_house_days = set()
    for d in range(days):
        date = start_date + timedelta(days=d)
        month = month_dates[d]
        dow = date.weekday()
        if d in covered_block_days:
            continue
        if dow == 1 and month not in exception_tuesday_months:
            in_house_days.add(d)
        elif dow in (2, 3):
            in_house_days.add(d)

    # This map lets the consecutive-call rule distinguish a true back-to-back
    # assignment from two dates that belong to the same protected call block.
    day_to_block_start = {}
    for start_idx, days_in_block in block_days_by_start.items():
        for day_idx in days_in_block:
            day_to_block_start[day_idx] = start_idx

    for d in range(days - 1):
        next_day = d + 1
        date = start_date + timedelta(days=d)
        next_date = start_date + timedelta(days=next_day)
        month = month_dates[d]

        # Skip days that belong to the same protected block
        if (
            day_to_block_start.get(d) is not None
            and day_to_block_start.get(d) == day_to_block_start.get(next_day)
        ):
            continue

        # Allow consult fellow to cover Mon+Tue in exception months
        if (
            date.weekday() == 0
            and next_date.weekday() == 1
            and month in exception_tuesday_months
        ):
            continue

        for f in range(n):
            model.add(call[(f, d)] + call[(f, next_day)] <= 1)

    for f, fellow in enumerate(fellows):
        target = PGY_WEEKEND_TARGETS[pgy_years[fellow]]
        model.add(
            sum(call[(f, start_idx)] for start_idx in weekend_block_starts)
            + sum(call[(f, start_idx)] for start_idx in weekend_credit_major_starts)
            == target
        )
        model.add(sum(call[(f, start_idx)] for start_idx in holiday_block_starts) == 1)
        model.add(sum(call[(f, info["start_idx"])] for info in major_half_info) == 1)

    for holiday_label, halves in major_holidays.items():
        holiday_starts = [
            info["start_idx"]
            for info in major_half_info
            if info["holiday"] == holiday_label
        ]
        model.add(sum(call[(f, start_idx)] for f in range(n) for start_idx in holiday_starts) == 2)

    october_idx = month_index["2026-10"]
    soft_terms = []
    for fellow in board_exam_fellows:
        if fellow not in fellows:
            continue
        f = fellows.index(fellow)
        soft_terms.append(OCTOBER_BOARD_WEIGHT * rotation[(f, october_idx, rotation_index["imaging"])])
        soft_terms.append(OCTOBER_BOARD_WEIGHT * rotation[(f, october_idx, rotation_index["research"])])

    for fellow in fellows:
        f = fellows.index(fellow)
        seniority_weight = PGY_PREFERENCE_WEIGHTS[pgy_years[fellow]]
        prefs = holiday_preferences[fellow]

        major_scores = {
            label: len(prefs["majorHolidays"]) - idx
            for idx, label in enumerate(prefs["majorHolidays"])
        }
        for label, halves in major_holidays.items():
            for half in halves:
                idx = _idx(_parse_iso(half["start"]), start_date)
                soft_terms.append(
                    seniority_weight * major_scores[label] * call[(f, idx)]
                )

        weekend_scores = {
            label: len(prefs["holidayWeekends"]) - idx
            for idx, label in enumerate(prefs["holidayWeekends"])
        }
        for start_iso, info in HOLIDAY_WEEKENDS.items():
            start_idx = _idx(_parse_iso(start_iso), start_date)
            soft_terms.append(
                seniority_weight * weekend_scores[info["label"]] * call[(f, start_idx)]
            )

    for d in range(days):
        date = start_date + timedelta(days=d)
        if date.weekday() != 3 or d in holiday_block_starts:
            continue
        m = month_index[month_dates[d]]
        for f in range(n):
            cath_match = model.new_bool_var(f"cath_thu_{f}_{d}")
            model.add(cath_match <= call[(f, d)])
            model.add(cath_match <= rotation[(f, m, rotation_index["cath"])])
            model.add(cath_match >= call[(f, d)] + rotation[(f, m, rotation_index["cath"])] - 1)
            soft_terms.append(CATH_THURSDAY_WEIGHT * cath_match)

    # A fellow covering a routine Thursday cannot also take the immediately
    # following weekend block, regardless of whether that weekend is a holiday.
    for d in range(days):
        date = start_date + timedelta(days=d)
        if date.weekday() != 3:
            continue
        if d in major_block_starts or d in holiday_block_starts:
            continue
        next_day = d + 1
        if next_day not in block_days_by_start:
            continue
        for f in range(n):
            model.add(call[(f, d)] + call[(f, next_day)] <= 1)

    for f in range(n):
        for m in range(len(MONTH_KEYS) - 2):
            hard_run = model.new_bool_var(f"hard_run_{f}_{m}")
            model.add(hard_run <= hard_month[(f, m)])
            model.add(hard_run <= hard_month[(f, m + 1)])
            model.add(hard_run <= hard_month[(f, m + 2)])
            model.add(hard_run >= hard_month[(f, m)] + hard_month[(f, m + 1)] + hard_month[(f, m + 2)] - 2)
            soft_terms.append(-DIFFICULT_ROTATION_STREAK_WEIGHT * hard_run)

    # In-house calls are the most fatigue-heavy recurring burden in the model,
    # so fairness optimization prioritizes those counts before overall totals.
    ordered_in_house_days = sorted(in_house_days)
    in_house_counts = [sum(call[(f, d)] for d in ordered_in_house_days) for f in range(n)]
    max_in_house = model.new_int_var(0, len(ordered_in_house_days), "max_in_house")
    min_in_house = model.new_int_var(0, len(ordered_in_house_days), "min_in_house")
    for total in in_house_counts:
        model.add(total <= max_in_house)
        model.add(total >= min_in_house)

    in_house_pairwise_spread = []
    for left in range(n):
        for right in range(left + 1, n):
            diff = model.new_int_var(0, len(ordered_in_house_days), f"in_house_diff_{left}_{right}")
            model.add_abs_equality(diff, in_house_counts[left] - in_house_counts[right])
            in_house_pairwise_spread.append(diff)

    # Total call fairness still matters, but it is secondary to keeping the
    # in-house weekday burden from drifting toward the senior fellows.
    total_counts = [sum(call[(f, d)] for d in range(days)) for f in range(n)]
    max_total = model.new_int_var(0, days, "max_total")
    min_total = model.new_int_var(0, days, "min_total")
    for total in total_counts:
        model.add(total <= max_total)
        model.add(total >= min_total)

    objective = (
        sum(soft_terms) * 100
        - IN_HOUSE_RANGE_WEIGHT * (max_in_house - min_in_house)
        - IN_HOUSE_PAIRWISE_WEIGHT * sum(in_house_pairwise_spread)
        - TOTAL_CALL_RANGE_WEIGHT * (max_total - min_total)
    )
    model.maximize(objective)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = MAX_SOLVER_SECONDS
    if solver_seed is not None:
        solver.parameters.random_seed = solver_seed
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError("No feasible schedule found for the current rotation, vacation, and call rules.")

    schedule = []
    for d in range(days):
        date = start_date + timedelta(days=d)
        for f in range(n):
            if solver.value(call[(f, d)]) == 1:
                schedule.append({"date": date.strftime("%m/%d/%Y"), "fellow": fellows[f]})

    rotations = []
    for m, month in enumerate(MONTH_KEYS):
        for f in range(n):
            for rotation_name, r in rotation_index.items():
                if solver.value(rotation[(f, m, r)]) == 1:
                    rotations.append({"month": month, "fellow": fellows[f], "rotation": rotation_name})

    holiday_weekends = []
    for start_iso, info in HOLIDAY_WEEKENDS.items():
        start_idx = _idx(_parse_iso(start_iso), start_date)
        assigned_fellow = None
        for f in range(n):
            if solver.value(call[(f, start_idx)]) == 1:
                assigned_fellow = fellows[f]
                break
        holiday_weekends.append(
            {
                "label": info["label"],
                "start": _parse_iso(info["start"]).strftime("%m/%d/%Y"),
                "end": _parse_iso(info["end"]).strftime("%m/%d/%Y"),
                "fellow": assigned_fellow,
            }
        )

    major_holidays_results = []
    for info in major_half_info:
        assigned_fellow = None
        for f in range(n):
            if solver.value(call[(f, info["start_idx"])]) == 1:
                assigned_fellow = fellows[f]
                break
        major_holidays_results.append(
            {
                "holiday": info["holiday"],
                "label": info["label"],
                "start": _parse_iso(info["start"]).strftime("%m/%d/%Y"),
                "end": _parse_iso(info["end"]).strftime("%m/%d/%Y"),
                "fellow": assigned_fellow,
            }
        )

    return {
        "schedule": schedule,
        "rotations": rotations,
        "holiday_weekends": holiday_weekends,
        "major_holidays": major_holidays_results,
    }
