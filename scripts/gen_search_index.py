#!/usr/bin/env python3
"""Dataset registry -> data/search-index.json — the map's search box reads this (js/map.js runSearch).

Why (2026-11-10, 영준님 "검색에 안되자나" / "완료아카이브도 검색되게"):
  search used to scan only `sampleData` = the lists loaded right now. 미조치 is per-지사 and deferred, so with
  the list off or another 지사 selected a 미조치 meter was "결과 없음". Archives are never on the map at all.
  This index covers EVERY registry list (all 지사 files) + every archive, whatever is selected. The map loads
  it once, the first time the search panel opens (not at map start).

What goes in
  - every registry dataset with files: its map files (fileByJisa = all 지사) + archives + archivesGlob
  - lists taken off the map (onMap False) too — their rows open read-only like archives
  - 'x' 추가 (source workStatus) has no file; the map still finds those in sampleData
  - account-limited lists (LP무기록 owner, 광명 kmtest) ARE included; the map hides them per account with the
    same registry check as the list menu (datasetVisibleToUser). The data files are already public on Pages.

Format (compact, dictionary-encoded):
  {"v":1, "gen": KST ISO,
   "slots": [[code, kind], ...]       kind 0 = map file, 1 = archive file
   "jisa":  [지사, ...]                지사 = scripts/jisa_split.py jisa_of (= js/map.js jisaOf)
   "sites": [[주소, 도로명주소,   (앞 '서울특별시 ' 를 뗀 값 — ADDR_PREFIX) latE6, lngE6, jisaIdx], ...]   one per distinct tuple; lat/lng int(x 1e6) or null
   "rows":  [meterNo, siteIdx, slotIdx, meterNo, siteIdx, slotIdx, ...]   flat
  }
  A row with an empty 계기번호 is kept (address search still finds the site).

★Generate on MAIN — some archive files are not in git (site-data-completed-archive-20260704.json), so a desk
  worktree silently drops rows. Same shrink guard as gen_stats_index.py: if any slot gets smaller than the
  previous file, stop (pass --allow-shrink when a list really shrank). gen_stats_index.py calls main() at its end.
"""
import glob
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / 'scripts'))
from datasets import DATASETS, dataset_files  # noqa: E402
from jisa_split import jisa_of  # noqa: E402

DST = BASE / 'data' / 'search-index.json'


def _items(v):
    if isinstance(v, list):
        return [x for x in v if isinstance(x, dict)]
    if isinstance(v, dict):
        return [x for x in v.values() if isinstance(x, dict)]
    return []


def _e6(v):
    try:
        return None if v is None or v == '' else int(round(float(v) * 1e6))
    except (TypeError, ValueError):
        return None


def _s(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()


# 주소 앞 '서울특별시 ' 는 거의 모든 행에 붙어 있어 떼서 싣는다(약 3MB). 지도는 화면에 다시 붙인다(js/map.js SEARCH_ADDR_PREFIX).
ADDR_PREFIX = '서울특별시 '


def _a(v):
    v = _s(v)
    return v[len(ADDR_PREFIX):] if v.startswith(ADDR_PREFIX) else v


def sources():
    """(code, kind, path) — kind 0 = map file, 1 = archive. Missing files reported separately."""
    out, missing = [], []
    for d in DATASETS:
        if d.get('source') == 'workStatus':
            continue
        paths = [(0, BASE / f) for f in dataset_files(d)]
        paths += [(1, BASE / a) for a in d.get('archives', [])]
        if d.get('archivesGlob'):
            paths += [(1, Path(p)) for p in sorted(glob.glob(str(BASE / d['archivesGlob'])))]
        # 'a'(실효 옛 완료 아카이브)는 레지스트리상 파일이 전부 archivesGlob 이다 — 그대로 archive(1)
        for kind, p in paths:
            if p.exists():
                out.append((d['code'], kind, p))
            elif not (d.get('fileByJisa') and kind == 0):   # 지사별 파일은 없는 지사(미분류)가 정상이다
                missing.append((d['code'], kind, p))
    return out, missing


def build():
    srcs, missing = sources()
    slots, slot_ix = [], {}
    jisa, jisa_ix = [], {}
    sites, site_ix = [], {}
    rows = []
    for code, kind, p in srcs:
        sk = (code, kind)
        if sk not in slot_ix:
            slot_ix[sk] = len(slots)
            slots.append([code, kind])
        si = slot_ix[sk]
        mk = next((d.get('metersKey') for d in DATASETS if d['code'] == code), None)
        for it in _items(json.loads(p.read_text(encoding='utf-8'))):
            j = jisa_of(it)
            if j not in jisa_ix:
                jisa_ix[j] = len(jisa)
                jisa.append(j)
            key = (_a(it.get('주소')), _a(it.get('도로명주소')), _e6(it.get('lat')), _e6(it.get('lng')), jisa_ix[j])
            if key not in site_ix:
                site_ix[key] = len(sites)
                sites.append(list(key))
            ix = site_ix[key]
            meters = [m.get('계기번호') for m in (it.get(mk) or [])] if mk else [it.get('계기번호')]
            for m in meters or ['']:
                rows += [_s(m), ix, si]
    return {'v': 1, 'gen': datetime.now(ZoneInfo('Asia/Seoul')).isoformat(timespec='seconds'),
            'slots': slots, 'jisa': jisa, 'sites': sites, 'rows': rows}, srcs, missing


def slot_counts(idx):
    c = Counter()
    rows = idx.get('rows') or []
    for i in range(2, len(rows), 3):
        code, kind = idx['slots'][rows[i]]
        c[f'{code}{kind}'] += 1
    return c


def main(allow_shrink=None, dst=None):
    global DST
    if dst:
        DST = Path(dst)
    if allow_shrink is None:
        allow_shrink = '--allow-shrink' in sys.argv
    idx, srcs, missing = build()
    for code, kind, p in missing:
        print(f'  [경고] 검색 인덱스 {code} 파일 없음: {p.relative_to(BASE)}')
    new = slot_counts(idx)
    if DST.exists():
        try:
            old = slot_counts(json.loads(DST.read_text(encoding='utf-8')))
            shrunk = [(k, old[k], new.get(k, 0)) for k in sorted(old) if new.get(k, 0) < old[k]]
        except Exception as e:  # noqa: BLE001
            print(f'  [경고] 기존 검색 인덱스를 못 읽어 줄어듦 검사를 건너뛴다: {e}')
            shrunk = []
        if shrunk and not allow_shrink:
            print('\n★중단 — 검색 인덱스가 줄어든다(슬롯 = 리스트코드+0지도/1아카이브). 분모 파일이 이 워크트리에 없을 때 나는 증상이다.')
            for k, was, now in shrunk:
                print(f'   {k}: {was:,} -> {now:,} ({now - was:+,})')
            print('  ▸ main 워크트리에서 생성한다. 정말 줄어드는 것이 맞으면 --allow-shrink')
            sys.exit(1)
    DST.write_text(json.dumps(idx, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'search-index.json: 계기행 {len(idx["rows"]) // 3:,} · 개소 {len(idx["sites"]):,} · 파일 {len(srcs)} · '
          f'{os.path.getsize(DST):,} bytes · 슬롯 {dict(sorted(new.items()))}')


if __name__ == '__main__':
    main()
