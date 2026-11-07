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
"""
import glob
import json
import os
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / 'scripts'))
from datasets import DATASETS  # noqa: E402

DST = BASE / 'data' / 'meter-list-index.json'
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
        paths = []
        if d.get('file'):
            paths.append(BASE / d['file'])
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


def main():
    rows = []      # (code, meterNo, 고객번호)
    lists = covered()
    for d, paths, missing in lists:
        for p in missing:
            print(f'  [경고] {d["code"]} 파일 없음: {p.relative_to(BASE)}')
        for p in paths:
            for it in _items(json.loads(p.read_text(encoding='utf-8'))):
                mk = d.get('metersKey')
                if mk:
                    for m in (it.get(mk) or []):
                        rows.append((d['code'], norm(m.get('계기번호')), ''))
                else:
                    rows.append((d['code'], norm(it.get('계기번호')), str(it.get('고객번호') or '').strip()))
    # 합동 x 실효 중복은 실효로 (gen_stats_index.py 와 같은 규칙 — 기존 라벨 유지)
    sil_cust = {c for code, _, c in rows if code == 's' and c}
    rows = [(code, no, c) for code, no, c in rows if not (code == 'h' and c in sil_cust)]

    order = ORDER_FIXED + ''.join(d['code'] for d, _, _ in lists if d['code'] not in ORDER_FIXED)
    idx = {}
    for code, no, _ in rows:
        if no:
            idx.setdefault(no, set()).add(code)
    out = {k: ''.join(ch for ch in order if ch in v) for k, v in sorted(idx.items())}
    names = {d['code']: SHORT.get(d['code']) or d.get('statsLabel') or d.get('uiLabel') or d['category']
             for d, _, _ in lists}
    out = {'__names': names, **out}
    DST.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(len(out) - 1, 'meters ->', DST, os.path.getsize(DST), 'bytes · lists', ''.join(names), names)


if __name__ == '__main__':
    main()
