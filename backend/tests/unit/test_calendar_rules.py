import sys
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scheduler_engine.calendar_rules import build_call_blocks, normalize_major_holidays, validate_schedule_inputs


class CalendarRulesTests(unittest.TestCase):
    def test_validate_schedule_inputs_uses_default_exception_months(self):
        major_holidays, _, exception_months = validate_schedule_inputs(
            fellows=["A", "B", "C", "D", "E", "F"],
            start_date=datetime.strptime("07/01/2026", "%m/%d/%Y"),
            end_date=datetime.strptime("06/30/2027", "%m/%d/%Y"),
            pgy_years={
                "A": "PGY-4",
                "B": "PGY-4",
                "C": "PGY-5",
                "D": "PGY-5",
                "E": "PGY-6",
                "F": "PGY-6",
            },
            holiday_preferences={
                fellow: {
                    "majorHolidays": ["Thanksgiving", "Christmas", "New Year's"],
                    "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
                }
                for fellow in ["A", "B", "C", "D", "E", "F"]
            },
            major_holiday_blocks=None,
            conference_blocks=None,
            pcicu_exception_months=[],
        )

        self.assertEqual(exception_months, {"2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05"})
        self.assertEqual(set(major_holidays), {"Thanksgiving", "Christmas", "New Year's"})

    def test_validate_schedule_inputs_rejects_invalid_holiday_ranking(self):
        with self.assertRaises(ValueError):
            validate_schedule_inputs(
                fellows=["A", "B", "C", "D", "E", "F"],
                start_date=datetime.strptime("07/01/2026", "%m/%d/%Y"),
                end_date=datetime.strptime("06/30/2027", "%m/%d/%Y"),
                pgy_years={
                    "A": "PGY-4",
                    "B": "PGY-4",
                    "C": "PGY-5",
                    "D": "PGY-5",
                    "E": "PGY-6",
                    "F": "PGY-6",
                },
                holiday_preferences={
                    "A": {
                        "majorHolidays": ["Thanksgiving", "Christmas"],
                        "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
                    },
                    **{
                        fellow: {
                            "majorHolidays": ["Thanksgiving", "Christmas", "New Year's"],
                            "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
                        }
                        for fellow in ["B", "C", "D", "E", "F"]
                    },
                },
                major_holiday_blocks=None,
                conference_blocks=None,
                pcicu_exception_months=[],
            )

    def test_build_call_blocks_has_expected_annual_shape(self):
        blocks = build_call_blocks(
            datetime.strptime("07/01/2026", "%m/%d/%Y"),
            datetime.strptime("06/30/2027", "%m/%d/%Y"),
            validate_schedule_inputs(
                fellows=["A", "B", "C", "D", "E", "F"],
                start_date=datetime.strptime("07/01/2026", "%m/%d/%Y"),
                end_date=datetime.strptime("06/30/2027", "%m/%d/%Y"),
                pgy_years={
                    "A": "PGY-4",
                    "B": "PGY-4",
                    "C": "PGY-5",
                    "D": "PGY-5",
                    "E": "PGY-6",
                    "F": "PGY-6",
                },
                holiday_preferences={
                    fellow: {
                        "majorHolidays": ["Thanksgiving", "Christmas", "New Year's"],
                        "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
                    }
                    for fellow in ["A", "B", "C", "D", "E", "F"]
                },
                major_holiday_blocks=None,
                conference_blocks=None,
                pcicu_exception_months=[],
            )[0],
        )

        self.assertEqual(len(blocks["weekend_block_starts"]), 49)
        self.assertEqual(len(blocks["major_half_info"]), 6)
        self.assertEqual(len(blocks["weekend_credit_major_starts"]), 3)

    def test_build_call_blocks_rejects_overlap_with_existing_holiday_weekend(self):
        overlapping_blocks = {
            "Thanksgiving": [
                {"start": "2026-11-25", "end": "2026-11-26"},
                {"start": "2026-11-27", "end": "2026-11-29"},
            ],
            "Christmas": [
                {"start": "2026-12-22", "end": "2026-12-24"},
                {"start": "2026-12-25", "end": "2026-12-27"},
            ],
            "New Year's": [
                {"start": "2026-07-03", "end": "2026-07-05"},
                {"start": "2026-12-31", "end": "2027-01-03"},
            ],
        }

        with self.assertRaises(ValueError):
            build_call_blocks(
                datetime.strptime("07/01/2026", "%m/%d/%Y"),
                datetime.strptime("06/30/2027", "%m/%d/%Y"),
                normalize_major_holidays(overlapping_blocks),
            )

    def test_validate_schedule_inputs_rejects_heart_camp_outside_august(self):
        with self.assertRaises(ValueError):
            validate_schedule_inputs(
                fellows=["A", "B", "C", "D", "E", "F"],
                start_date=datetime.strptime("07/01/2026", "%m/%d/%Y"),
                end_date=datetime.strptime("06/30/2027", "%m/%d/%Y"),
                pgy_years={
                    "A": "PGY-4",
                    "B": "PGY-4",
                    "C": "PGY-5",
                    "D": "PGY-5",
                    "E": "PGY-6",
                    "F": "PGY-6",
                },
                holiday_preferences={
                    fellow: {
                        "majorHolidays": ["Thanksgiving", "Christmas", "New Year's"],
                        "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
                    }
                    for fellow in ["A", "B", "C", "D", "E", "F"]
                },
                major_holiday_blocks=None,
                conference_blocks={
                    "heart_camp": {"start": "2026-09-01", "end": "2026-09-06"},
                    "chop_conference": {"start": "2027-02-03", "end": "2027-02-07"},
                },
                pcicu_exception_months=[],
            )

    def test_validate_schedule_inputs_rejects_chop_conference_outside_february(self):
        with self.assertRaises(ValueError):
            validate_schedule_inputs(
                fellows=["A", "B", "C", "D", "E", "F"],
                start_date=datetime.strptime("07/01/2026", "%m/%d/%Y"),
                end_date=datetime.strptime("06/30/2027", "%m/%d/%Y"),
                pgy_years={
                    "A": "PGY-4",
                    "B": "PGY-4",
                    "C": "PGY-5",
                    "D": "PGY-5",
                    "E": "PGY-6",
                    "F": "PGY-6",
                },
                holiday_preferences={
                    fellow: {
                        "majorHolidays": ["Thanksgiving", "Christmas", "New Year's"],
                        "holidayWeekends": ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
                    }
                    for fellow in ["A", "B", "C", "D", "E", "F"]
                },
                major_holiday_blocks=None,
                conference_blocks={
                    "heart_camp": {"start": "2026-08-21", "end": "2026-08-26"},
                    "chop_conference": {"start": "2027-03-03", "end": "2027-03-07"},
                },
                pcicu_exception_months=[],
            )


if __name__ == "__main__":
    unittest.main()
