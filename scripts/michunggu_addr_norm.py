#!/usr/bin/env python3
"""Normalise 25미청구 addresses that arrive in the 한전 원문 form (영준님 2026-10-27).

Problem: 72 rows (서울본부직할 69 · 서대문은평 2 · 강북성북 1, source jongno_jungong) carried
  '주소' = '옥인6가길 46(누상동  166-19,1차102호 넥스빌)' — no 시·구, 지번 and unit mixed into
  brackets. The map could not find the 구, filed them under '미분류', and the 구 filter hid them.

Target scheme = the one the other ~7,800 미청구 rows already use:
  주소       = '서울특별시 <구> <동> <지번>'   (지번 form — same building as other rows -> same key)
  지번주소   = same as 주소
  동호수     = text after the comma inside the brackets ('1차102호 넥스빌'), else ''
  도로명주소 = unchanged ('서울특별시 종로구 옥인6가길 46')
  주소_원문  = the original value (kept only if not already set)
Rows whose '주소' is empty but have 도로명주소 get 주소 = 도로명주소 (no 지번 to recover).
Coordinates, meter numbers and every other field are untouched. Idempotent: rows already in
'<시도> <구/시/군> ...' form are skipped.

    from michunggu_addr_norm import normalize_rows
    stat = normalize_rows(rows)          # mutates rows in place, returns counts + examples

CLI (in-place):
    python3 scripts/michunggu_addr_norm.py data/michunggu-data.json [--dry]
"""
import json
import re
import sys
from pathlib import Path

OK_RE = re.compile(r'^(서울특별시|서울|경기도) \S+[구시군]')
RAW_RE = re.compile(r'^(?P<road>.+?)\((?P<dong>\S+?[동가로리])\s+(?P<jibun>(산\s*)?[\d-]+)(\s*,\s*(?P<unit>.*?))?\)\s*$')
GU_RE = re.compile(r'(\S+구)(\s|$)')

# ★Held back (PM decision pending, 2026-10-27): normalising these would merge them into an
#   existing 미청구 address whose workStatus is already 'complete' (another worker finished the
#   one meter that marker showed). They would turn grey without anyone visiting them.
#   They stay in 원문 form — the map still files them under the right 구 via itemGuOf.
#   Remove from this set once decided.
HOLD_METERS = {
    '05530130138': '무악동 63-9 — 기존 08550123695 와 합쳐짐, 그 키는 complete(신완식 2026-10-26)',
    '05530132367': '무악동 63-9 — 위와 같음',
    '92190335822': '행촌동 210-80 — 기존 45190050228 와 합쳐짐, 그 키는 complete(신완식 2026-09-22)',
    '92190414187': '행촌동 210-80 — 위와 같음',
    '92190508284': '행촌동 210-80 — 위와 같음',
}


def _gu(*addrs):
    for a in addrs:
        m = GU_RE.search(str(a or ''))
        if m:
            return m.group(1)
    return None


def normalize_rows(rows):
    st = {'정규화': 0, '빈주소_도로명': 0, '보류': 0, '주소없음': 0, '실패': [], '예시': []}
    for r in rows:
        a = str(r.get('주소') or '').strip()
        if a and OK_RE.match(a):
            continue
        if str(r.get('계기번호') or '').strip() in HOLD_METERS:
            st['보류'] += 1
            continue
        road = str(r.get('도로명주소') or '').strip()
        if not a and not road:          # 주소대기분 — 고칠 재료가 없다(실패 아님)
            st['주소없음'] += 1
            continue
        if not a:
            if road and OK_RE.match(road):
                r['주소'] = road
                st['빈주소_도로명'] += 1
                if len(st['예시']) < 6:
                    st['예시'].append(('', road, '', ''))
            else:
                st['실패'].append((a, road, r.get('계기번호')))
            continue
        m = RAW_RE.match(a)
        gu = _gu(road, r.get('지번주소'))
        if not m or not gu:
            st['실패'].append((a, road, r.get('계기번호')))
            continue
        jibun = re.sub(r'\s+', ' ', m.group('jibun')).strip()
        new = f"서울특별시 {gu} {m.group('dong')} {jibun}"
        unit = (m.group('unit') or '').strip()
        if not str(r.get('주소_원문') or '').strip():
            r['주소_원문'] = a
        r['주소'] = new
        r['지번주소'] = new
        r['동호수'] = unit
        st['정규화'] += 1
        if len(st['예시']) < 6:
            st['예시'].append((a, new, unit, road))
    return st


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    if not args:
        sys.exit(__doc__)
    p = Path(args[0])
    rows = json.loads(p.read_text(encoding='utf-8'))
    st = normalize_rows(rows)
    print(f"정규화 {st['정규화']} · 빈 주소에 도로명 {st['빈주소_도로명']} · 보류 {st['보류']} · 실패 {len(st['실패'])}")
    for e in st['예시']:
        print('  ', e)
    for e in st['실패']:
        print('  실패', e)
    if not dry and (st['정규화'] or st['빈주소_도로명']):
        p.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'저장 {p}')


if __name__ == '__main__':
    main()
