from .academic_year import build_month_keys, default_exception_tuesday_months
from .year_config import CURRENT_ACADEMIC_YEAR_CONFIG

MAX_SOLVER_SECONDS = 60
OCTOBER_BOARD_WEIGHT = 10
CATH_THURSDAY_WEIGHT = 2
DIFFICULT_ROTATION_STREAK_WEIGHT = 3
PGY_PREFERENCE_WEIGHTS = {"PGY-4": 1, "PGY-5": 2, "PGY-6": 3}

MONTH_KEYS = build_month_keys(CURRENT_ACADEMIC_YEAR_CONFIG["start_year"])
DEFAULT_EXCEPTION_TUESDAY_MONTHS = default_exception_tuesday_months(CURRENT_ACADEMIC_YEAR_CONFIG["start_year"])
ROTATIONS = ["consult", "imaging", "research", "cath", "achd_ep", "pcicu"]
PGY_WEEKEND_TARGETS = {"PGY-4": 12, "PGY-5": 9, "PGY-6": 5}
PGY_ROTATION_TARGETS = {
    "PGY-4": {"consult": 3, "pcicu": 1, "cath": 4, "imaging": 3, "research": 1, "achd_ep": 0},
    "PGY-5": {"consult": 2, "pcicu": 1, "cath": 1, "imaging": 3, "research": 4, "achd_ep": 1},
    "PGY-6": {"consult": 1, "pcicu": 1, "cath": 1, "imaging": 1, "research": 7, "achd_ep": 1},
}
REQUIRED_PGY_COUNTS = {"PGY-4": 2, "PGY-5": 2, "PGY-6": 2}
HOLIDAY_WEEKENDS = CURRENT_ACADEMIC_YEAR_CONFIG["holiday_weekends"]
DEFAULT_MAJOR_HOLIDAYS = CURRENT_ACADEMIC_YEAR_CONFIG["major_holidays"]
DIFFICULT_ROTATIONS = ("consult", "cath", "pcicu")
