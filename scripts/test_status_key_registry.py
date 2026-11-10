"""test_status_key_registry.py — registry-driven status keys keep every old key (2026-11-10).

Since 2026-11-10 NAMESPACED_CATEGORIES and the key category come from the registry
(plainKey / statusCategory) instead of a hand list. This checks, on the real data/ files:

  1. the registry namespace list still holds every legacy name (a dropped name orphans Firebase records)
  2. legacy result == new result for every list: the legacy rule is "the list's own category is the key
     namespace"; a list that shares a key (statusCategory, 미조치(lte) -> 미조치) must give exactly the keys
     its rows would get if they were still rows of the shared list
  3. a list that shares a key gives the same keys when loaded alone (only that list switched on)

  python3 scripts/test_status_key_registry.py      # PASS / FAIL
JS == Python is scripts/test_status_key_parity.py (run both).
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import status_key as S  # noqa: E402
from datasets import DATASETS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def keys(rows):
    bm, _ = S.build_status_key_index(rows)
    return [S.status_key_of(r, bm) for r in rows]


def main():
    problems = []
    missing = set(S.LEGACY_NAMESPACED_CATEGORIES) - set(S.NAMESPACED_CATEGORIES)
    if missing:
        problems.append(f"legacy namespace dropped: {sorted(missing)}")

    rows = S.load_rows(os.path.join(ROOT, "data"))
    new = keys(rows)
    # legacy view: every row carries its key category as its category, namespace list = legacy hand list
    saved = S.NAMESPACED_CATEGORIES
    try:
        S.NAMESPACED_CATEGORIES = S.LEGACY_NAMESPACED_CATEGORIES
        legacy = keys([dict(r, category=S.key_category_of(r)) for r in rows])
    finally:
        S.NAMESPACED_CATEGORIES = saved
    per, bad = Counter(), Counter()
    for r, a, b in zip(rows, legacy, new):
        per[r["category"]] += 1
        if a != b:
            bad[r["category"]] += 1
    print(f"rows {len(rows):,} · per list {dict(per)}")
    if bad:
        problems.append(f"keys changed vs legacy rule: {dict(bad)}")

    shared = Counter(S.key_category_of({"category": d["category"]}) for d in DATASETS if d.get("category"))
    for d in DATASETS:
        cat = d.get("category")
        if not cat or shared[S.key_category_of({"category": cat})] < 2:
            continue
        idx = [i for i, r in enumerate(rows) if r["category"] == cat]
        alone = keys([rows[i] for i in idx])
        n = sum(1 for i, k in zip(idx, alone) if k != new[i])
        print(f"  {d['code']} {cat} alone: {len(idx):,} rows, key diff {n}")
        if n:
            problems.append(f"{cat} loaded alone changes {n} keys")

    if problems:
        print("\nFAIL")
        for p in problems:
            print("  - " + p)
        return 1
    print("PASS — every list keeps its old status keys")
    return 0


if __name__ == "__main__":
    sys.exit(main())
