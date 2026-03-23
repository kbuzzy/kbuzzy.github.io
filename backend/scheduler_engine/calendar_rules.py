from datetime import datetime, timedelta

from .academic_year import academic_year_start_year, build_month_keys, default_exception_tuesday_months
from .constants import (
    DEFAULT_MAJOR_HOLIDAYS,
    HOLIDAY_WEEKENDS,
    PGY_ROTATION_TARGETS,
    PGY_WEEKEND_TARGETS,
    REQUIRED_PGY_COUNTS,
)


def idx(date: datetime, start: datetime) -> int:
    return (date - start).days


def month_key(date: datetime) -> str:
    return date.strftime("%Y-%m")


def parse_iso(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d")


def normalize_major_holidays(major_holiday_blocks: dict | None) -> dict[str, list[dict[str, str]]]:
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
        for half_idx, half in enumerate(halves):
            start = half.get("start")
            end = half.get("end")
            if not start or not end:
                raise ValueError(f"{holiday} holiday halves must include start and end dates")
            start_dt = parse_iso(start)
            end_dt = parse_iso(end)
            if end_dt < start_dt:
                raise ValueError(f"{holiday} holiday half end must be on or after the start date")
            normalized_halves.append(
                {
                    "label": default_halves[half_idx]["label"],
                    "start": start_dt.strftime("%Y-%m-%d"),
                    "end": end_dt.strftime("%Y-%m-%d"),
                }
            )
        normalized[holiday] = normalized_halves
    return normalized


def validate_schedule_inputs(
    fellows: list[str],
    start_date: datetime,
    end_date: datetime,
    pgy_years: dict[str, str],
    holiday_preferences: dict[str, dict[str, list[str]]],
    major_holiday_blocks: dict | None,
    pcicu_exception_months: list[str],
) -> tuple[dict[str, list[dict[str, str]]], set[str]]:
    if len(fellows) != 6:
        raise ValueError("the schedule must include exactly 6 fellows")
    start_year = academic_year_start_year(start_date, end_date)
    month_keys = build_month_keys(start_year)

    if not pcicu_exception_months:
        pcicu_exception_months = sorted(default_exception_tuesday_months(start_year))
    exception_tuesday_months = set(pcicu_exception_months)
    if len(exception_tuesday_months) != 6:
        raise ValueError("exactly 6 PCICU exception months must be selected")
    invalid_exception_months = exception_tuesday_months.difference(month_keys)
    if invalid_exception_months:
        raise ValueError("pcicu exception months must fall within the academic year window")

    pgy_counts = {pgy: 0 for pgy in REQUIRED_PGY_COUNTS}
    for fellow in fellows:
        pgy = pgy_years.get(fellow)
        if pgy not in PGY_ROTATION_TARGETS:
            raise ValueError("each fellow must have a valid PGY value of PGY-4, PGY-5, or PGY-6")
        pgy_counts[pgy] += 1
    for pgy, required in REQUIRED_PGY_COUNTS.items():
        if pgy_counts[pgy] != required:
            raise ValueError("the roster must include exactly two fellows in each of PGY-4, PGY-5, and PGY-6")

    major_holidays = normalize_major_holidays(major_holiday_blocks)
    expected_major = set(major_holidays)
    expected_weekends = {info["label"] for info in HOLIDAY_WEEKENDS.values()}
    for fellow in fellows:
        prefs = holiday_preferences.get(fellow)
        if not prefs:
            raise ValueError(f"missing holiday preferences for {fellow}")
        major_list = prefs.get("majorHolidays", [])
        weekend_list = prefs.get("holidayWeekends", [])
        if set(major_list) != expected_major or len(major_list) != len(expected_major):
            raise ValueError(f"{fellow} must rank each major holiday exactly once")
        if set(weekend_list) != expected_weekends or len(weekend_list) != len(expected_weekends):
            raise ValueError(f"{fellow} must rank each holiday weekend exactly once")

    return major_holidays, exception_tuesday_months


def build_call_blocks(start_date: datetime, end_date: datetime, major_holidays: dict[str, list[dict[str, str]]]) -> dict:
    days = (end_date - start_date).days + 1
    block_starts: list[int] = []
    block_days_by_start: dict[int, list[int]] = {}
    holiday_block_starts: set[int] = set()
    weekend_block_starts: set[int] = set()
    major_block_starts: set[int] = set()
    covered_block_days: set[int] = set()
    major_half_info: list[dict] = []

    for start_iso, info in HOLIDAY_WEEKENDS.items():
        start_dt = parse_iso(start_iso)
        end_dt = parse_iso(info["end"])
        start_idx = idx(start_dt, start_date)
        end_idx = idx(end_dt, start_date)
        days_in_block = list(range(start_idx, end_idx + 1))
        block_starts.append(start_idx)
        block_days_by_start[start_idx] = days_in_block
        holiday_block_starts.add(start_idx)
        weekend_block_starts.add(start_idx)
        covered_block_days.update(days_in_block)

    weekend_credit_major_starts: set[int] = set()
    for holiday_label, halves in major_holidays.items():
        for half in halves:
            start_dt = parse_iso(half["start"])
            end_dt = parse_iso(half["end"])
            if start_dt < start_date or end_dt > end_date:
                raise ValueError(f"{holiday_label} holiday halves must fall within the academic year window")
            start_idx = idx(start_dt, start_date)
            end_idx = idx(end_dt, start_date)
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

    for day_idx in range(days):
        date = start_date + timedelta(days=day_idx)
        if date.weekday() != 4 or day_idx in covered_block_days:
            continue
        if day_idx + 2 >= days:
            continue
        days_in_block = [day_idx, day_idx + 1, day_idx + 2]
        block_starts.append(day_idx)
        block_days_by_start[day_idx] = days_in_block
        weekend_block_starts.add(day_idx)
        covered_block_days.update(days_in_block)

    if len(weekend_block_starts) != 49:
        raise ValueError("expected exactly 49 weekend call blocks after carving out major holiday halves")
    if len(major_half_info) != 6:
        raise ValueError("expected exactly 6 major holiday half-blocks in the academic year window")
    if len(weekend_block_starts) + len(weekend_credit_major_starts) != sum(
        PGY_WEEKEND_TARGETS[pgy] * REQUIRED_PGY_COUNTS[pgy]
        for pgy in REQUIRED_PGY_COUNTS
    ):
        raise ValueError("weekend coverage implied by the configured major holiday halves does not match the required annual weekend totals")

    return {
        "block_starts": block_starts,
        "block_days_by_start": block_days_by_start,
        "holiday_block_starts": holiday_block_starts,
        "weekend_block_starts": weekend_block_starts,
        "major_block_starts": major_block_starts,
        "covered_block_days": covered_block_days,
        "major_half_info": major_half_info,
        "weekend_credit_major_starts": weekend_credit_major_starts,
    }
