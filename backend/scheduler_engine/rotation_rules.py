from .constants import DIFFICULT_ROTATIONS, MONTH_KEYS, PGY_ROTATION_TARGETS, ROTATIONS


def add_rotation_constraints(model, rotation, fellow_count, rotation_index, month_index, pgy_years, fellows, exception_tuesday_months):
    for fellow_idx in range(fellow_count):
        for month_idx in range(len(MONTH_KEYS)):
            model.add(sum(rotation[(fellow_idx, month_idx, rotation_idx)] for rotation_idx in range(len(ROTATIONS))) == 1)

    for month_idx in range(len(MONTH_KEYS)):
        model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["consult"])] for fellow_idx in range(fellow_count)) == 1)
        model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["cath"])] for fellow_idx in range(fellow_count)) == 1)
        if MONTH_KEYS[month_idx] in exception_tuesday_months:
            model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["pcicu"])] for fellow_idx in range(fellow_count)) == 0)
        else:
            model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["pcicu"])] for fellow_idx in range(fellow_count)) == 1)
        model.add(sum(rotation[(fellow_idx, month_idx, rotation_index["achd_ep"])] for fellow_idx in range(fellow_count)) <= 1)

    for fellow_idx, fellow in enumerate(fellows):
        targets = PGY_ROTATION_TARGETS[pgy_years[fellow]]
        for rotation_name, target in targets.items():
            rotation_slot = rotation_index[rotation_name]
            model.add(sum(rotation[(fellow_idx, month_idx, rotation_slot)] for month_idx in range(len(MONTH_KEYS))) == target)

    july_index = month_index["2026-07"]
    for fellow_idx, fellow in enumerate(fellows):
        if pgy_years[fellow] == "PGY-4":
            model.add(rotation[(fellow_idx, july_index, rotation_index["imaging"])] == 1)

    for fellow_idx in range(fellow_count):
        for month_idx in range(len(MONTH_KEYS) - 1):
            for rotation_name in ROTATIONS:
                if rotation_name == "research":
                    continue
                rotation_slot = rotation_index[rotation_name]
                model.add(rotation[(fellow_idx, month_idx, rotation_slot)] + rotation[(fellow_idx, month_idx + 1, rotation_slot)] <= 1)

    research_idx = rotation_index["research"]
    for fellow_idx in range(fellow_count):
        for month_idx in range(len(MONTH_KEYS) - 2):
            model.add(
                rotation[(fellow_idx, month_idx, research_idx)]
                + rotation[(fellow_idx, month_idx + 1, research_idx)]
                + rotation[(fellow_idx, month_idx + 2, research_idx)]
                <= 2
            )


def build_hard_month_vars(model, rotation, fellow_count, rotation_index):
    hard_month = {}
    for fellow_idx in range(fellow_count):
        for month_idx in range(len(MONTH_KEYS)):
            hard_month[(fellow_idx, month_idx)] = model.new_bool_var(f"hard_month_{fellow_idx}_{month_idx}")
            difficult_sum = sum(rotation[(fellow_idx, month_idx, rotation_index[name])] for name in DIFFICULT_ROTATIONS)
            model.add(hard_month[(fellow_idx, month_idx)] == difficult_sum)
    return hard_month
