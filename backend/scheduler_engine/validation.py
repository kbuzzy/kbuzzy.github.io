from datetime import datetime, timedelta

from .constants import DEFAULT_MAJOR_HOLIDAYS, HOLIDAY_WEEKENDS, MONTH_KEYS, PGY_ROTATION_TARGETS

DATE_FMT = "%m/%d/%Y"


def _parse_display(date_str: str) -> datetime:
    return datetime.strptime(date_str, DATE_FMT)


def build_validation(
    schedule: list[dict],
    rotations: list[dict],
    holiday_weekends: list[dict],
    major_holidays: list[dict],
    start_date: datetime,
    end_date: datetime,
    exception_months: list[str],
    fellows: list[str],
    pgy_years: dict[str, str],
) -> list[dict]:
    if not schedule:
        return []

    by_date = {item["date"]: item["fellow"] for item in schedule}
    consult_by_month: dict[str, str] = {}
    pcicu_by_month: dict[str, str] = {}
    cath_by_month: dict[str, str] = {}
    rotation_by_fellow_month: dict[str, str] = {}
    rotation_count_by_fellow_month: dict[str, int] = {}
    rotation_count_by_month_type: dict[str, int] = {}

    for item in rotations:
        if item["rotation"] == "consult":
            consult_by_month[item["month"]] = item["fellow"]
        if item["rotation"] == "pcicu":
            pcicu_by_month[item["month"]] = item["fellow"]
        if item["rotation"] == "cath":
            cath_by_month[item["month"]] = item["fellow"]
        fellow_month_key = f'{item["fellow"]}::{item["month"]}'
        rotation_by_fellow_month[fellow_month_key] = item["rotation"]
        rotation_count_by_fellow_month[fellow_month_key] = rotation_count_by_fellow_month.get(fellow_month_key, 0) + 1
        month_type_key = f'{item["month"]}::{item["rotation"]}'
        rotation_count_by_month_type[month_type_key] = rotation_count_by_month_type.get(month_type_key, 0) + 1

    checks = []
    missing = []
    rotation_coverage_errors = []
    slot_count_errors = []
    july_imaging_errors = []
    rotation_quota_errors = []
    consecutive_rotation_errors = []
    research_run_errors = []
    monday_errors = []
    tuesday_errors = []
    weekend_errors = []
    major_holiday_errors = []
    consult_weekend_errors = []
    pcicu_weekend_errors = []
    consecutive_weekend_errors = []
    consecutive_call_errors = []
    thursday_weekend_errors = []
    cath_thursday_matches = []
    holiday_counts: dict[str, int] = {}
    major_holiday_counts: dict[str, int] = {}

    exception_month_set = set(exception_months)
    holiday_start_map = {item["start"]: item for item in holiday_weekends}
    holiday_covered_dates: set[str] = set()
    major_holiday_start_map = {item["start"]: item for item in major_holidays}
    block_start_by_date: dict[str, str] = {}
    weekend_assignments: list[dict] = []

    for item in holiday_weekends:
        current = _parse_display(item["start"])
        end = _parse_display(item["end"])
        while current <= end:
            date_key = current.strftime(DATE_FMT)
            holiday_covered_dates.add(date_key)
            block_start_by_date[date_key] = item["start"]
            current += timedelta(days=1)

    for item in major_holidays:
        current = _parse_display(item["start"])
        end = _parse_display(item["end"])
        while current <= end:
            date_key = current.strftime(DATE_FMT)
            holiday_covered_dates.add(date_key)
            block_start_by_date[date_key] = item["start"]
            current += timedelta(days=1)

    for fellow in fellows:
        counts: dict[str, int] = {}
        for month in MONTH_KEYS:
            fellow_month_key = f"{fellow}::{month}"
            rotation_name = rotation_by_fellow_month.get(fellow_month_key)
            month_count = rotation_count_by_fellow_month.get(fellow_month_key, 0)
            if month_count != 1:
                rotation_coverage_errors.append(f"{fellow} has {month_count} rotations in {month}")
            if rotation_name:
                counts[rotation_name] = counts.get(rotation_name, 0) + 1
            if month == "2026-07" and pgy_years.get(fellow) == "PGY-4" and rotation_name != "imaging":
                july_imaging_errors.append(f"{fellow} should be on imaging in 2026-07, got {rotation_name or 'none'}")

        fellow_pgy = pgy_years.get(fellow)
        if fellow_pgy in PGY_ROTATION_TARGETS:
            for rotation_name, expected in PGY_ROTATION_TARGETS[fellow_pgy].items():
                actual = counts.get(rotation_name, 0)
                if actual != expected:
                    rotation_quota_errors.append(f"{fellow} has {actual} {rotation_name} months, expected {expected}")

        for month_idx, month in enumerate(MONTH_KEYS):
            if month_idx == 0:
                continue
            current_rotation = rotation_by_fellow_month.get(f"{fellow}::{month}")
            previous_rotation = rotation_by_fellow_month.get(f"{fellow}::{MONTH_KEYS[month_idx - 1]}")
            if current_rotation and current_rotation == previous_rotation and current_rotation != "research":
                consecutive_rotation_errors.append(f"{fellow} repeated {current_rotation} in {MONTH_KEYS[month_idx - 1]} and {month}")

        run_length = 0
        for month in MONTH_KEYS:
            if rotation_by_fellow_month.get(f"{fellow}::{month}") == "research":
                run_length += 1
                if run_length > 2:
                    research_run_errors.append(f"{fellow} has more than two consecutive research months ending in {month}")
            else:
                run_length = 0

    for month in MONTH_KEYS:
        consult_count = rotation_count_by_month_type.get(f"{month}::consult", 0)
        cath_count = rotation_count_by_month_type.get(f"{month}::cath", 0)
        pcicu_count = rotation_count_by_month_type.get(f"{month}::pcicu", 0)
        achd_count = rotation_count_by_month_type.get(f"{month}::achd_ep", 0)
        expected_pcicu = 0 if month in exception_month_set else 1
        if consult_count != 1:
            slot_count_errors.append(f"{month} has {consult_count} consult fellows")
        if cath_count != 1:
            slot_count_errors.append(f"{month} has {cath_count} cath fellows")
        if pcicu_count != expected_pcicu:
            slot_count_errors.append(f"{month} has {pcicu_count} PCICU fellows, expected {expected_pcicu}")
        if achd_count > 1:
            slot_count_errors.append(f"{month} has {achd_count} ACHD/EP fellows")

    unique_slot_errors = list(dict.fromkeys(slot_count_errors))

    checks.append({
        "ok": len(rotation_coverage_errors) == 0,
        "label": "Monthly rotation coverage",
        "detail": "Every fellow has exactly one rotation in each month." if not rotation_coverage_errors else " | ".join(rotation_coverage_errors[:3]),
    })
    checks.append({
        "ok": len(unique_slot_errors) == 0,
        "label": "Rotation slot counts",
        "detail": "Monthly consult, cath, PCICU, and ACHD/EP slot counts are valid." if not unique_slot_errors else " | ".join(unique_slot_errors[:3]),
    })
    checks.append({
        "ok": len(july_imaging_errors) == 0,
        "label": "July first-year fellow imaging",
        "detail": "Both first-year fellows (PGY-4) are on imaging in July 2026." if not july_imaging_errors else " | ".join(july_imaging_errors[:3]),
    })
    checks.append({
        "ok": len(rotation_quota_errors) == 0,
        "label": "Rotation quotas",
        "detail": "Each fellow matches the required PGY rotation totals." if not rotation_quota_errors else " | ".join(rotation_quota_errors[:3]),
    })
    checks.append({
        "ok": len(consecutive_rotation_errors) == 0,
        "label": "Consecutive non-research rotations",
        "detail": "No fellow repeats a non-research rotation in back-to-back months." if not consecutive_rotation_errors else " | ".join(consecutive_rotation_errors[:3]),
    })

    current = start_date
    while current <= end_date:
        date_str = current.strftime(DATE_FMT)
        month = current.strftime("%Y-%m")
        assigned = by_date.get(date_str)
        if not assigned:
            missing.append(date_str)

        if current.weekday() == 0 and date_str not in holiday_covered_dates and assigned != consult_by_month.get(month):
            monday_errors.append(f"{date_str}: expected {consult_by_month.get(month)}, got {assigned}")

        if current.weekday() == 1 and date_str not in holiday_covered_dates:
            expected = consult_by_month.get(month) if month in exception_month_set else pcicu_by_month.get(month)
            if assigned != expected:
                tuesday_errors.append(f"{date_str}: expected {expected}, got {assigned}")

        if date_str in holiday_start_map:
            holiday = holiday_start_map[date_str]
            end = _parse_display(holiday["end"])
            dates = []
            tmp = current
            while tmp <= end:
                dates.append(by_date.get(tmp.strftime(DATE_FMT)))
                tmp += timedelta(days=1)
            if len(set(dates)) != 1:
                weekend_errors.append(f'{holiday["label"]}: holiday block does not stay with one fellow')
            if dates[0]:
                weekend_assignments.append({"start": date_str, "fellow": dates[0], "label": holiday["label"]})
            if dates[0] == consult_by_month.get(month):
                consult_weekend_errors.append(f'{holiday["label"]}: consult fellow {dates[0]} was assigned the holiday weekend')
            if dates[0] == pcicu_by_month.get(month):
                pcicu_weekend_errors.append(f'{holiday["label"]}: PCICU fellow {dates[0]} was assigned the holiday weekend')
        elif date_str in major_holiday_start_map:
            major_holiday = major_holiday_start_map[date_str]
            end = _parse_display(major_holiday["end"])
            dates = []
            tmp = current
            contains_friday = False
            scan = current
            while scan <= end:
                if scan.weekday() == 4:
                    contains_friday = True
                    break
                scan += timedelta(days=1)
            while tmp <= end:
                dates.append(by_date.get(tmp.strftime(DATE_FMT)))
                tmp += timedelta(days=1)
            if len(set(dates)) != 1:
                major_holiday_errors.append(f'{major_holiday["label"]}: holiday half does not stay with one fellow')
            if contains_friday and dates[0]:
                weekend_assignments.append({"start": date_str, "fellow": dates[0], "label": major_holiday["label"]})
        elif current.weekday() == 4 and date_str not in holiday_covered_dates and current + timedelta(days=2) <= end_date:
            fri = assigned
            sat = by_date.get((current + timedelta(days=1)).strftime(DATE_FMT))
            sun = by_date.get((current + timedelta(days=2)).strftime(DATE_FMT))
            if fri != sat or fri != sun:
                weekend_errors.append(f"{date_str}: Fri={fri}, Sat={sat}, Sun={sun}")
            if fri:
                weekend_assignments.append({"start": date_str, "fellow": fri, "label": date_str})
            block_start_by_date[date_str] = date_str
            block_start_by_date[(current + timedelta(days=1)).strftime(DATE_FMT)] = date_str
            block_start_by_date[(current + timedelta(days=2)).strftime(DATE_FMT)] = date_str
            if fri == consult_by_month.get(month):
                consult_weekend_errors.append(f"{date_str}: consult fellow {fri} was assigned a weekend")
            if fri == pcicu_by_month.get(month):
                pcicu_weekend_errors.append(f"{date_str}: PCICU fellow {fri} was assigned a weekend")

        if current.weekday() == 3 and cath_by_month.get(month) and assigned == cath_by_month.get(month):
            cath_thursday_matches.append(date_str)

        if current.weekday() == 3 and date_str not in holiday_covered_dates:
            thursday_fellow = assigned
            next_friday = (current + timedelta(days=1)).strftime(DATE_FMT)
            friday_block_start = block_start_by_date.get(next_friday, next_friday)
            friday_fellow = by_date.get(friday_block_start)
            if thursday_fellow and friday_fellow == thursday_fellow:
                thursday_weekend_errors.append(f"{date_str}: {thursday_fellow} also took the following weekend")

        current += timedelta(days=1)

    for item in holiday_weekends:
        holiday_counts[item["fellow"]] = holiday_counts.get(item["fellow"], 0) + 1
    for item in major_holidays:
        major_holiday_counts[item["fellow"]] = major_holiday_counts.get(item["fellow"], 0) + 1

    major_holiday_coverage_counts = {holiday: 0 for holiday in DEFAULT_MAJOR_HOLIDAYS}
    for item in major_holidays:
        major_holiday_coverage_counts[item["holiday"]] = major_holiday_coverage_counts.get(item["holiday"], 0) + 1

    weekend_assignments.sort(key=lambda item: _parse_display(item["start"]))
    for assignment_idx, assignment in enumerate(weekend_assignments):
        if assignment_idx == 0:
            continue
        previous = weekend_assignments[assignment_idx - 1]
        if previous["fellow"] == assignment["fellow"]:
            consecutive_weekend_errors.append(
                f'{assignment["fellow"]} worked consecutive weekends starting {previous["start"]} and {assignment["start"]}'
            )

    schedule_by_date = sorted(schedule, key=lambda item: _parse_display(item["date"]))
    for schedule_idx in range(len(schedule_by_date) - 1):
        current_item = schedule_by_date[schedule_idx]
        next_item = schedule_by_date[schedule_idx + 1]
        current_moment = _parse_display(current_item["date"])
        next_moment = _parse_display(next_item["date"])
        if (next_moment - current_moment).days != 1 or current_item["fellow"] != next_item["fellow"]:
            continue
        current_block = block_start_by_date.get(current_item["date"])
        next_block = block_start_by_date.get(next_item["date"])
        if current_block and current_block == next_block:
            continue
        is_allowed_consult_exception = (
            current_moment.weekday() == 0
            and next_moment.weekday() == 1
            and current_moment.strftime("%Y-%m") in exception_month_set
            and current_item["fellow"] == consult_by_month.get(current_moment.strftime("%Y-%m"))
        )
        if not is_allowed_consult_exception:
            consecutive_call_errors.append(
                f'{current_item["fellow"]} worked consecutive call days on {current_item["date"]} and {next_item["date"]}'
            )

    checks.extend([
        {
            "ok": len(missing) == 0,
            "label": "Coverage",
            "detail": "Every day has an assignment." if not missing else f"Missing dates: {', '.join(missing[:5])}",
            "suggestion": "" if not missing else "Adjust vacations, holiday-half dates, or exception months so every day has an assigned fellow.",
        },
        {
            "ok": len(research_run_errors) == 0,
            "label": "Research streaks",
            "detail": "No fellow has more than two consecutive research months." if not research_run_errors else " | ".join(research_run_errors[:3]),
            "suggestion": "" if not research_run_errors else "Swap one of the research months with imaging, cath, ACHD/EP, consult, or PCICU to break the streak.",
        },
        {
            "ok": len(major_holiday_errors) == 0,
            "label": "Major holiday blocks",
            "detail": "All major holiday halves stay together." if not major_holiday_errors else " | ".join(major_holiday_errors[:3]),
            "suggestion": "" if not major_holiday_errors else "Adjust the major holiday half dates or regenerate so each half stays with one fellow.",
        },
        {
            "ok": len(monday_errors) == 0,
            "label": "Consult Mondays",
            "detail": "All Mondays go to the consult fellow." if not monday_errors else " | ".join(monday_errors[:3]),
            "suggestion": "" if not monday_errors else "Change the monthly consult assignments or regenerate with fewer conflicting vacations.",
        },
        {
            "ok": len(tuesday_errors) == 0,
            "label": "Tuesday rule",
            "detail": "All Tuesdays follow the PCICU/consult rule." if not tuesday_errors else " | ".join(tuesday_errors[:3]),
            "suggestion": "" if not tuesday_errors else "Revisit the selected PCICU exception months or monthly PCICU/consult assignments.",
        },
        {
            "ok": len(weekend_errors) == 0,
            "label": "Weekend blocks",
            "detail": "All Friday-Sunday blocks stay together." if not weekend_errors else " | ".join(weekend_errors[:3]),
            "suggestion": "" if not weekend_errors else "Regenerate so each weekend or holiday block stays with a single fellow.",
        },
        {
            "ok": len(consecutive_weekend_errors) == 0,
            "label": "Consecutive weekends",
            "detail": "No fellow is assigned to back-to-back weekends." if not consecutive_weekend_errors else " | ".join(consecutive_weekend_errors[:3]),
            "suggestion": "" if not consecutive_weekend_errors else "Try different vacations or holiday-half dates so weekend coverage can be redistributed.",
        },
        {
            "ok": len(consecutive_call_errors) == 0,
            "label": "Consecutive call days",
            "detail": "No fellow is assigned to back-to-back call days outside allowed blocks." if not consecutive_call_errors else " | ".join(consecutive_call_errors[:3]),
            "suggestion": "" if not consecutive_call_errors else "Reduce conflicting vacations or adjust exception months so consecutive call can be reassigned.",
        },
        {
            "ok": len(consult_weekend_errors) == 0,
            "label": "Consult weekends",
            "detail": "Consult fellows are excluded from weekend call." if not consult_weekend_errors else " | ".join(consult_weekend_errors[:3]),
            "suggestion": "" if not consult_weekend_errors else "Move that fellow off consult in the affected month or relax other schedule pressure by adjusting vacations.",
        },
        {
            "ok": len(pcicu_weekend_errors) == 0,
            "label": "PCICU weekends",
            "detail": "PCICU fellows are excluded from weekend call in their PCICU month." if not pcicu_weekend_errors else " | ".join(pcicu_weekend_errors[:3]),
            "suggestion": "" if not pcicu_weekend_errors else "Adjust monthly PCICU assignments or vacation timing so weekends can be covered by a different fellow.",
        },
        {
            "ok": len(thursday_weekend_errors) == 0,
            "label": "Thursday to weekend",
            "detail": "No Thursday call fellow also takes the following weekend block, including holiday weekends." if not thursday_weekend_errors else " | ".join(thursday_weekend_errors[:3]),
            "suggestion": "" if not thursday_weekend_errors else "Reassign the Thursday call or the following weekend block to a different fellow.",
        },
        {
            "ok": True,
            "label": "Cath Thursdays",
            "detail": f"{len(cath_thursday_matches)} Thursday(s) matched the monthly cath fellow.",
        },
        {
            "ok": all(count == 1 for count in holiday_counts.values()),
            "label": "Holiday weekends",
            "detail": ", ".join(f'{item["label"]}: {item["fellow"]}' for item in holiday_weekends),
            "suggestion": "" if all(count == 1 for count in holiday_counts.values()) else "Regenerate so each fellow receives exactly one holiday weekend assignment.",
        },
        {
            "ok": all(major_holiday_counts.get(fellow) == 1 for fellow in fellows) and all(count == 2 for count in major_holiday_coverage_counts.values()),
            "label": "Major holidays",
            "detail": ", ".join(f'{item["label"]}: {item["fellow"]}' for item in major_holidays),
            "suggestion": "" if all(major_holiday_counts.get(fellow) == 1 for fellow in fellows) and all(count == 2 for count in major_holiday_coverage_counts.values()) else "Adjust the major holiday half dates or regenerate so each fellow receives exactly one major-holiday half and each holiday has two halves covered.",
        },
    ])

    return checks
