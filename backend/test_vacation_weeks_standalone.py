#!/usr/bin/env python3
"""
Standalone test script for vacation weeks auto-fill functionality.
Doesn't require external dependencies.
"""
from datetime import datetime, timedelta

def count_vacation_weeks(dates: list[datetime]) -> int:
    """
    Count the number of distinct calendar weeks covered by vacation dates.
    A week is defined as Monday-Sunday (ISO week).
    """
    if not dates:
        return 0
    
    # Get unique weeks by converting each date to its ISO calendar week
    weeks = set()
    for date in dates:
        # Get the ISO year and week number (week starts on Monday)
        iso_year, iso_week, _ = date.isocalendar()
        weeks.add((iso_year, iso_week))
    
    return len(weeks)


def test_count_vacation_weeks():
    """Test counting vacation weeks."""
    # Test empty list
    assert count_vacation_weeks([]) == 0
    print("✓ Empty list returns 0 weeks")
    
    # Test single week
    date1 = datetime(2025, 9, 1)  # A Monday
    dates = [date1, date1 + timedelta(days=1), date1 + timedelta(days=2)]
    assert count_vacation_weeks(dates) == 1
    print("✓ Single week returns 1 week")
    
    # Test two separate weeks
    week1_dates = [date1 + timedelta(days=i) for i in range(5)]  # Mon-Fri of week 1
    week2_dates = [date1 + timedelta(days=7+i) for i in range(5)]  # Mon-Fri of week 2
    two_weeks = count_vacation_weeks(week1_dates + week2_dates)
    assert two_weeks == 2, f"Expected 2 weeks, got {two_weeks}"
    print("✓ Two separate weeks returns 2 weeks")
    
    # Test partial weeks
    mixed = [date1 + timedelta(days=4), date1 + timedelta(days=7)]  # Fri of week 1, Mon of week 2
    mixed_weeks = count_vacation_weeks(mixed)
    assert mixed_weeks == 2, f"Expected 2 weeks for partial overlap, got {mixed_weeks}"
    print("✓ Partial overlap across weeks correctly counts as 2 weeks")
    

def test_iso_calendar_logic():
    """Test that ISO calendar week logic works as expected."""
    # September 1, 2025 is a Monday
    monday = datetime(2025, 9, 1)
    tuesday = datetime(2025, 9, 2)
    sunday = datetime(2025, 9, 7)
    next_monday = datetime(2025, 9, 8)
    
    # All dates Mon-Sun should be same week
    dates_same_week = [monday, tuesday, sunday]
    assert count_vacation_weeks(dates_same_week) == 1
    
    # Monday of week 1 and Monday of week 2 should be different weeks
    dates_diff_weeks = [monday, next_monday]
    assert count_vacation_weeks(dates_diff_weeks) == 2
    
    print("✓ ISO calendar week logic correct")


def test_edge_cases():
    """Test edge cases."""
    # Duplicate dates should still count as one week
    date = datetime(2025, 9, 1)
    duplicates = [date, date, date]
    assert count_vacation_weeks(duplicates) == 1
    print("✓ Duplicate dates in same week counted as 1 week")
    
    # Year boundary
    year_end = datetime(2025, 12, 29)  # ISO week 1 of 2026
    year_start = datetime(2026, 1, 5)   # ISO week 2 of 2026
    assert count_vacation_weeks([year_end, year_start]) == 2
    print("✓ Year boundary weeks counted correctly")


if __name__ == "__main__":
    print("Testing vacation weeks counting logic...\n")
    test_count_vacation_weeks()
    test_iso_calendar_logic()
    test_edge_cases()
    print("\n✓ All tests passed! The vacation weeks logic is working correctly.")
