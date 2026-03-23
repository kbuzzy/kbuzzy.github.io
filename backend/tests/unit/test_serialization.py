import sys
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scheduler_engine.serialization import _build_holiday_date_set, _call_metadata_for_date


class SerializationTests(unittest.TestCase):
    def test_call_metadata_marks_exception_tuesday_as_home_call(self):
        call_type, is_in_house = _call_metadata_for_date(
            datetime.strptime("08/04/2026", "%m/%d/%Y"),
            {"2026-08"},
            set(),
        )

        self.assertEqual(call_type, "Home Call")
        self.assertFalse(is_in_house)

    def test_call_metadata_marks_regular_tuesday_as_in_house(self):
        call_type, is_in_house = _call_metadata_for_date(
            datetime.strptime("09/01/2026", "%m/%d/%Y"),
            {"2026-08"},
            set(),
        )

        self.assertEqual(call_type, "In-House Call")
        self.assertTrue(is_in_house)

    def test_call_metadata_marks_holiday_dates_as_non_in_house(self):
        holiday_dates = _build_holiday_date_set([])

        call_type, is_in_house = _call_metadata_for_date(
            datetime.strptime("09/05/2026", "%m/%d/%Y"),
            set(),
            holiday_dates,
        )

        self.assertEqual(call_type, "Holiday Call")
        self.assertFalse(is_in_house)


if __name__ == "__main__":
    unittest.main()
