#!/usr/bin/env python3
"""One-time seed: Mac-side off-book ledger -> Firebase helperStock/<USER_ID>/offbook (helper inject v97).

    python3 scripts/seed_helper_offbook.py                  # dry run (default) — prints what would be written
    python3 scripts/seed_helper_offbook.py --with-baseline  # also the inBaseline batch (see below)
    python3 scripts/seed_helper_offbook.py --go             # write (PM approval required)

Source = cst-input/backend/offbook_stock.json (gitignored, main checkout). Default = batches with
inBaseline=false (received after the physical count). The inBaseline=true batch is also physical
off-book stock, but the Mac-side count already holds it in the baseline; the helper page has no
baseline, so without it the helper's off-book column is short by that batch.

Writes one PATCH on helperStock/<USER_ID>/offbook with one child per MAC — never a PUT on the parent,
so entries added on the phone stay. A MAC that already exists in Firebase is skipped.
Dry run does one read-only GET on that node.
"""
import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = Path("/Users/woodelight/Projects/ami-work")
sys.path.insert(0, str(ROOT / "scripts"))
FB = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app/helperStock"
USER_ID = "273584"


def source():
    for base in (ROOT, MAIN):
        p = base / "cst-input/backend/offbook_stock.json"
        if p.exists():
            return p
    raise SystemExit("offbook_stock.json 없음")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--go", action="store_true")
    ap.add_argument("--with-baseline", action="store_true")
    a = ap.parse_args()
    import my_stock
    url = f"{FB}/{USER_ID}/offbook.json"
    have = json.loads(urllib.request.urlopen(url, timeout=30).read() or b"null") or {}
    now = int(time.time() * 1000)
    patch, skip = {}, []
    for bt in json.loads(source().read_text()).get("batches", []):
        if bt.get("inBaseline") and not a.with_baseline:
            continue
        for m in bt.get("macs", []):
            m = m.upper()
            if m in have:
                skip.append(m)
                continue
            patch[m] = {"type": my_stock.bucket(my_stock.kind(m)), "addedAt": now,
                        "note": ("seed " + (bt.get("label") or ""))[:100], "by": USER_ID}   # rules: by == <uid>
    from collections import Counter
    print(f"대상 {len(patch)} · 이미 있음 {len(skip)} · Firebase 현재 {len(have)}")
    for k, v in sorted(Counter(x["type"] for x in patch.values()).items()):
        print(f"  {k:20} {v}")
    if not a.go:
        print("드라이런 — 쓰지 않음. 쓰려면 --go (PM 승인 후)")
        return
    if not patch:
        return
    req = urllib.request.Request(url, data=json.dumps(patch).encode(), method="PATCH",
                                 headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()
    print(f"씀 {len(patch)}")


if __name__ == "__main__":
    main()
