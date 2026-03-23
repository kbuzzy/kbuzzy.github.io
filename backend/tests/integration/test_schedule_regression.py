import copy
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scheduler_engine import generate_schedule
from scheduler_engine.validation import build_validation


FELLOWS = ["Deepthi", "Amitie", "Rijutha", "Jeffery", "Jordan", "Kilian"]
PGY_YEARS = {
    "Deepthi": "PGY-4",
    "Amitie": "PGY-4",
    "Rijutha": "PGY-5",
    "Jeffery": "PGY-5",
    "Jordan": "PGY-6",
    "Kilian": "PGY-6",
}
BOARD_EXAM_FELLOWS = ["Deepthi", "Amitie"]
HOLIDAY_PREFERENCES = {
    fellow: {
        "majorHolidays": ["Thanksgiving", "Christmas", "New Year's"],
        "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
    }
    for fellow in FELLOWS
}
MAJOR_HOLIDAY_BLOCKS = {
    "Thanksgiving": [{"start": "2026-11-25", "end": "2026-11-26"}, {"start": "2026-11-27", "end": "2026-11-29"}],
    "Christmas": [{"start": "2026-12-22", "end": "2026-12-24"}, {"start": "2026-12-25", "end": "2026-12-27"}],
    "New Year's": [{"start": "2026-12-28", "end": "2026-12-30"}, {"start": "2026-12-31", "end": "2027-01-03"}],
}
EXCEPTION_MONTHS = ["2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05"]


def check_by_label(checks, label):
    return next(check for check in checks if check["label"] == label)


class ScheduleRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.start_date = datetime.strptime("07/01/2026", "%m/%d/%Y")
        cls.end_date = datetime.strptime("06/30/2027", "%m/%d/%Y")
        cls.result = generate_schedule(
            fellows=FELLOWS,
            start_date=cls.start_date,
            end_date=cls.end_date,
            vacations={fellow: [] for fellow in FELLOWS},
            holidays={},
            pgy_years=PGY_YEARS,
            board_exam_fellows=BOARD_EXAM_FELLOWS,
            holiday_preferences=HOLIDAY_PREFERENCES,
            major_holiday_blocks=MAJOR_HOLIDAY_BLOCKS,
            pcicu_exception_months=EXCEPTION_MONTHS,
            solver_seed=7,
        )

    def test_generated_schedule_passes_key_validation_checks(self):
        checks = self.result["validation"]
        self.assertTrue(check_by_label(checks, "Consult Mondays")["ok"])
        self.assertTrue(check_by_label(checks, "Weekend blocks")["ok"])
        self.assertTrue(check_by_label(checks, "Consecutive call days")["ok"])

    def test_validation_detects_modified_consult_monday_on_real_schedule(self):
        mutated_schedule = copy.deepcopy(self.result["schedule"])
        covered_dates = set()
        for block in self.result["holiday_weekends"] + self.result["major_holidays"]:
            current = datetime.strptime(block["start"], "%m/%d/%Y")
            end = datetime.strptime(block["end"], "%m/%d/%Y")
            while current <= end:
                covered_dates.add(current.strftime("%m/%d/%Y"))
                current += timedelta(days=1)

        monday_entry = next(
            item
            for item in mutated_schedule
            if datetime.strptime(item["date"], "%m/%d/%Y").weekday() == 0 and item["date"] not in covered_dates
        )
        monday_entry["fellow"] = next(fellow for fellow in FELLOWS if fellow != monday_entry["fellow"])

        checks = build_validation(
            schedule=mutated_schedule,
            rotations=self.result["rotations"],
            holiday_weekends=self.result["holiday_weekends"],
            major_holidays=self.result["major_holidays"],
            start_date=self.start_date,
            end_date=self.end_date,
            exception_months=EXCEPTION_MONTHS,
            fellows=FELLOWS,
            pgy_years=PGY_YEARS,
        )

        monday_check = check_by_label(checks, "Consult Mondays")
        self.assertFalse(monday_check["ok"])
        self.assertIn(monday_entry["date"], monday_check["detail"])


if __name__ == "__main__":
    unittest.main()
