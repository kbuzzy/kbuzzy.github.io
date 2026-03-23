from datetime import datetime, timedelta

from .calendar_rules import idx, parse_iso
from .constants import HOLIDAY_WEEKENDS, MONTH_KEYS


def serialize_solution(
    solver,
    fellows: list[str],
    start_date: datetime,
    days: int,
    call: dict,
    rotation: dict,
    rotation_index: dict[str, int],
    major_half_info: list[dict],
) -> dict:
    schedule = []
    for day_idx in range(days):
        date = start_date + timedelta(days=day_idx)
        for fellow_idx in range(len(fellows)):
            if solver.value(call[(fellow_idx, day_idx)]) == 1:
                schedule.append({"date": date.strftime("%m/%d/%Y"), "fellow": fellows[fellow_idx]})

    rotations = []
    for month_idx, month in enumerate(MONTH_KEYS):
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
