import copy
import sys
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scheduler_engine.academic_year import build_month_keys
from scheduler_engine.validation import build_validation


FELLOWS = ["Amitie", "Deepthi", "Jeffery", "Jordan", "Kilian", "Rijutha"]
PGY_YEARS = {
    "Amitie": "PGY-4",
    "Deepthi": "PGY-4",
    "Jeffery": "PGY-5",
    "Jordan": "PGY-5",
    "Kilian": "PGY-6",
    "Rijutha": "PGY-6",
}
EXCEPTION_MONTHS = ["2026-08"]


def check_by_label(checks, label):
    return next(check for check in checks if check["label"] == label)


def make_july_fixture():
    schedule = [
        {"date": "07/09/2026", "fellow": "Jeffery"},
        {"date": "07/10/2026", "fellow": "Jordan"},
        {"date": "07/11/2026", "fellow": "Jordan"},
        {"date": "07/12/2026", "fellow": "Jordan"},
        {"date": "07/13/2026", "fellow": "Amitie"},
        {"date": "07/14/2026", "fellow": "Deepthi"},
    ]
    rotations = []
    for fellow, rotation in [
        ("Amitie", "consult"),
        ("Deepthi", "pcicu"),
        ("Jeffery", "cath"),
        ("Jordan", "imaging"),
        ("Kilian", "research"),
        ("Rijutha", "achd_ep"),
    ]:
        rotations.append({"month": "2026-07", "fellow": fellow, "rotation": rotation})
    holiday_weekends = []
    major_holidays = []
    start_date = datetime.strptime("07/09/2026", "%m/%d/%Y")
    end_date = datetime.strptime("07/14/2026", "%m/%d/%Y")
    return schedule, rotations, holiday_weekends, major_holidays, start_date, end_date


def make_august_exception_fixture():
    schedule = [
        {"date": "08/03/2026", "fellow": "Deepthi"},
        {"date": "08/04/2026", "fellow": "Deepthi"},
    ]
    rotations = []
    for fellow, rotation in [
        ("Amitie", "cath"),
        ("Deepthi", "consult"),
        ("Jeffery", "imaging"),
        ("Jordan", "research"),
        ("Kilian", "achd_ep"),
        ("Rijutha", "research"),
    ]:
        rotations.append({"month": "2026-08", "fellow": fellow, "rotation": rotation})
    return (
        schedule,
        rotations,
        [],
        [],
        datetime.strptime("08/03/2026", "%m/%d/%Y"),
        datetime.strptime("08/04/2026", "%m/%d/%Y"),
    )


class ValidationRuleTests(unittest.TestCase):
    def setUp(self):
        (
            self.schedule,
            self.rotations,
            self.holiday_weekends,
            self.major_holidays,
            self.start_date,
            self.end_date,
        ) = make_july_fixture()

    def build_checks(self, schedule=None, rotations=None, start_date=None, end_date=None):
        active_start_date = start_date or self.start_date
        active_end_date = end_date or self.end_date
        del active_start_date, active_end_date
        start_year = 2026
        return build_validation(
            schedule=schedule or self.schedule,
            rotations=rotations or self.rotations,
            holiday_weekends=self.holiday_weekends,
            major_holidays=self.major_holidays,
            start_date=start_date or self.start_date,
            end_date=end_date or self.end_date,
            exception_months=EXCEPTION_MONTHS,
            fellows=FELLOWS,
            pgy_years=PGY_YEARS,
            month_keys=build_month_keys(start_year),
            start_year=start_year,
            board_exam_fellows=["Amitie"],
        )

    def test_fixture_passes_targeted_rule_checks(self):
        checks = self.build_checks()

        self.assertTrue(check_by_label(checks, "Consult Mondays")["ok"])
        self.assertTrue(check_by_label(checks, "Tuesday rule")["ok"])
        self.assertTrue(check_by_label(checks, "Weekend blocks")["ok"])
        self.assertTrue(check_by_label(checks, "Consecutive call days")["ok"])

    def test_consult_monday_break_is_reported(self):
        mutated_schedule = copy.deepcopy(self.schedule)
        monday_entry = next(item for item in mutated_schedule if item["date"] == "07/13/2026")
        monday_entry["fellow"] = "Kilian"

        monday_check = check_by_label(self.build_checks(mutated_schedule), "Consult Mondays")

        self.assertFalse(monday_check["ok"])
        self.assertIn("07/13/2026", monday_check["detail"])

    def test_tuesday_rule_break_is_reported_for_exception_month(self):
        schedule, rotations, _, _, start_date, end_date = make_august_exception_fixture()
        mutated_schedule = copy.deepcopy(schedule)
        tuesday_entry = next(item for item in mutated_schedule if item["date"] == "08/04/2026")
        tuesday_entry["fellow"] = "Jordan"

        tuesday_check = check_by_label(
            self.build_checks(mutated_schedule, rotations=rotations, start_date=start_date, end_date=end_date),
            "Tuesday rule",
        )

        self.assertFalse(tuesday_check["ok"])
        self.assertIn("08/04/2026", tuesday_check["detail"])

    def test_split_weekend_block_is_reported(self):
        mutated_schedule = copy.deepcopy(self.schedule)
        saturday_entry = next(item for item in mutated_schedule if item["date"] == "07/11/2026")
        saturday_entry["fellow"] = "Kilian"

        weekend_check = check_by_label(self.build_checks(mutated_schedule), "Weekend blocks")

        self.assertFalse(weekend_check["ok"])
        self.assertIn("07/10/2026", weekend_check["detail"])

    def test_consecutive_call_days_outside_block_are_reported(self):
        mutated_schedule = copy.deepcopy(self.schedule)
        monday_entry = next(item for item in mutated_schedule if item["date"] == "07/13/2026")
        monday_entry["fellow"] = "Jordan"

        consecutive_check = check_by_label(self.build_checks(mutated_schedule), "Consecutive call days")

        self.assertFalse(consecutive_check["ok"])
        self.assertIn("07/12/2026", consecutive_check["detail"])

    def test_board_exam_rotation_limit_is_reported(self):
        rotations = [{"month": "2026-10", "fellow": fellow, "rotation": "research"} for fellow in FELLOWS]
        rotations[0] = {"month": "2026-10", "fellow": "Amitie", "rotation": "consult"}

        board_check = check_by_label(self.build_checks(rotations=rotations), "October board exam rotation limits")

        self.assertFalse(board_check["ok"])
        self.assertIn("Amitie", board_check["detail"])

    def test_first_year_pcicu_before_december_is_reported(self):
        rotations = [{"month": "2026-09", "fellow": fellow, "rotation": "research"} for fellow in FELLOWS]
        rotations[0] = {"month": "2026-09", "fellow": "Amitie", "rotation": "pcicu"}

        pcicu_check = check_by_label(self.build_checks(rotations=rotations), "First-year PCICU timing")

        self.assertFalse(pcicu_check["ok"])
        self.assertIn("Amitie", pcicu_check["detail"])


if __name__ == "__main__":
    unittest.main()
