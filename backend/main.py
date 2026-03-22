import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional
from solver import generate_schedule

DATE_FMT = "%m/%d/%Y"
VALID_PGY = {"PGY-1", "PGY-2", "PGY-3"}
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
    fellows: list[str]
    start: str
    end: str
    vacations: Optional[dict[str, list[str]]] = {}
    holidays: Optional[dict[str, list[str]]] = {}
    pgy_years: dict[str, str]
    board_exam_fellows: Optional[list[str]] = []
    holiday_preferences: dict[str, dict[str, list[str]]]
    pcicu_exception_months: list[str]

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
            raise ValueError("PGY values must be one of: PGY-1, PGY-2, PGY-3")
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root() -> dict:
    return {"status": "backend running"}


@app.post("/schedule")
def create_schedule(req: ScheduleRequest) -> dict:
    start = parse_date(req.start)
    end = parse_date(req.end)

    if end <= start:
        raise HTTPException(
            status_code=400, detail="end date must be after start date"
        )

    vacations = parse_date_map(req.vacations)
    holidays = parse_date_map(req.holidays)

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
            holidays,
            req.pgy_years,
            req.board_exam_fellows,
            req.holiday_preferences,
            req.pcicu_exception_months,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return result
