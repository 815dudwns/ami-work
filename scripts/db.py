#!/usr/bin/env python3
"""db.py — data/ami.db 조회. 계기번호 하나로 전 테이블을 훑는다.

왜 있나: 계기 하나의 시공 여부를 메일함 뒤져 확인하느라 30분을 쓴 적이 있다(2026-09-08).
  이제 `python3 scripts/db.py <계기번호>` 한 줄이면 끝난다.

사용
  python3 scripts/db.py 05455508265         # 값 하나로 전 테이블 횡단 검색
  python3 scripts/db.py 01254525812         # MAC 도 같은 방법으로
  python3 scripts/db.py --sql "SELECT ..."  # 생 SQL
  python3 scripts/db.py --tables            # 테이블·행수·스냅샷 목록

동작
  - 숫자 11자리   -> 계기번호_norm 으로 조회(앞 0 자동 보정)
  - MAC 형태      -> mac_norm
  - 10자리 숫자   -> 고객번호_norm 도 함께 본다
  - 그 외         -> 전 텍스트 열 LIKE

출력은 사람이 읽는 세로 표다. 빈 값은 생략하고, 최신 snapshot 을 먼저 보여준다.
DB 만들기: python3 scripts/xlsx_to_db.py --all
"""
import argparse
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'data' / 'ami.db'

# 검색 결과에서 앞쪽에 보여줄 열 — 눈에 먼저 들어와야 하는 것들
PRIORITY = ['snapshot', '지사', '지역본부', '진행 상태', '상태', '계기번호', '계기번호_norm',
            'LP', '작업일자', '작업구분', '모뎀유형', '기술타입', '시설유형',
            '기존모뎀MAC', 'DCUID', '변대주번호', '개통여부', '작업자1', '작업자2']
HIDE = {'src_file'}


def tables(con):
    return [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name")]


def cols_of(con, t):
    return [r[1] for r in con.execute(f'PRAGMA table_info("{t}")')]


def id_candidates(q):
    """질의어 -> {정규화 열: 찾을 값}. 아이디로 볼 수 없으면 빈 dict.

    ★한전 모뎀MAC 은 `01254525812` 처럼 **11자리 숫자**로 들어 있다(12자리 16진수도 섞여 있다).
      그래서 '11자리면 계기번호'로 단정하면 MAC 검색이 통째로 빗나간다(실측 2026-09-08).
      종류를 하나로 찍지 말고 **가능한 정규화 열을 전부 OR 로 건다** — 어차피 인덱스라 즉시다.
    """
    plain = re.sub(r'[\s\-:.]', '', q).upper()
    if not re.fullmatch(r'[0-9A-Z]{9,17}', plain):
        return {}
    digits = re.sub(r'\D', '', plain)
    out = {}
    if digits and len(digits) <= 11:
        out['계기번호_norm'] = digits.zfill(11)
    out['mac_norm'] = plain
    if len(plain) == 10:
        out['고객번호_norm'] = plain
    return out


def show_row(row, cols, indent='   '):
    d = {c: row[i] for i, c in enumerate(cols)}
    order = [c for c in PRIORITY if c in d] + [c for c in cols if c not in PRIORITY]
    for c in order:
        if c in HIDE:
            continue
        v = d.get(c)
        if v is None or str(v).strip() in ('', '-'):
            continue
        print(f'{indent}{c:<22} {v}')


def search(con, q, limit_old=3):
    cand = id_candidates(q)
    if cand:
        desc = ' / '.join(f'{k.replace("_norm", "")}={v}' for k, v in cand.items())
        print(f'질의: {q}   아이디로 조회 ({desc})')
    else:
        print(f'질의: {q}   전 텍스트 열 검색')
    print('=' * 68)

    hit_tables = _run(con, q, cand, limit_old)
    if not hit_tables and cand:
        # 아이디로 못 찾으면 원문 그대로 텍스트 검색까지 해 본다(정규화 열이 없는 시트 대비)
        print('아이디 열에서 못 찾아 텍스트 검색으로 한 번 더 본다.\n')
        hit_tables = _run(con, q, {}, limit_old)

    if not hit_tables:
        print('\n찾은 것 없음.')
    print()
    return 0 if hit_tables else 1


def _run(con, q, cand, limit_old):
    hit_tables = 0
    for t in tables(con):
        cols = cols_of(con, t)
        usable = {c: v for c, v in cand.items() if c in cols}
        if usable:
            where = ' OR '.join(f'"{c}"=?' for c in usable)
            params = list(usable.values())
        else:
            if cand:
                continue        # 아이디 조회인데 이 표엔 정규화 열이 없다 -> 2차에서 본다
            tgt = [c for c in cols if c not in HIDE]
            if not tgt:
                continue
            where = ' OR '.join(f'"{c}" LIKE ?' for c in tgt)
            params = [f'%{q}%'] * len(tgt)

        order = ' ORDER BY snapshot DESC' if 'snapshot' in cols else ''
        try:
            rows = con.execute(f'SELECT * FROM "{t}" WHERE {where}{order}', params).fetchall()
        except sqlite3.OperationalError:
            continue
        if not rows:
            continue

        hit_tables += 1
        snaps = [r[cols.index('snapshot')] for r in rows] if 'snapshot' in cols else []
        newest = snaps[0] if snaps else None
        head = [r for r in rows if not snaps or r[cols.index('snapshot')] == newest]
        older = len(rows) - len(head)

        print(f'\n[{t}]  {len(rows)}건'
              + (f'  (최신 snapshot {newest})' if newest else ''))
        for i, r in enumerate(head[:limit_old]):
            if i:
                print('   ' + '-' * 40)
            show_row(r, cols)
        if len(head) > limit_old:
            print(f'   … 같은 snapshot {len(head) - limit_old}건 더')
        if older:
            os_ = sorted({s for s in snaps if s != newest}, reverse=True)
            print(f'   · 이전 스냅샷 {older}건 더 ({", ".join(os_)})')

    return hit_tables


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('query', nargs='?')
    ap.add_argument('--sql')
    ap.add_argument('--tables', action='store_true')
    ap.add_argument('--db', default=str(DB_PATH))
    args = ap.parse_args()

    db = Path(args.db)
    if not db.exists():
        print(f'DB 가 없다: {db}\n먼저 만들어라: python3 scripts/xlsx_to_db.py --all')
        return 2
    con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)

    if args.tables:
        print(f'{db}  ({db.stat().st_size / 1e6:.1f} MB)')
        for t in tables(con):
            n = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            cs = cols_of(con, t)
            snaps = ([r[0] for r in con.execute(
                f'SELECT DISTINCT snapshot FROM "{t}" ORDER BY snapshot DESC')]
                if 'snapshot' in cs else [])
            print(f'  {t:34} {n:>8,}행  열 {len(cs):>3}  snapshot {",".join(snaps)}')
        return 0

    if args.sql:
        cur = con.execute(args.sql)
        names = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
        if names:
            print(' | '.join(names))
            print('-' * 68)
        for r in rows:
            print(' | '.join('' if v is None else str(v) for v in r))
        print(f'\n{len(rows)}행')
        return 0

    if not args.query:
        ap.error('검색어나 --sql / --tables 중 하나가 필요하다')
    return search(con, args.query)


if __name__ == '__main__':
    sys.exit(main())
