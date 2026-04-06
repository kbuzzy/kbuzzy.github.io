import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from main import ScheduleRequest


class ScheduleRequestModelTests(unittest.TestCase):
    def test_mutable_defaults_are_not_shared_between_requests(self):
        first = ScheduleRequest(
            fellows=["A", "B", "C", "D", "E", "F"],
            start="07/01/2026",
            end="06/30/2027",
            pgy_years={
                "A": "PGY-4",
                "B": "PGY-4",
                "C": "PGY-5",
                "D": "PGY-5",
                "E": "PGY-6",
                "F": "PGY-6",
            },
            holiday_preferences={name: {"majorHolidays": ["Thanksgiving", "Christmas", "New Year's"], "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"]} for name in ["A", "B", "C", "D", "E", "F"]},
            pcicu_exception_months=["2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05"],
        )
        second = ScheduleRequest(
            fellows=["A", "B", "C", "D", "E", "F"],
            start="07/01/2026",
            end="06/30/2027",
            pgy_years={
                "A": "PGY-4",
                "B": "PGY-4",
                "C": "PGY-5",
                "D": "PGY-5",
                "E": "PGY-6",
                "F": "PGY-6",
            },
            holiday_preferences={name: {"majorHolidays": ["Thanksgiving", "Christmas", "New Year's"], "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"]} for name in ["A", "B", "C", "D", "E", "F"]},
            pcicu_exception_months=["2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05"],
        )

        first.vacations["A"] = ["07/06/2026"]
        first.board_exam_fellows.append("A")

        self.assertEqual(second.vacations, {})
        self.assertEqual(second.board_exam_fellows, [])


if __name__ == "__main__":
    unittest.main()
