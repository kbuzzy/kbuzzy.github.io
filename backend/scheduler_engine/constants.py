MAX_SOLVER_SECONDS = 60
OCTOBER_BOARD_WEIGHT = 10
CATH_THURSDAY_WEIGHT = 2
DIFFICULT_ROTATION_STREAK_WEIGHT = 3
PGY_PREFERENCE_WEIGHTS = {"PGY-4": 1, "PGY-5": 2, "PGY-6": 3}

MONTH_KEYS = [
    "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
    "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06",
]
DEFAULT_EXCEPTION_TUESDAY_MONTHS = {
    "2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05",
}
ROTATIONS = ["consult", "imaging", "research", "cath", "achd_ep", "pcicu"]
PGY_WEEKEND_TARGETS = {"PGY-4": 12, "PGY-5": 9, "PGY-6": 5}
PGY_ROTATION_TARGETS = {
    "PGY-4": {"consult": 3, "pcicu": 1, "cath": 4, "imaging": 3, "research": 1, "achd_ep": 0},
    "PGY-5": {"consult": 2, "pcicu": 1, "cath": 1, "imaging": 3, "research": 4, "achd_ep": 1},
    "PGY-6": {"consult": 1, "pcicu": 1, "cath": 1, "imaging": 1, "research": 7, "achd_ep": 1},
}
REQUIRED_PGY_COUNTS = {"PGY-4": 2, "PGY-5": 2, "PGY-6": 2}
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
DIFFICULT_ROTATIONS = ("consult", "cath", "pcicu")
