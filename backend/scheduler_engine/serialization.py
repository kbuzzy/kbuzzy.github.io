from datetime import datetime, timedelta

from .calendar_rules import idx, parse_iso
from .constants import HOLIDAY_WEEKENDS


def _build_holiday_date_set(major_half_info: list[dict]) -> set[int]:
    holiday_dates = set()
    for start_iso, info in HOLIDAY_WEEKENDS.items():
        start_dt = parse_iso(start_iso)
        end_dt = parse_iso(info["end"])
        current = start_dt
        while current <= end_dt:
            holiday_dates.add(current.toordinal())
            current += timedelta(days=1)

    for info in major_half_info:
        start_dt = parse_iso(info["start"])
        end_dt = parse_iso(info["end"])
        current = start_dt
        while current <= end_dt:
            holiday_dates.add(current.toordinal())
            current += timedelta(days=1)
    return holiday_dates


def _call_metadata_for_date(date: datetime, exception_months: set[str], holiday_ordinals: set[int]) -> tuple[str, bool]:
    if date.toordinal() in holiday_ordinals:
        return "Holiday Call", False

    weekday = date.weekday()
    month = date.strftime("%Y-%m")
    if weekday == 1:
        is_in_house = month not in exception_months
        return ("In-House Call" if is_in_house else "Home Call"), is_in_house
    if weekday in (2, 3):
        return "In-House Call", True
    return "Home Call", False


def serialize_solution(
    solver,
    fellows: list[str],
    start_date: datetime,
    days: int,
    call: dict,
    rotation: dict,
    rotation_index: dict[str, int],
    major_half_info: list[dict],
    exception_months: set[str],
    month_keys: list[str],
) -> dict:
    holiday_ordinals = _build_holiday_date_set(major_half_info)
    schedule = []
    for day_idx in range(days):
        date = start_date + timedelta(days=day_idx)
        call_type, is_in_house = _call_metadata_for_date(date, exception_months, holiday_ordinals)
        for fellow_idx in range(len(fellows)):
            if solver.value(call[(fellow_idx, day_idx)]) == 1:
                schedule.append(
                    {
                        "date": date.strftime("%m/%d/%Y"),
                        "fellow": fellows[fellow_idx],
                        "call_type": call_type,
                        "is_in_house": is_in_house,
                    }
                )

    rotations = []
    for month_idx, month in enumerate(month_keys):
        for fellow_idx in range(len(fellows)):
            for rotation_name, rotation_slot in rotation_index.items():
                if solver.value(rotation[(fellow_idx, month_idx, rotation_slot)]) == 1:
                    rotations.append({"month": month, "fellow": fellows[fellow_idx], "rotation": rotation_name})

    holiday_weekends = []
    for start_iso, info in HOLIDAY_WEEKENDS.items():
        start_idx = idx(parse_iso(start_iso), start_date)
        assigned_fellow = None
        for fellow_idx in range(len(fellows)):
            if solver.value(call[(fellow_idx, start_idx)]) == 1:
                assigned_fellow = fellows[fellow_idx]
                break
        holiday_weekends.append(
            {
                "label": info["label"],
                "start": parse_iso(info["start"]).strftime("%m/%d/%Y"),
                "end": parse_iso(info["end"]).strftime("%m/%d/%Y"),
                "fellow": assigned_fellow,
            }
        )

    major_holidays_results = []
    for info in major_half_info:
        assigned_fellow = None
        for fellow_idx in range(len(fellows)):
            if solver.value(call[(fellow_idx, info["start_idx"])]) == 1:
                assigned_fellow = fellows[fellow_idx]
                break
        major_holidays_results.append(
            {
                "holiday": info["holiday"],
                "label": info["label"],
                "start": parse_iso(info["start"]).strftime("%m/%d/%Y"),
                "end": parse_iso(info["end"]).strftime("%m/%d/%Y"),
                "fellow": assigned_fellow,
            }
        )

    return {
        "schedule": schedule,
        "rotations": rotations,
        "holiday_weekends": holiday_weekends,
        "major_holidays": major_holidays_results,
    }
