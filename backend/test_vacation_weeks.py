#!/usr/bin/env python3
"""
Test script to verify the vacation weeks auto-fill functionality.
"""
from datetime import datetime, timedelta
from main import count_vacation_weeks, get_vacation_weeks_coverage, get_all_available_weeks, fill_vacation_weeks

def test_count_vacation_weeks():
    """Test counting vacation weeks."""
    # Test empty list
    assert count_vacation_weeks([]) == 0
    
    # Test single week
    date1 = datetime(2025, 9, 1)  # A Monday
    dates = [date1, date1 + timedelta(days=1), date1 + timedelta(days=2)]
    assert count_vacation_weeks(dates) == 1
    
    # Test two separate weeks
    week1_dates = [date1 + timedelta(days=i) for i in range(5)]  # Mon-Fri of week 1
    week2_dates = [date1 + timedelta(days=7+i) for i in range(5)]  # Mon-Fri of week 2
    assert count_vacation_weeks(week1_dates + week2_dates) == 2
    
    print("✓ count_vacation_weeks tests passed")

def test_get_all_available_weeks():
    """Test getting all available weeks in a date range."""
    start = datetime(2025, 9, 1)  # Monday
    end = datetime(2025, 9, 30)   # Tuesday
    
    weeks = get_all_available_weeks(start, end)
    
    # Should have approximately 4-5 weeks
    assert len(weeks) >= 4
    print(f"✓ get_all_available_weeks returned {len(weeks)} weeks")

def test_fill_vacation_weeks():
    """Test filling vacation weeks to minimum of 4."""
    start = datetime(2025, 9, 1)   # Start of academic year
    end = datetime(2026, 6, 30)    # End of academic year
    
    fellows = ["Alice", "Bob", "Charlie"]
    
    # Alice has 1 week of vacation requested
    alice_vacation = [datetime(2025, 9, 1) + timedelta(days=i) for i in range(5)]  # Mon-Fri
    
    # Bob has 2 weeks
    bob_vacation = [datetime(2025, 9, 8) + timedelta(days=i) for i in range(10)]  # 2 weeks
    
    # Charlie has no vacation
    vacations = {
        "Alice": alice_vacation.copy(),
        "Bob": bob_vacation.copy(),
        # Charlie not in dict initially
    }
    
    filled = fill_vacation_weeks(vacations, start, end, fellows)
    
    # Verify all fellows are in the result
    assert set(filled.keys()) == set(fellows)
    
    # Count weeks for each fellow
    alice_weeks = count_vacation_weeks(filled["Alice"])
    bob_weeks = count_vacation_weeks(filled["Bob"])
    charlie_weeks = count_vacation_weeks(filled["Charlie"])
    
    print(f"  Alice: {alice_weeks} weeks (was {count_vacation_weeks(alice_vacation)})")
    print(f"  Bob: {bob_weeks} weeks (was {count_vacation_weeks(bob_vacation)})")
    print(f"  Charlie: {charlie_weeks} weeks (was 0)")
    
    # All should have at least 4 weeks
    assert alice_weeks >= 4, f"Alice should have 4 weeks, got {alice_weeks}"
    assert bob_weeks >= 4, f"Bob should have 4 weeks, got {bob_weeks}"
    assert charlie_weeks >= 4, f"Charlie should have 4 weeks, got {charlie_weeks}"
    
    # Verify no more overlaps than necessary
    # (Max 2 fellows per date based on existing validation)
    from collections import Counter
    date_counts = Counter()
    for fellow, dates in filled.items():
        for date in dates:
            date_counts[date] += 1
    
    max_overlap = max(date_counts.values()) if date_counts else 0
    assert max_overlap <= 2, f"Too many fellows on same date: {max_overlap}"
    
    print(f"✓ fill_vacation_weeks tests passed (max overlap: {max_overlap} fellows)")

if __name__ == "__main__":
    test_count_vacation_weeks()
    test_get_all_available_weeks()
    test_fill_vacation_weeks()
    print("\n✓ All tests passed!")
