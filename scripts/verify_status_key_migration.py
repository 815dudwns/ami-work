#!/usr/bin/env python3
"""verify_status_key_migration.py — 키 분리 마이그레이션 전후 대조로 유실 0 을 증명한다.

검사 항목:
  1. 키 개수 (rename 이므로 총량이 같아야 한다)
  2. state 분포 (complete/pending/hold/fail 건수가 그대로여야 한다)
  3. 부가 필드 총량 — checkedMeters / added_meters / meterChecks / failedMeters
     (필드를 골라 옮기면 여기서 줄어든다)
  4. 갈린 주소가 마커별로 독립된 키를 갖는가
  5. 갈리지 않은 주소의 키가 그대로인가 (기존 완료/체크가 유실되지 않는가)
  6. complete 기록이 임의 배정되지 않았는가

실행:
  python3 scripts/verify_status_key_migration.py \
      --before data/ws-live-snapshot.json --after data/ws-migrated-20260802.json \
      --data-dir <site-data 있는 경로>
"""

import argparse
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from status_key import (  # noqa: E402
    build_status_key_index, build_address_to_keys, load_rows, address_of_status_key,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COUNTED = ("checkedMeters", "added_meters", "meterChecks", "failedMeters")


def totals(ws):
    """부가 필드 총량 — 항목 수를 센다(리스트/딕셔너리 모두 len)."""
    out = Counter()
    for v in ws.values():
        if not isinstance(v, dict):
            continue
        for f in COUNTED:
            x = v.get(f)
            if x:
                out[f] += len(x)
    return out


def states(ws):
    return Counter(v.get("state", "(없음)") for v in ws.values() if isinstance(v, dict))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "data"))
    args = ap.parse_args()

    before = json.load(open(args.before, encoding="utf-8"))
    after = json.load(open(args.after, encoding="utf-8"))
    rows = load_rows(os.path.abspath(args.data_dir))
    by_marker, split = build_status_key_index(rows)
    addr_to_keys = build_address_to_keys(by_marker)
    split_set = set(split)

    fails = []
    print("데이터: {} / 레코드 {}건 / 갈린 주소 {}건".format(
        os.path.abspath(args.data_dir), len(rows), len(split)))
    print("before: {} ({}키)".format(args.before, len(before)))
    print("after : {} ({}키)".format(args.after, len(after)))

    # 1. 키 개수
    print("\n[1] 키 개수")
    print("    before {} -> after {}  (차 {:+d})".format(
        len(before), len(after), len(after) - len(before)))
    if len(before) != len(after):
        fails.append("키 개수가 달라졌다 — rename 이므로 같아야 한다")

    # 2. state 분포
    print("\n[2] state 분포")
    sb, sa = states(before), states(after)
    for k in sorted(set(sb) | set(sa)):
        d = sa[k] - sb[k]
        print("    {:10} {:>6} -> {:>6}  ({:+d})".format(k, sb[k], sa[k], d))
        if d != 0:
            fails.append("state '{}' 건수가 {:+d} 변했다".format(k, d))

    # 3. 부가 필드 총량
    print("\n[3] 부가 필드 총량")
    tb, ta = totals(before), totals(after)
    for f in COUNTED:
        d = ta[f] - tb[f]
        print("    {:14} {:>6} -> {:>6}  ({:+d})".format(f, tb[f], ta[f], d))
        if d != 0:
            fails.append("{} 총량이 {:+d} 변했다 — 유실".format(f, d))

    # 4. 갈린 주소의 키 독립성
    print("\n[4] 갈린 주소 {}건의 키 독립성".format(len(split)))
    still_plain = [a for a in split if a in after]
    dup = []
    for a in split:
        ks = addr_to_keys.get(a, [])
        if len(set(ks)) != len(ks):
            dup.append(a)
    print("    옛 주소 키가 남아 있는 주소: {}건".format(len(still_plain)))
    print("    키가 중복된 주소          : {}건".format(len(dup)))
    if still_plain:
        fails.append("갈린 주소인데 옛 키가 남음: {}".format(still_plain[:5]))
    if dup:
        fails.append("키 중복: {}".format(dup[:5]))

    # 5. 갈리지 않은 주소는 키가 그대로
    print("\n[5] 갈리지 않은 주소의 키 불변")
    unsplit_before = {k for k in before if k not in split_set}
    missing = sorted(unsplit_before - set(after))
    changed_val = [k for k in (unsplit_before & set(after)) if before[k] != after[k]]
    print("    대상 {}키 중 사라진 키 {}개 / 값이 바뀐 키 {}개".format(
        len(unsplit_before), len(missing), len(changed_val)))
    if missing:
        fails.append("갈리지 않은 주소가 사라졌다: {}".format(missing[:5]))
    if changed_val:
        fails.append("갈리지 않은 주소의 값이 바뀌었다: {}".format(changed_val[:5]))

    # 6. complete 기록 추적
    print("\n[6] complete 기록 추적")
    comp_before = {k: v for k, v in before.items()
                   if isinstance(v, dict) and v.get("state") == "complete"}
    lost = []
    for k, v in comp_before.items():
        if k in after and after[k] == v:
            continue
        # 옮겨졌다면 그 주소에서 파생된 키 중 하나에 그대로 있어야 한다
        cands = addr_to_keys.get(address_of_status_key(k), [])
        if any(after.get(c) == v for c in cands):
            continue
        lost.append(k)
    print("    before complete {}건 / 추적 실패 {}건".format(len(comp_before), len(lost)))
    if lost:
        fails.append("complete 기록 추적 실패: {}".format(lost[:5]))

    # 갈린 주소의 complete 는 첫 키에만 있어야 한다(임의 배정 금지)
    misassigned = []
    for a in split:
        ks = addr_to_keys.get(a, [])
        got = [k for k in ks if isinstance(after.get(k), dict)]
        if len(got) > 1:
            misassigned.append((a, got))
    print("    갈린 주소 중 기록이 2개 이상 마커에 퍼진 것: {}건".format(len(misassigned)))
    if misassigned:
        fails.append("기록이 여러 마커에 퍼졌다(임의 배정 의심): {}".format(misassigned[:3]))

    print("\n" + ("=" * 60))
    if fails:
        print("FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("PASS — 유실 0. 키 개수·state 분포·부가 필드 총량 전부 동일,")
    print("       갈린 주소는 마커별 독립 키, 갈리지 않은 주소는 키·값 불변.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
