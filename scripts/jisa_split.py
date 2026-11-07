#!/usr/bin/env python3
"""Per-지사 file split for big lists (2026-11-08, 미조치 first).

jisa_of() mirrors js/map.js jisaOf()/itemGuOf()/guOf() exactly — the map filters markers by that
function, so a row must sit in the file of the 지사 the map would put it in.
Each row goes to the file of its own jisa_of() — exactly what the map shows under that 지사.
★Status keys '주소|<list>' are computed per 주소 within a list. An address whose rows land in two files
  (주소 with no 구 → falls back to the row's 지사 field) is safe only while its rows share one coordinate;
  key_diff() is the gate — run it on every split.
"""
import json
import re

JISA_TO_GU = {
    '강북성북지사': ['강북구', '성북구'],
    '광진성동지사': ['광진구', '성동구'],
    '노원도봉지사': ['노원구', '도봉구'],
    '동대문중랑지사': ['동대문구', '중랑구'],
    '마포용산지사': ['마포구', '용산구'],
    '서대문은평지사': ['서대문구', '은평구'],
    '서울본부직할': ['종로구', '중구'],
}
# ASCII file names — Korean names in URLs/paths risk NFC/NFD drift on macOS. '미분류' = no 구 found.
JISA_SLUG = {
    '강북성북지사': 'gangbuk', '광진성동지사': 'gwangjin', '노원도봉지사': 'nowon',
    '동대문중랑지사': 'dongdaemun', '마포용산지사': 'mapo', '서대문은평지사': 'seodaemun',
    '서울본부직할': 'jikhal', '미분류': 'unclassified',
}
GU_TO_JISA = {g: j for j, gs in JISA_TO_GU.items() for g in gs}
DONG_TO_GU = {'면목동': '중랑구'}
_GU = re.compile(r'(\S+구)(\s|$)')
_DONG = re.compile(r'([가-힣]+[동읍면])')


def gu_of(addr):
    a = addr or ''
    m = _GU.search(a)
    if m:
        return m.group(1)
    dm = _DONG.search(a)
    if dm and dm.group(1) in DONG_TO_GU:
        return DONG_TO_GU[dm.group(1)]
    return None


def item_gu_of(r):
    return gu_of(r.get('주소')) or gu_of(r.get('도로명주소')) or gu_of(r.get('지번주소'))


def jisa_of(r):
    j = GU_TO_JISA.get(item_gu_of(r))
    if j:
        return j
    raw = str(r.get('지사') or '').strip()
    return raw if raw in JISA_TO_GU else '미분류'


def split_rows(rows):
    """-> ({지사: [rows]}, cross) — rows keep their order inside each file.
    cross = addresses whose rows went to more than one file (see key_diff)."""
    out, seen = {}, {}
    for r in rows:
        j = jisa_of(r)
        out.setdefault(j, []).append(r)
        seen.setdefault(r.get('주소'), set()).add(j)
    return out, sorted(a for a, js in seen.items() if len(js) > 1)


def key_diff(rows, parts, category):
    """Status keys with all rows loaded vs each part loaded alone. Returns [(계기번호, full, alone)]."""
    import status_key as S

    def keys(rs):
        rs = [dict(r, category=category) for r in rs]
        idx = S.build_status_key_index(rs)
        bm = idx[0] if isinstance(idx, tuple) else idx
        return [S.status_key_of(r, bm) for r in rs]
    full = keys(rows)
    pos = {id(r): i for i, r in enumerate(rows)}
    bad = []
    for part in parts.values():
        for r, k in zip(part, keys(part)):
            if full[pos[id(r)]] != k:
                bad.append((r.get('계기번호'), full[pos[id(r)]], k))
    return bad


def files_by_jisa(template):
    """'data/michochi/{slug}.json' -> {지사: path} for every 지사 incl. 미분류."""
    return {j: template.format(slug=s) for j, s in JISA_SLUG.items()}
