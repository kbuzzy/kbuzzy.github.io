# Fellowship Scheduler

Fellowship Scheduler is a React + FastAPI application that now solves two linked problems at once:

- monthly clinical rotation assignment for a full academic year
- nightly call assignment driven by those monthly rotation assignments

## Fixed Program Structure

The current model assumes a single academic year from `07/01/2026` through `06/30/2027` and a fixed roster of 6 fellows:

- 2 `PGY-1` fellows
- 2 `PGY-2` fellows
- 2 `PGY-3` fellows

The frontend keeps that 2-2-2 PGY structure fixed, but you can edit each fellow's name directly.

## Rotation Types

The solver assigns one full-month daytime clinical rotation to every fellow for every calendar month.

Supported rotation types:

- `consult`
- `imaging`
- `research`
- `cath`
- `ACHD/EP`
- `PCICU`

Each monthly rotation lasts for the entire calendar month.

## Rotation Quotas by PGY

### PGY-1

- 3 months of consult
- 1 month of PCICU
- 4 months of cath
- 3 months of imaging
- 1 month of research
- 0 months of ACHD/EP

### PGY-2

- 2 months of consult
- 1 month of PCICU
- 1 month of cath
- 3 months of imaging
- 1 month of ACHD/EP
- 4 months of research

### PGY-3

- 1 month of consult
- 1 month of cath
- 1 month of imaging
- 1 month of PCICU
- 1 month of ACHD/EP
- 7 months of research

## Rotation Constraints

- Every fellow gets exactly one rotation per month.
- `consult`, `cath`, `PCICU`, and `ACHD/EP` are single-slot rotations.
- `imaging` and `research` may have multiple fellows in the same month.
- Both first-year fellows must be on `imaging` in `July 2026`.
- No fellow can repeat the same rotation in consecutive months.
- `research` is the only exception and may repeat in back-to-back months.
- Fellows can optionally be flagged as taking board certification exams in October.
- For October board exam takers, the solver prefers `imaging` or `research` in `October 2026` when feasible.
- Each fellow can rank major holidays and holiday weekends from most preferred to work to least preferred to work.
- Holiday preference approval is a soft objective that is weighted by seniority: `PGY-3` over `PGY-2` over `PGY-1`.

## Call Rules

Call is built after the monthly rotations are assigned.

- Friday-Sunday is one weekend call block.
- Six holiday weekends are special blocks and each fellow must receive exactly one of them.
- The same fellow must cover Friday, Saturday, and Sunday.
- If the holiday falls on a Friday, that holiday weekend expands to Thursday-Sunday.
- If the holiday falls between Saturday and Monday, that holiday weekend expands to Friday-Monday.
- Monday always goes to the monthly `consult` fellow.
- Tuesday usually goes to the monthly `PCICU` fellow.
- In 6 selected exception months, PICU covers Tuesday nights, so Tuesday instead goes to the monthly `consult` fellow.
- The consult fellow cannot take call on any other days besides Monday and the applicable Tuesday exception months.
- The consult fellow cannot take a Friday-Sunday weekend block in their consult month.
- Fellows who are on call Thursday night cannot also take the following non-holiday weekend.
- The monthly `cath` fellow is preferred on Thursday nights when feasible.

The six holiday weekends in the current academic year are:

- July 4
- Labor Day
- MLK Day
- Good Friday
- Memorial Day
- Juneteenth

For the `2026-2027` academic year, the default PICU-covered Tuesday exception months are:

- August 2026
- November 2026
- January 2027
- February 2027
- April 2027
- May 2027

## Weekend Quotas

Weekend totals are enforced exactly by PGY:

- `PGY-1`: 12 weekend blocks each
- `PGY-2`: 9 weekend blocks each
- `PGY-3`: 5 weekend blocks each

With two fellows in each class, those targets sum to 52 weekend blocks, which matches the academic year.

## Frontend Workflow

The React app lets you:

- rename each of the 6 fellows
- manage four default vacation weeks for each fellow
- mark any fellow as an October board-exam taker
- choose the 6 PICU-covered exception months for Tuesday-night call rules
- rank major holidays and holiday weekends for each fellow
- generate the full rotation + call schedule
- switch to a dedicated `Rules & Validation` tab that explains the scheduling model and lists the active validation checks
- review the solved monthly rotations in a table
- review the assigned holiday weekends
- review the call schedule in a calendar
- export the schedule as a monthly CSV

The `Rules & Validation` tab is also the place where schedule conflicts and validation failures are surfaced.

## API

The backend exposes:

- `GET /`
- `POST /schedule`

Example request:

```json
{
  "fellows": [
    "Alice Smith",
    "Brooke Jones",
    "Carla Lee",
    "Dana Patel",
    "Evan Kim",
    "Frank Wu"
  ],
  "start": "07/01/2026",
  "end": "06/30/2027",
  "vacations": {
    "Alice Smith": ["07/06/2026", "07/07/2026", "07/08/2026", "07/09/2026", "07/10/2026"]
  },
  "holidays": {},
  "pgy_years": {
    "Alice Smith": "PGY-1",
    "Brooke Jones": "PGY-1",
    "Carla Lee": "PGY-2",
    "Dana Patel": "PGY-2",
    "Evan Kim": "PGY-3",
    "Frank Wu": "PGY-3"
  },
  "board_exam_fellows": ["Alice Smith"],
  "holiday_preferences": {
    "Alice Smith": {
      "majorHolidays": ["Christmas", "Thanksgiving", "New Year's"],
      "holidayWeekends": ["Labor Day", "MLK Day", "July 4", "Good Friday", "Memorial Day", "Juneteenth"]
    }
  }
}
```

In a real request, `holiday_preferences` must be provided for every fellow. The example above is abbreviated for readability.

Example response shape:

```json
{
  "schedule": [
    { "date": "07/01/2026", "fellow": "Dana Patel" }
  ],
  "rotations": [
    { "month": "2026-07", "fellow": "Alice Smith", "rotation": "imaging" }
  ],
  "holiday_weekends": [
    { "label": "July 4", "start": "07/03/2026", "end": "07/06/2026", "fellow": "Brooke Jones" }
  ]
}
```

## Project Structure

```text
backend/
  main.py      FastAPI app and request validation
  solver.py    OR-Tools rotation + call model
frontend/
  src/App.js   Main React UI
```

## Running the Project

### Backend

From `/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend`:

```bash
source venv/bin/activate
uvicorn main:app --reload
```

### Frontend

From `/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend`:

```bash
npm install
npm start
```

The frontend defaults to `http://127.0.0.1:8000` for the API.

## GitHub Pages Deployment

This repository is now packaged for GitHub Pages deployment of the React frontend.

Important limitation:

- GitHub Pages can host the frontend only.
- The FastAPI solver backend cannot run on `github.io`.
- To make the deployed page generate schedules, you must host the backend elsewhere and provide its URL as `REACT_APP_API_URL` in the GitHub repository's Actions variables.

Prepared deployment pieces:

- [`frontend/package.json`](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/package.json) sets `homepage` to `https://kbuzzy.github.io`
- [`/.github/workflows/deploy-pages.yml`](/Users/kilianburke/Desktop/fellowship-scheduler-clean/.github/workflows/deploy-pages.yml) builds and deploys the frontend to Pages
- [`/.gitignore`](/Users/kilianburke/Desktop/fellowship-scheduler-clean/.gitignore) ignores local build and environment artifacts

Suggested repository target:

- `git@github.com:kbuzzy/kbuzzy.github.io.git`

Suggested push flow:

```bash
git init
git branch -M main
git remote add origin git@github.com:kbuzzy/kbuzzy.github.io.git
git add .
git commit -m "Prepare Fellowship Scheduler for GitHub Pages"
git push -u origin main
```

After pushing:

1. Create a repository variable named `REACT_APP_API_URL` in GitHub Actions settings if you have a hosted backend.
2. In the repository's Pages settings, ensure GitHub Actions is the publishing source.
3. The site will publish at `https://kbuzzy.github.io`.

## Render Backend Setup

This repo now includes Render-ready backend files:

- [`backend/requirements.txt`](/Users/kilianburke/Desktop/fellowship-scheduler-clean/backend/requirements.txt)
- [`render.yaml`](/Users/kilianburke/Desktop/fellowship-scheduler-clean/render.yaml)

Recommended setup on Render:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint service from the repo, or create a Python Web Service manually.
3. If you use the included `render.yaml`, Render will auto-configure:
   - `rootDir`: `backend`
   - build command: `pip install -r requirements.txt`
   - start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. After the Render deploy succeeds, copy the backend URL such as `https://fellowship-scheduler-backend.onrender.com`.
5. In the GitHub repo for the frontend, set the Actions variable `REACT_APP_API_URL` to that Render backend URL.

The backend now reads `ALLOWED_ORIGINS` and defaults to:

- `http://localhost:3000`
- `https://kbuzzy.github.io`

If you later use a custom frontend domain, add it to the Render `ALLOWED_ORIGINS` environment variable.

## Local Auto-Push Watcher

This repo also includes a simple local file watcher:

- [`scripts/auto_push_watcher.py`](/Users/kilianburke/Desktop/fellowship-scheduler-clean/scripts/auto_push_watcher.py)

It polls the repository for file changes, then automatically:

- stages changes with `git add -A`
- creates a commit with a timestamped message
- pushes to the current branch remote

Excluded paths include:

- `.git`
- `backend/venv`
- `backend/__pycache__`
- `frontend/node_modules`
- `frontend/build`

Run it with:

```bash
cd /Users/kilianburke/Desktop/fellowship-scheduler-clean
python3 scripts/auto_push_watcher.py
```

Optional environment variables:

```bash
AUTO_PUSH_INTERVAL_SECONDS=5
AUTO_PUSH_DEBOUNCE_SECONDS=10
AUTO_PUSH_MESSAGE_PREFIX="Auto-update"
```

Use this carefully: it will commit and push changes automatically after the debounce window.
