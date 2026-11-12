"""test_status_key_registry.py — every list keeps its own status key (2026-11-10, separated 2026-11-12).

Since 2026-11-10 NAMESPACED_CATEGORIES come from the registry (plainKey / category) instead of a hand list.
On 2026-11-12 the one shared key (미조치(lte) wrote '주소|미조치', so completing one list completed the other —
영준님 "모든리스트 개별동작하게") was split: every list now keys on its own category. This checks, on the real
data/ files:

  1. the registry namespace list still holds every legacy name (a dropped name orphans Firebase records)
  2. no registry entry carries statusCategory (js/datasets.js or scripts/datasets.py) — the field is gone;
     putting it back would make two lists share a key again
  3. no two lists that are not plainKey share a key category (plainKey = 실효 + its 완료아카이브, same list)
  4. legacy keys are kept: every list gives the key it gave before, except KEY_MOVED lists, whose key is the
     pre-split key with only the category suffix changed (the address part must not move — Firebase records
     of 11/10~11/12 are copied to the new key by scripts/migrate_michochi_lte_keys.py on that rule)

  python3 scripts/test_status_key_registry.py      # PASS / FAIL
JS == Python is scripts/test_status_key_parity.py (run both).
"""
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import status_key as S  # noqa: E402
from datasets import DATASETS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# list category -> the key category it wrote before it got its own (date of the split)
KEY_MOVED = {"미조치lte": "미조치"}     # 2026-11-12


def keys(rows):
    bm, _ = S.build_status_key_index(rows)
    return [S.status_key_of(r, bm) for r in rows]


def main():
    problems = []
    missing = set(S.LEGACY_NAMESPACED_CATEGORIES) - set(S.NAMESPACED_CATEGORIES)
    if missing:
        problems.append(f"legacy namespace dropped: {sorted(missing)}")

    # 2. statusCategory is gone from both registries
    py_sc = [d["code"] for d in DATASETS if "statusCategory" in d]
    js_src = open(os.path.join(ROOT, "js", "datasets.js"), encoding="utf-8").read()
    js_code = "\n".join(line.split("//", 1)[0] for line in js_src.splitlines())   # comments may mention it
    js_sc = re.findall(r"\bstatusCategory\s*:", js_code)
    if py_sc or js_sc:
        problems.append(f"statusCategory is back (lists would share a status key): py {py_sc} · js {len(js_sc)}")

    # 3. one key category per non-plainKey list
    kc = Counter(S.key_category_of({"category": d["category"]})
                 for d in DATASETS if d.get("category") and not d.get("plainKey"))
    dup = {k: n for k, n in kc.items() if n > 1}
    if dup:
        problems.append(f"lists share a status key category: {dup}")
    print(f"key categories (non-plainKey) {len(kc)} · shared {len(dup)}")

    # 4. old keys kept (address part fixed for moved lists)
    rows = S.load_rows(os.path.join(ROOT, "data"))
    new = keys(rows)
    saved = S.NAMESPACED_CATEGORIES
    try:
        # pre-split view: moved lists write their old key category, namespace list = legacy hand list
        S.NAMESPACED_CATEGORIES = S.LEGACY_NAMESPACED_CATEGORIES
        legacy = keys([dict(r, category=KEY_MOVED.get(r["category"], r["category"])) for r in rows])
    finally:
        S.NAMESPACED_CATEGORIES = saved
    per, bad, moved = Counter(), Counter(), Counter()
    for r, a, b in zip(rows, legacy, new):
        cat = r["category"]
        per[cat] += 1
        if cat in KEY_MOVED:
            want = a[: -len(KEY_MOVED[cat])] + cat if a.endswith(S.STATUS_KEY_SEP + KEY_MOVED[cat]) else None
            if b != want:
                bad[cat] += 1
            else:
                moved[cat] += 1
        elif a != b:
            bad[cat] += 1
    print(f"rows {len(rows):,} · per list {dict(per)}")
    print(f"moved lists (suffix only) {dict(moved)}")
    if bad:
        problems.append(f"keys changed vs legacy rule: {dict(bad)}")

    if problems:
        print("\nFAIL")
        for p in problems:
            print("  - " + p)
        return 1
    print("PASS — every list keeps its old status key; no two lists share one")
    return 0


if __name__ == "__main__":
    sys.exit(main())
