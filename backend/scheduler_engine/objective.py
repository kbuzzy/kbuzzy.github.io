from datetime import datetime, timedelta

from .constants import (
    CATH_THURSDAY_WEIGHT,
    DEFAULT_MAJOR_HOLIDAYS,
    DIFFICULT_ROTATION_STREAK_WEIGHT,
    HOLIDAY_WEEKENDS,
    OCTOBER_BOARD_WEIGHT,
    PGY_PREFERENCE_WEIGHTS,
)


def configure_objective(
    model,
    call: dict,
    soft_terms: list,
    in_house_days: set[int],
    fellow_count: int,
    days: int,
    start_date: datetime,
    holiday_block_starts: set[int],
    major_half_info: list[dict],
    month_count: int,
):
    ordered_in_house_days = sorted(in_house_days)
    in_house_counts = [sum(call[(fellow_idx, day_idx)] for day_idx in ordered_in_house_days) for fellow_idx in range(fellow_count)]
    max_in_house = model.new_int_var(0, len(ordered_in_house_days), "max_in_house")
    min_in_house = model.new_int_var(0, len(ordered_in_house_days), "min_in_house")
    for total in in_house_counts:
        model.add(total <= max_in_house)
        model.add(total >= min_in_house)

    in_house_pairwise_spread = []
    for left in range(fellow_count):
        for right in range(left + 1, fellow_count):
            diff = model.new_int_var(0, len(ordered_in_house_days), f"in_house_diff_{left}_{right}")
            model.add_abs_equality(diff, in_house_counts[left] - in_house_counts[right])
            in_house_pairwise_spread.append(diff)

    total_counts = [sum(call[(fellow_idx, day_idx)] for day_idx in range(days)) for fellow_idx in range(fellow_count)]
    max_total = model.new_int_var(0, days, "max_total")
    min_total = model.new_int_var(0, days, "min_total")
    for total in total_counts:
        model.add(total <= max_total)
        model.add(total >= min_total)

    in_house_range = max_in_house - min_in_house
    in_house_pairwise_total = sum(in_house_pairwise_spread)
    total_call_range = max_total - min_total
    soft_score = sum(soft_terms)

    max_major_rank_score = len(DEFAULT_MAJOR_HOLIDAYS)
    max_weekend_rank_score = len(HOLIDAY_WEEKENDS)
    max_seniority_weight = max(PGY_PREFERENCE_WEIGHTS.values())
    board_exam_soft_bound = OCTOBER_BOARD_WEIGHT * 2 * fellow_count
    major_preference_soft_bound = len(major_half_info) * max_major_rank_score * max_seniority_weight
    weekend_preference_soft_bound = len(HOLIDAY_WEEKENDS) * max_weekend_rank_score * max_seniority_weight
    thursday_soft_bound = CATH_THURSDAY_WEIGHT * sum(
        1
        for day_idx in range(days)
        if (start_date + timedelta(days=day_idx)).weekday() == 3 and day_idx not in holiday_block_starts
    )
    difficult_streak_soft_bound = DIFFICULT_ROTATION_STREAK_WEIGHT * fellow_count * max(0, month_count - 2)
    soft_score_span = (
        board_exam_soft_bound
        + major_preference_soft_bound
        + weekend_preference_soft_bound
        + thursday_soft_bound
        + difficult_streak_soft_bound
    )
    total_call_range_priority = soft_score_span + 1
    in_house_pairwise_upper = len(ordered_in_house_days) * (fellow_count * (fellow_count - 1) // 2)
    in_house_pairwise_priority = (days * total_call_range_priority) + soft_score_span + 1
    in_house_range_priority = (
        in_house_pairwise_upper * in_house_pairwise_priority
        + days * total_call_range_priority
        + soft_score_span
        + 1
    )

    objective = (
        soft_score
        - total_call_range_priority * total_call_range
        - in_house_pairwise_priority * in_house_pairwise_total
        - in_house_range_priority * in_house_range
    )
    model.maximize(objective)
