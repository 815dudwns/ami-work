#!/usr/bin/env python3
"""완료 아카이브 8월 구간 복구 — 빠져 있던 두 구간을 아카이브 파일로 만든다.

무슨 일이었나 (영준님 2026-09-15 "8월 데이터가 백업을 안 해 날아간 거니? 복구해봐")
  **데이터가 날아간 게 아니다.** 아카이브 파일을 안 만들었을 뿐이고 백업에 원본이 그대로 있다.
  완료 아카이브가 20260704·20260909 두 개뿐인데 그 사이 리스트 교체가 두 번 더 있었다
  (8/2 0731리스트 투입 · 8/31 리스트업). 그 구간에서 리스트에 빠진 건이 아카이브로 안 갔다.
  그래서 통계 분모가 완료분의 40%를 잃은 채 집계되고 있었다(26,203 -> 43,676).

무엇을 담나
  아카이브는 "완료" 목록이 아니라 **"그 리스트업에서 빠진 것"** 목록이다.
  그래서 pending·기록없음도 담는다 — 기존 20260909 아카이브도 그렇게 만들어져 있다
  (pending 47 · 기록없음 38). 상태로 거르지 않는다.

계산
  구간1 = set(8/2 직전 백업) - set(8/31 직전 백업)
  구간2 = set(8/31 직전 백업) - set(9/9 직전 백업)
  제외  = 기존 아카이브 2개 ∪ 현재 site-data.json
          (9/9 아카이브와 겹치는 것은 중복이고, 현재 실효에 남은 것은 아직 작업 대상이다)

★레코드는 백업 파일의 것을 **그대로** 옮긴다. 새로 만들지 않는다 —
  필드 구조가 기존 아카이브와 같아야 통계가 같은 방식으로 읽는다.
★파일명은 `site-data-completed-archive-*.json` 패턴을 지켜야 `archivesGlob` 이 읽는다.
★`gen_stats_index.py` 는 여기서 돌리지 않는다 — 데스크 워크트리에서 돌리면 분모 파일을
  못 찾아 조용히 깎인다([[stats_index_main_worktree_only]]). PM 이 main 에서 돌린다.

사용:
    python3 scripts/rebuild_completed_archive_aug.py            # 예행(파일 안 씀)
    python3 scripts/rebuild_completed_archive_aug.py --apply
"""

import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data'

SRC_0802 = D / 'site-data.backup-0731투입전-20260802-105945.json'
SRC_0831 = D / 'site-data.backup-리스트업전-20260831-030051.json'
SRC_0909 = D / 'ami-site-data-backup-리스트업전-20260909-190530.json'
ARC_0704 = D / 'site-data-completed-archive-20260704.json'
ARC_0909 = D / 'site-data-completed-archive-20260909.json'
SITE = D / 'site-data.json'

OUT_0802 = D / 'site-data-completed-archive-20260802.json'
OUT_0831 = D / 'site-data-completed-archive-20260831.json'

EXPECTED_TOTAL = 17473


def norm_meter(v) -> str:
    """계기번호 정규화 — 영문 접두 보존([[meter_no_prefix_preserve]]).

    ★숫자만 뽑으면 `A0530188699` 가 `00530188699` 가 되고 `LA530151258` 은 자릿수까지 밀린다.
      영문자가 섞이면 그대로 두고, 순수 숫자일 때만 zfill(11) 한다.
    """
    s = re.sub(r'[\s\-]', '', str(v or '')).strip()
    if not s or s.lower() in ('nan', 'none'):
        return ''
    if re.search(r'[A-Za-z]', s):
        return s.upper()
    return s.zfill(11)


def load(p):
    return json.loads(p.read_text(encoding='utf-8'))


def keyset(rows):
    return {norm_meter(r.get('계기번호')) for r in rows if norm_meter(r.get('계기번호'))}


def main():
    apply = '--apply' in sys.argv

    for p in (SRC_0802, SRC_0831, SRC_0909, ARC_0704, ARC_0909, SITE):
        if not p.exists():
            sys.exit(f'원천 없음: {p}')

    b0802, b0831, b0909 = load(SRC_0802), load(SRC_0831), load(SRC_0909)
    a0704, a0909, site = load(ARC_0704), load(ARC_0909), load(SITE)
    print(f'원천: 8/2백업 {len(b0802):,} · 8/31백업 {len(b0831):,} · 9/9백업 {len(b0909):,}')
    print(f'      기존아카이브 {len(a0704):,} + {len(a0909):,} · 현재 실효 {len(site):,}')

    k0831, k0909 = keyset(b0831), keyset(b0909)
    exclude = keyset(a0704) | keyset(a0909) | keyset(site)
    print(f'제외 집합(기존 아카이브 ∪ 현재 실효): {len(exclude):,}')

    # 구간1·2 — 리스트에서 빠진 것
    seg1 = [r for r in b0802 if norm_meter(r.get('계기번호')) and norm_meter(r.get('계기번호')) not in k0831]
    seg2 = [r for r in b0831 if norm_meter(r.get('계기번호')) and norm_meter(r.get('계기번호')) not in k0909]
    print(f'\n구간1(8/2 -> 8/31) {len(seg1):,} · 구간2(8/31 -> 9/9) {len(seg2):,}')

    # 제외 적용. 구간2는 구간1과도 겹치지 않게 한다(두 파일 사이 중복 0이 게이트다).
    out1, seen = [], set()
    for r in seg1:
        k = norm_meter(r.get('계기번호'))
        if k in exclude or k in seen:
            continue
        seen.add(k)
        out1.append(r)
    out2 = []
    for r in seg2:
        k = norm_meter(r.get('계기번호'))
        if k in exclude or k in seen:
            continue
        seen.add(k)
        out2.append(r)

    print(f'제외 적용 후: {OUT_0802.name} {len(out1):,} · {OUT_0831.name} {len(out2):,} '
          f'· 합 {len(out1) + len(out2):,}')

    # ─ 게이트 ─
    k1, k2 = keyset(out1), keyset(out2)
    problems = []
    if k1 & k2:
        problems.append(f'새 파일 두 개 사이 중복 {len(k1 & k2)}건')
    for nm, ks in (('20260704', keyset(a0704)), ('20260909', keyset(a0909)), ('site-data', keyset(site))):
        dup = (k1 | k2) & ks
        if dup:
            problems.append(f'{nm} 와 중복 {len(dup)}건')
    total = len(out1) + len(out2)
    if total != EXPECTED_TOTAL:
        problems.append(f'합계가 {total:,} — 기대 {EXPECTED_TOTAL:,} 와 다르다')

    # ─ 필드 검사 ─
    # ★"기존 아카이브와 필드가 완전히 같아야 한다"로 검사하면 안 된다 —
    #   **기존 아카이브 두 개끼리도 이미 다르다**(20260704 는 27필드, 20260909 는 29필드).
    #   스키마는 시점마다 바뀌었고, 아카이브는 그 시점 스냅샷을 그대로 담는 것이 관행이다.
    #   억지로 맞추려면 없는 값을 지어내야 하는데 그게 더 나쁘다.
    # ★그래서 **통계가 실제로 읽는 필드**가 있는지만 본다(gen_stats_index.py).
    #   아카이브는 지도에 안 올라가므로(onMap:false·archivesGlob) 나머지 필드는 화면에 안 쓰인다.
    NEED = ('지사', '주소', '계기번호', 'lat', 'lng')
    for nm, rows in ((OUT_0802.name, out1), (OUT_0831.name, out2)):
        if not rows:
            continue
        missing = [f for f in NEED if not all(f in r for r in rows)]
        if missing:
            problems.append(f'{nm} 에 통계 필수 필드 누락: {missing}')

    print('\n=== 게이트 ===')
    print(f'  새 파일 두 개 사이 중복: {len(k1 & k2)}')
    for nm, ks in (('20260704', keyset(a0704)), ('20260909', keyset(a0909)), ('site-data', keyset(site))):
        print(f'  {nm} 와 중복: {len((k1 | k2) & ks)}')
    print(f'  합계: {total:,} (기대 {EXPECTED_TOTAL:,}) {"일치" if total == EXPECTED_TOTAL else "★불일치"}')
    print(f'  통계 필수 필드(지사·주소·계기번호·lat·lng): '
          f'{"전건 보유" if not any("필수 필드" in p for p in problems) else "★누락"}')
    # 참고 — 스키마 차이는 정상이다(기존 아카이브끼리도 다르다). 무엇이 다른지는 남겨 둔다.
    for nm, rows in ((OUT_0802.name, out1), (OUT_0831.name, out2)):
        if rows:
            got, ref9 = set(rows[0].keys()), set(a0909[0].keys())
            print(f'  [참고] {nm} 필드 {len(got)}개 · 20260909({len(ref9)}개) 대비 '
                  f'빠짐 {len(ref9 - got)} 더함 {len(got - ref9)}')
    nullc = sum(1 for r in out1 + out2 if r.get('lat') is None or r.get('lng') is None)
    print(f'  좌표 null: {nullc:,} / {total:,}')

    st = collections.Counter()
    for r in out1 + out2:
        st[str(r.get('교체사유') or '(빈)')] += 1
    print(f'  교체사유 상위: {dict(st.most_common(4))}')

    if problems:
        print('\n★게이트 실패 — 파일을 쓰지 않는다:')
        for p in problems:
            print('   -', p)
        return 1

    if not apply:
        print('\n(예행 — 파일 안 씀. 적용하려면 --apply)')
        return 0

    OUT_0802.write_text(json.dumps(out1, ensure_ascii=False, indent=1), encoding='utf-8')
    OUT_0831.write_text(json.dumps(out2, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'\n저장: {OUT_0802.name} {len(out1):,} · {OUT_0831.name} {len(out2):,}')
    print('※통계 인덱스는 여기서 돌리지 않는다 — PM 이 main 워크트리에서 돌린다.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
