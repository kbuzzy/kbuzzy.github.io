# Fellowship Scheduler

Fellowship Scheduler is a React + FastAPI application for generating a full academic year of pediatric cardiology fellowship rotations and call assignments.

The current codebase is organized around a backend scheduling engine that owns the core rules and a frontend that focuses on configuration, visualization, and exports.

## Scheduling Model

The solver currently supports one fixed academic year:

- `07/01/2026` through `06/30/2027`

The roster is also fixed at six fellows:

- 2 first-year fellows (`PGY-4`)
- 2 second-year fellows (`PGY-5`)
- 2 third-year fellows (`PGY-6`)

Here, `PGY-4`, `PGY-5`, and `PGY-6` correspond to first-, second-, and third-year fellowship.

The backend solves two linked problems:

1. monthly daytime rotation assignments
2. nightly/weekend/holiday call assignments constrained by those rotations

## Core Rules

### Rotations

Supported monthly rotations:

- `consult`
- `imaging`
- `research`
- `cath`
- `achd_ep`
- `pcicu`

High-level rotation rules:

- Every fellow receives exactly one rotation per month.
- `consult`, `cath`, `pcicu`, and `achd_ep` are single-slot monthly assignments.
- `imaging` and `research` can hold multiple fellows in the same month.
- Both `PGY-4` fellows must be on imaging in July 2026.
- Non-research rotations cannot repeat in consecutive months.
- Research can repeat, but no fellow may have more than two consecutive research months.
- October board exam fellows are biased toward lighter October rotations when feasible.

### Call

High-level call rules:

- Friday-Sunday is one weekend block.
- Holiday weekends are treated as special multi-day blocks.
- Major holidays are split into two half-blocks.
- Mondays go to the monthly consult fellow.
- Tuesdays usually go to the monthly PCICU fellow.
- In six selected exception months, Tuesday instead goes to the monthly consult fellow.
- Consult fellows are excluded from other call in their consult month.
- PCICU fellows cannot take weekend or holiday-weekend call in their PCICU month.
- No one can work back-to-back call days outside allowed block exceptions.
- Weekend blocks must stay with one fellow.
- No fellow can work consecutive weekends.
- Thursday call cannot flow directly into that same fellow taking the following weekend block.

Important call classification detail:

- Holiday call is not counted as in-house call.
- In-house call refers to routine Tuesday, Wednesday, and Thursday in-house nights, not holiday assignments.

## Backend API

The backend exposes:

- `GET /`
- `POST /schedule`

`POST /schedule` accepts a scheduling request with:

- `fellows`
- `start`
- `end`
- `vacations`
- `holidays`
- `pgy_years`
- `board_exam_fellows`
- `holiday_preferences`
- `major_holiday_blocks`
- `pcicu_exception_months`
- `solver_seed` (optional)

The response includes:

- `schedule`
- `rotations`
- `holiday_weekends`
- `major_holidays`
- `validation`

Each `schedule` item now includes backend-owned call metadata:

- `date`
- `fellow`
- `call_type`
- `is_in_house`

This lets the frontend render and summarize call without re-deriving those semantics from dates.

## Codebase Structure

### Backend

The backend entrypoint is [backend/main.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/main.py). It handles request validation, CORS, and calls into the scheduling engine.

The scheduling engine lives in [backend/scheduler_engine](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/scheduler_engine):

- [constants.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/scheduler_engine/constants.py): fixed academic-year constants, quotas, holiday definitions, and PGY targets
- [calendar_rules.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/scheduler_engine/calendar_rules.py): input validation, holiday normalization, and block construction
- [rotation_rules.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/scheduler_engine/rotation_rules.py): monthly rotation constraints and helper logic
- [objective.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/scheduler_engine/objective.py): fairness and preference objective construction
- [serialization.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/scheduler_engine/serialization.py): schedule, rotation, holiday, and call metadata serialization
- [validation.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/scheduler_engine/validation.py): backend-owned post-solve validation checks
- [engine.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/scheduler_engine/engine.py): overall OR-Tools model setup and solve orchestration

[backend/solver.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/solver.py) remains as the compatibility import surface for `generate_schedule`.

### Frontend

The React app lives under [frontend/src](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src):

- [App.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/App.js): page shell and high-level composition
- [hooks/useScheduler.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/hooks/useScheduler.js): schedule orchestration, API requests, retries, persistence, and exports
- [components/FormSections.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/components/FormSections.js): scheduler input controls
- [components/ResultSections.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/components/ResultSections.js): solved schedule, validation, and results display
- [config/schedule.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/config/schedule.js): defaults, API URL, and initial roster configuration
- [utils/schedule.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/utils/schedule.js): schedule shaping, defaults, and frontend date helpers
- [utils/validation.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/utils/validation.js): client-side validation fallback when backend validation is unavailable
- [utils/exportWorkbook.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/utils/exportWorkbook.js): Excel export generation

## Validation Ownership

The backend is the source of truth for solved-schedule validation.

The `/schedule` response includes a `validation` array that the frontend displays directly. The frontend still has a fallback validator for resilience, but new rule changes should be implemented on the backend first.

## Test Structure

Backend tests are split into fast unit tests and slower solve-backed regression tests.

Unit tests:

- [backend/tests/unit/test_calendar_rules.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/tests/unit/test_calendar_rules.py)
- [backend/tests/unit/test_serialization.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/tests/unit/test_serialization.py)
- [backend/tests/unit/test_validation.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/tests/unit/test_validation.py)

Integration regression tests:

- [backend/tests/integration/test_schedule_regression.py](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/tests/integration/test_schedule_regression.py)

Frontend tests:

- [frontend/src/utils/schedule.test.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/utils/schedule.test.js)
- [frontend/src/App.test.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/App.test.js)

Recommended commands:

```bash
# Backend fast unit tests
backend/venv/bin/python -m unittest discover -s backend/tests/unit -v

# Backend full-year regression tests
backend/venv/bin/python -m unittest discover -s backend/tests/integration -v

# Frontend tests
cd frontend
npm test -- --watch=false
```

## Running Locally

### Backend

From [backend](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend):

```bash
source venv/bin/activate
uvicorn main:app --reload
```

The backend defaults to allowing:

- `http://localhost:3000`
- `https://kbuzzy.github.io`

You can override this with the `ALLOWED_ORIGINS` environment variable.

### Frontend

From [frontend](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend):

```bash
npm install
npm start
```

The frontend reads its API configuration from [frontend/src/config/schedule.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/config/schedule.js).

## Deployment Notes

The frontend can be deployed separately from the backend.

Important limitation:

- GitHub Pages can host the React frontend only.
- The FastAPI scheduling backend must run on a separate host such as Render.
