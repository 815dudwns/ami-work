#!/usr/bin/env python3
"""Dataset registry -> data/meter-list-index.json  {meterNo: "codes", "__names": {code: label}}.

Used by the helper (awms-bridge-inject.js meter check) and the 아미큐 backend (list badges).

★Built straight from the registry (scripts/datasets.py), not from stats-site-index.json (2026-11-02).
  It used to be derived from the stats index, so a list marked noStats (선조치) never got a label —
  53 선조치 meters, only 4 labelled (through other lists). Now every list our 강북 accounts work from
  is covered and the next new list shows up by itself.

Covered: every registry dataset with a file, including lists taken off the map (onMap False — 고압·장애,
  their meters are still real) and archive files (합동 백업분).
Skipped:
  - 'a' 완료 아카이브 (old completed archive, not a list)
  - allowGroup lists without statsEvenIfGroup (LP무기록 = owner-only check list, 광명 = kmtest's other company)
  - source 'workStatus' (추가 — no file)
  - noLabel lists (미조치 — 145k meters would grow the file 0.6MB -> 3.2MB; the helper fetches it every time)
Kept the same as the old stats-derived index: 합동 rows whose 고객번호 is also in 실효 are counted as 실효
  only (gen_stats_index.py rule, 2026-09-18), so existing labels do not change.

"__names" carries the short label per code so the helper/backend can show a new list without a code change.
  Old helpers (inject <= v92) ignore it — it is just one more key that is never a meter number.

Second output (2026-11-13): data/meter-jisa-index.json — the 지사 of the list rows each meter is in, for the helper's
  "리스트 지사와 다르면 변경" notice (inject v96, 영준님 "계기번호 넣는 순간 리스트 지사와 다르면 변경 메시지").
  {"__v": 1, "__depts": {DEPT2: 지사 이름}, DEPT2: "meter,meter,..."} — grouped by awms 지사 code (DEPT2) so it stays
  ~12 bytes a meter. A meter whose rows sit in two 지사 is in both groups. Same rows as the label index (same lists,
  same 합동 x 실효 rule). A separate file on purpose: meter-list-index.json values are read character by character
  (helper v93+ and the 아미큐 backend /api/michunggu badges) — adding 지사 there would break both.
  지사 names map to DEPT2 by their first 4 characters (JISA_DEPT2); '기타' and unknown names are left out.
"""
import glob
import json
import os
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / 'scripts'))
from datasets import DATASETS, dataset_files  # noqa: E402

DST = BASE / 'data' / 'meter-list-index.json'
JISA_DST_NAME = 'meter-jisa-index.json'
# 지사 이름(앞 4글자) -> awms DEPT2 / 표시 이름. scripts/cst_daily_check.py DEPT_NM 과 같은 코드.
JISA_DEPT2 = {'서울본부': ('7793', '서울본부직할'), '마포용산': ('3600', '마포용산지사'), '서대문은': ('3500', '서대문은평지사'),
              '광진성동': ('3100', '광진성동지사'), '노원도봉': ('3400', '노원도봉지사'), '강북성북': ('4080', '강북성북지사'),
              '동대문중': ('3000', '동대문중랑지사')}
# Code order inside a label. The old fixed order first (labels unchanged), then any newer list in registry order.
ORDER_FIXED = 'shmujgk'
# Short names (same as the helper's LIST_NAMES). A list not here falls back to statsLabel/uiLabel.
SHORT = {'s': '실효', 'h': '합동', 'm': '25미청구', 'u': '25불가', 'j': '장애', 'g': '고압', 'k': 'SKT',
         'p': '선조치'}


def covered():
    out = []
    for d in DATASETS:
        if d['code'] == 'a' or d.get('source') == 'workStatus':
            continue
        # noLabel — 파일이 커서 라벨에서 뺀 리스트(미조치 14만 계기 = 인덱스 0.6MB -> 3.2MB, 2026-11-07)
        if d.get('noLabel'):
            continue
        if d.get('allowGroup') and not d.get('statsEvenIfGroup'):
            continue
        paths = [BASE / f for f in dataset_files(d)]
        paths += [BASE / a for a in d.get('archives', [])]
        if d.get('archivesGlob'):
            paths += [Path(p) for p in sorted(glob.glob(str(BASE / d['archivesGlob'])))]
        out.append((d, [p for p in paths if p.exists()], [p for p in paths if not p.exists()]))
    return out


def _items(v):
    if isinstance(v, list):
        return [x for x in v if isinstance(x, dict)]
    if isinstance(v, dict):
        return [x for x in v.values() if isinstance(x, dict)]
    return []


def norm(no):
    return re.sub(r'[\s\-]', '', str(no or '')).upper()


def main(dst=None):
    dst = Path(dst) if dst else DST
    rows = []      # (code, meterNo, 고객번호, 지사)
    lists = covered()
    for d, paths, missing in lists:
        for p in missing:
            print(f'  [경고] {d["code"]} 파일 없음: {p.relative_to(BASE)}')
        for p in paths:
            for it in _items(json.loads(p.read_text(encoding='utf-8'))):
                mk = d.get('metersKey')
                if mk:
                    for m in (it.get(mk) or []):
                        rows.append((d['code'], norm(m.get('계기번호')), '', str(it.get('지사') or '')))
                else:
                    rows.append((d['code'], norm(it.get('계기번호')), str(it.get('고객번호') or '').strip(),
                                 str(it.get('지사') or '')))
    # 합동 x 실효 중복은 실효로 (gen_stats_index.py 와 같은 규칙 — 기존 라벨 유지)
    sil_cust = {c for code, _, c, _ in rows if code == 's' and c}
    rows = [r for r in rows if not (r[0] == 'h' and r[2] in sil_cust)]

    order = ORDER_FIXED + ''.join(d['code'] for d, _, _ in lists if d['code'] not in ORDER_FIXED)
    idx = {}
    for code, no, _, _ in rows:
        if no:
            idx.setdefault(no, set()).add(code)
    out = {k: ''.join(ch for ch in order if ch in v) for k, v in sorted(idx.items())}
    names = {d['code']: SHORT.get(d['code']) or d.get('statsLabel') or d.get('uiLabel') or d['category']
             for d, _, _ in lists}
    out = {'__names': names, **out}
    # 라벨에 들어가야 할 리스트가 0계기면 멈춘다(2026-11-10) — 경로가 틀렸거나 파일이 없는 것. 조용히 빠지지 않게.
    got = {code for code, no, _, _ in rows if no}
    zero = [d['code'] for d, _, _ in lists if d['code'] not in got]
    if zero:
        print('★중단 — 리스트 라벨에 들어가야 할 레지스트리 리스트가 0계기다:',
              ', '.join(f"{c}({names[c]})" for c in zero), '— 레지스트리 파일 경로와 실제 파일을 확인하라')
        sys.exit(1)
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(len(out) - 1, 'meters ->', dst, os.path.getsize(dst), 'bytes · lists', ''.join(names), names)
    write_jisa(rows, dst.parent / JISA_DST_NAME)


def write_jisa(rows, path):
    """meter -> 지사(DEPT2) 묶음 파일. 라벨 인덱스와 같은 행. 위 docstring."""
    by = {}
    skipped = {}
    for _, no, _, jisa in rows:
        if not no:
            continue
        hit = JISA_DEPT2.get(jisa.strip()[:4])
        if not hit:
            skipped[jisa] = skipped.get(jisa, 0) + 1
            continue
        by.setdefault(hit[0], set()).add(no)
    if not by:
        print('★중단 — 지사 인덱스가 비었다(지사 칸 이름이 JISA_DEPT2 와 안 맞는다)')
        sys.exit(1)
    out = {'__v': 1, '__depts': {c: n for c, n in JISA_DEPT2.values() if c in by}}
    for code in sorted(by):
        out[code] = ','.join(sorted(by[code]))
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    allm = set().union(*by.values())
    multi = sum(1 for m in allm if sum(1 for v in by.values() if m in v) > 1)
    print(len(allm), 'meters ->', path, os.path.getsize(path), 'bytes · 지사', {c: len(v) for c, v in sorted(by.items())},
          '· 두 지사', multi, '· 지사 이름 없음/모름', skipped)


if __name__ == '__main__':
    main()
