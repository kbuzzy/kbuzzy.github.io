from .academic_year import august_month_key, december_month_key, february_month_key, first_month_key, october_month_key
from .constants import DIFFICULT_ROTATIONS, PGY_ROTATION_TARGETS, ROTATIONS


def add_rotation_constraints(
    model,
    rotation,
    fellow_count,
    rotation_index,
    month_index,
    month_keys,
    pgy_years,
    fellows,
    exception_tuesday_months,
    board_exam_fellows,
    start_year,
):
    for fellow_idx in range(fellow_count):
        for month_idx in range(len(month_keys)):
            model.add(sum(rotation[(fellow_idx, month_idx, rotation_idx)] for rotation_idx in range(len(ROTATIONS))) == 1)

    for month_idx in range(len(month_keys)):
        model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["consult"])] for fellow_idx in range(fellow_count)) == 1)
        model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["cath"])] for fellow_idx in range(fellow_count)) == 1)
        if month_keys[month_idx] in exception_tuesday_months:
            model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["pcicu"])] for fellow_idx in range(fellow_count)) == 0)
        else:
            model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["pcicu"])] for fellow_idx in range(fellow_count)) == 1)
        model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["achd_ep"])] for fellow_idx in range(fellow_count)) <= 1)

    for fellow_idx, fellow in enumerate(fellows):
        targets = PGY_ROTATION_TARGETS[pgy_years[fellow]]
        for rotation_name, target in targets.items():
            rotation_slot = rotation_index[rotation_name]
            model.add(sum(rotation[(fellow_idx, month_idx, rotation_slot)] for month_idx in range(len(month_keys))) == target)

    first_imaging_index = month_index[first_month_key(start_year)]
    august_index = month_index[august_month_key(start_year)]
    february_index = month_index[february_month_key(start_year)]
    october_index = month_index[october_month_key(start_year)]
    december_index = month_index[december_month_key(start_year)]
    for fellow_idx, fellow in enumerate(fellows):
        if pgy_years[fellow] == "PGY-4":
            model.add(rotation[(fellow_idx, first_imaging_index, rotation_index["imaging"])] == 1)
            for month_idx in range(december_index):
                model.add(rotation[(fellow_idx, month_idx, rotation_index["pcicu"])] == 0)
            for blocked_rotation in ("consult", "cath", "pcicu"):
                model.add(rotation[(fellow_idx, february_index, rotation_index[blocked_rotation])] == 0)
        if pgy_years[fellow] == "PGY-6":
            for blocked_rotation in ("consult", "cath", "pcicu"):
                model.add(rotation[(fellow_idx, august_index, rotation_index[blocked_rotation])] == 0)
        if fellow in board_exam_fellows:
            for blocked_rotation in ("consult", "cath", "pcicu"):
                model.add(rotation[(fellow_idx, october_index, rotation_index[blocked_rotation])] == 0)

    for fellow_idx in range(fellow_count):
        for month_idx in range(len(month_keys) - 1):
            for rotation_name in ROTATIONS:
                if rotation_name == "research":
                    continue
                rotation_slot = rotation_index[rotation_name]
                model.add(rotation[(fellow_idx, month_idx, rotation_slot)] + rotation[(fellow_idx, month_idx + 1, rotation_slot)] <= 1)

    research_idx = rotation_index["research"]
    for fellow_idx in range(fellow_count):
        for month_idx in range(len(month_keys) - 2):
            model.add(
                rotation[(fellow_idx, month_idx, research_idx)]
                + rotation[(fellow_idx, month_idx + 1, research_idx)]
                + rotation[(fellow_idx, month_idx + 2, research_idx)]
                <= 2
            )


def build_hard_month_vars(model, rotation, fellow_count, rotation_index, month_keys):
    hard_month = {}
    for fellow_idx in range(fellow_count):
        for month_idx in range(len(month_keys)):
            hard_month[(fellow_idx, month_idx)] = model.new_bool_var(f"hard_month_{fellow_idx}_{month_idx}")
            difficult_sum = sum(rotation[(fellow_idx, month_idx, rotation_index[name])] for name in DIFFICULT_ROTATIONS)
            model.add(hard_month[(fellow_idx, month_idx)] == difficult_sum)
    return hard_month
