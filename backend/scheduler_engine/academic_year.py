from datetime import datetime


def academic_year_start_year(start_date: datetime, end_date: datetime) -> int:
    if start_date.month != 7 or start_date.day != 1:
        raise ValueError("academic years must start on July 1")
    if end_date.month != 6 or end_date.day != 30:
        raise ValueError("academic years must end on June 30")
    if end_date.year != start_date.year + 1:
        raise ValueError("academic years must end on June 30 of the following calendar year")
    return start_date.year


def build_month_keys(start_year: int) -> list[str]:
    return [f"{start_year}-{month:02d}" for month in range(7, 13)] + [f"{start_year + 1}-{month:02d}" for month in range(1, 7)]


def default_exception_tuesday_months(start_year: int) -> set[str]:
    return {
        f"{start_year}-08",
        f"{start_year}-11",
        f"{start_year + 1}-01",
        f"{start_year + 1}-02",
        f"{start_year + 1}-04",
        f"{start_year + 1}-05",
    }


def first_month_key(start_year: int) -> str:
    return f"{start_year}-07"


def october_month_key(start_year: int) -> str:
    return f"{start_year}-10"
