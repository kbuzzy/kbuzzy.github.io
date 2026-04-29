import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from datetime import datetime, timedelta
from typing import Optional
from solver import generate_schedule

DATE_FMT = "%m/%d/%Y"
VALID_PGY = {"PGY-4", "PGY-5", "PGY-6"}
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://kbuzzy.github.io",
]

app = FastAPI(title="Fellowship Scheduler API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS)).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ScheduleRequest(BaseModel):
    # This schema mirrors the frontend payload closely so invalid schedule
    # setups can be rejected before they reach the OR-Tools model.
    fellows: list[str]
    start: str
    end: str
    vacations: Optional[dict[str, list[str]]] = Field(default_factory=dict)
    call_avoid_requests: Optional[dict[str, list[str]]] = Field(default_factory=dict)
    holidays: Optional[dict[str, list[str]]] = Field(default_factory=dict)
    pgy_years: dict[str, str]
    board_exam_fellows: Optional[list[str]] = Field(default_factory=list)
    holiday_preferences: dict[str, dict]
    major_holiday_blocks: Optional[dict[str, list[dict[str, str]]]] = None
    conference_blocks: Optional[dict[str, dict[str, str]]] = None
    pcicu_exception_months: list[str]
    solver_seed: Optional[int] = None

    @field_validator("fellows")
    @classmethod
    def fellows_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("fellows list must not be empty")
        if any(not name.strip() for name in v):
            raise ValueError("fellow names must not be blank")
        if len(v) != len(set(v)):
            raise ValueError("fellow names must be unique")
        return v

    @field_validator("start", "end")
    @classmethod
    def valid_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, DATE_FMT)
        except ValueError:
            raise ValueError(f"date must be in {DATE_FMT} format, got: {v!r}")
        return v

    @field_validator("pgy_years")
    @classmethod
    def valid_pgy_years(cls, v: dict[str, str]) -> dict[str, str]:
        bad = [name for name, pgy in v.items() if pgy not in VALID_PGY]
        if bad:
            raise ValueError("PGY values must be one of: PGY-4, PGY-5, PGY-6")
        return v


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_date(s: str) -> datetime:
    return datetime.strptime(s, DATE_FMT)


def parse_date_list(dates: list[str]) -> list[datetime]:
    return [parse_date(d) for d in dates]


def parse_date_map(mapping: dict[str, list[str]]) -> dict[str, list[datetime]]:
    return {k: parse_date_list(v) for k, v in mapping.items()}


def format_date_range(dates: list[datetime]) -> str:
    if not dates:
        return ""
    ordered = sorted(dates)
    if ordered[0] == ordered[-1]:
        return ordered[0].strftime(DATE_FMT)
    return f"{ordered[0].strftime(DATE_FMT)}-{ordered[-1].strftime(DATE_FMT)}"


def consecutive_ranges(dates: list[datetime]) -> list[list[datetime]]:
    ranges: list[list[datetime]] = []
    for date in sorted(set(dates)):
        if not ranges or date != ranges[-1][-1] + timedelta(days=1):
            ranges.append([date])
        else:
            ranges[-1].append(date)
    return ranges


def expand_iso_or_display_range(start: str, end: str) -> list[datetime]:
    def parse_flexible(value: str) -> datetime:
        for fmt in (DATE_FMT, "%Y-%m-%d"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        raise ValueError(f"date must be in {DATE_FMT} or YYYY-MM-DD format, got: {value!r}")

    current = parse_flexible(start)
    last = parse_flexible(end)
    dates = []
    while current <= last:
        dates.append(current)
        current += timedelta(days=1)
    return dates


def build_infeasibility_hints(req: ScheduleRequest, start: datetime, end: datetime) -> list[str]:
    hints: list[str] = []
    vacations = parse_date_map(req.vacations)

    out_of_window = []
    for fellow, dates in vacations.items():
        for vacation_range in consecutive_ranges(dates):
            if vacation_range[0] < start or vacation_range[-1] > end:
                out_of_window.append(f"{fellow} {format_date_range(vacation_range)}")
    if out_of_window:
        hints.append(
            "Vacation dates outside the academic year are present and should be removed or corrected: "
            + "; ".join(out_of_window[:4])
            + ("." if len(out_of_window) <= 4 else "; ...")
        )

    vacation_sets = {fellow: set(dates) for fellow, dates in vacations.items()}
    fellows_by_pgy: dict[str, list[str]] = {}
    for fellow, pgy in req.pgy_years.items():
        fellows_by_pgy.setdefault(pgy, []).append(fellow)

    for pgy, fellows in fellows_by_pgy.items():
        for index, first in enumerate(fellows):
            for second in fellows[index + 1:]:
                overlap = sorted(vacation_sets.get(first, set()).intersection(vacation_sets.get(second, set())))
                weekday_overlap = [date for date in overlap if date.weekday() < 5]
                if len(weekday_overlap) >= 3:
                    hints.append(
                        f"{first} and {second} are both {pgy} and are simultaneously on vacation for "
                        f"{format_date_range(weekday_overlap)}. Same-PGY vacation overlap can make the "
                        "fixed rotation and weekday-call rules infeasible."
                    )

    major_blocks = req.major_holiday_blocks or {}
    for holiday, halves in major_blocks.items():
        for half in halves:
            block_dates = set(expand_iso_or_display_range(half.get("start", ""), half.get("end", "")))
            label = half.get("label") or holiday
            unavailable = [
                fellow
                for fellow, date_set in vacation_sets.items()
                if date_set.intersection(block_dates)
            ]
            if unavailable:
                hints.append(
                    f"{label} overlaps vacation dates for {', '.join(unavailable)}; those fellows cannot cover that hard holiday half."
                )

    return hints[:6]


def vacation_overlap_errors(vacations: dict[str, list[datetime]]) -> list[str]:
    fellows_by_date: dict[datetime, list[str]] = {}
    for fellow, dates in vacations.items():
        for date in set(dates):
            fellows_by_date.setdefault(date, []).append(fellow)

    errors = []
    for date, fellows in sorted(fellows_by_date.items()):
        if len(fellows) > 2:
            errors.append(f"{date.strftime(DATE_FMT)}: {', '.join(sorted(fellows))}")
    return errors


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root() -> dict:
    return {"status": "backend running"}


@app.post("/schedule")
def create_schedule(req: ScheduleRequest) -> dict:
    # Route-level validation covers malformed requests and mismatched roster
    # metadata; deeper feasibility rules are enforced inside `generate_schedule`.
    start = parse_date(req.start)
    end = parse_date(req.end)

    if end <= start:
        raise HTTPException(
            status_code=400, detail="end date must be after start date"
        )

    vacations = parse_date_map(req.vacations)
    call_avoid_requests = parse_date_map(req.call_avoid_requests)
    holidays = parse_date_map(req.holidays)

    overlap_errors = vacation_overlap_errors(vacations)
    if overlap_errors:
        raise HTTPException(
            status_code=400,
            detail=(
                "no more than two fellows can be on vacation on the same date. "
                "Choose alternative vacation weeks for: "
                + " | ".join(overlap_errors[:5])
            ),
        )

    missing_pgy = [name for name in req.fellows if name not in req.pgy_years]
    if missing_pgy:
        raise HTTPException(
            status_code=400,
            detail=f"missing PGY assignment for: {', '.join(missing_pgy)}",
        )

    extra_pgy = [name for name in req.pgy_years if name not in req.fellows]
    if extra_pgy:
        raise HTTPException(
            status_code=400,
            detail=f"PGY assignments provided for unknown fellows: {', '.join(extra_pgy)}",
        )

    unknown_board_fellows = [name for name in req.board_exam_fellows if name not in req.fellows]
    if unknown_board_fellows:
        raise HTTPException(
            status_code=400,
            detail=f"board exam fellows must be included in fellows: {', '.join(unknown_board_fellows)}",
        )

    missing_preferences = [name for name in req.fellows if name not in req.holiday_preferences]
    if missing_preferences:
        raise HTTPException(
            status_code=400,
            detail=f"missing holiday preferences for: {', '.join(missing_preferences)}",
        )

    unknown_call_avoid_fellows = [name for name in req.call_avoid_requests if name not in req.fellows]
    if unknown_call_avoid_fellows:
        raise HTTPException(
            status_code=400,
            detail=f"call_avoid_requests provided for unknown fellows: {', '.join(unknown_call_avoid_fellows)}",
        )

    if len(set(req.pcicu_exception_months)) != len(req.pcicu_exception_months):
        raise HTTPException(
            status_code=400,
            detail="pcicu_exception_months must not contain duplicates",
        )

    try:
        result = generate_schedule(
            req.fellows,
            start,
            end,
            vacations,
            call_avoid_requests,
            holidays,
            req.pgy_years,
            req.board_exam_fellows,
            req.holiday_preferences,
            req.major_holiday_blocks,
            req.conference_blocks,
            req.pcicu_exception_months,
            req.solver_seed,
        )
    except Exception as exc:
        detail = str(exc)
        if "No feasible schedule found" in detail:
            hints = build_infeasibility_hints(req, start, end)
            if hints:
                detail = detail + " Likely hard-constraint pressure points: " + " ".join(hints)
            else:
                detail = detail + " The full CP-SAT model was solved and reported infeasible, but no simple preflight conflict was detected."
        raise HTTPException(status_code=422, detail=detail)

    return result
