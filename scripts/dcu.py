#!/usr/bin/env python3
"""DCU 한 줄 조회 — scripts/db.py 와 같은 사용감

    python3 scripts/dcu.py 0127X54300      # DCU ID
    python3 scripts/dcu.py 0127X543        # 변대주번호(8자리)
    python3 scripts/dcu.py 제기간 44        # 변대주명(부분일치)
    python3 scripts/dcu.py --해지           # 철거판정=해지 전부
    python3 scripts/dcu.py --지사 노원도봉지사 --해지

정본은 ami.db :: dcu_master. 갱신은 scripts/build_dcu_master.py.
★리스트(미청구·실효…)에는 DCU 상태값을 복사해 넣지 마라 — DCUID 만 두고 여기를 조회한다.
"""
import re
import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / 'data/ami.db'
SHOW = ['DCU_ID', '변대주번호', '변대주명', '지사', '차수', '인입망통신방식', '통신사',
        '장애여부', '회선상태', '철거판정', '보강대상여부', '전체호수', 'LTE전환호수',
        '잔여호수', '성공전체계기', 'DCU_IP', '서버시간', 'DCU등록시간', '비고', 'src_snapshot']


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    con = sqlite3.connect(DB)
    c = con.cursor()
    if not c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='dcu_master'").fetchone():
        print('★dcu_master 가 없다 — python3 scripts/build_dcu_master.py 먼저')
        return 1

    where, params = [], []
    dept = None
    if '--지사' in args:
        i = args.index('--지사')
        dept = args[i + 1]
        del args[i:i + 2]
    for flag, val in (('--해지', '해지'), ('--유지', '유지'), ('--미판정', '미판정')):
        if flag in args:
            where.append('철거판정=?')
            params.append(val)
            args.remove(flag)
    if dept:
        where.append('지사=?')
        params.append(dept)

    q = ' '.join(args).strip()
    if q:
        u = q.upper().replace(' ', '')
        if re.fullmatch(r'[0-9A-Z]{10}', u):
            where.append('DCU_ID=?')
            params.append(u)
        elif re.fullmatch(r'[0-9A-Z]{8}', u):
            where.append('변대주번호=?')
            params.append(u)
        else:
            where.append('변대주명 LIKE ?')
            params.append(f'%{q}%')

    sql = f'SELECT {", ".join(SHOW)} FROM dcu_master'
    if where:
        sql += ' WHERE ' + ' AND '.join(where)
    sql += ' ORDER BY 지사, 변대주명 LIMIT 200'
    rows = c.execute(sql, params).fetchall()
    if not rows:
        print('없음')
        return 0
    if len(rows) == 1:
        for k, v in zip(SHOW, rows[0]):
            print(f'  {k:14s} {v}')
    else:
        print(f'{len(rows)}건' + (' (200 에서 잘림)' if len(rows) == 200 else ''))
        print(f'  {"DCU_ID":12s} {"변대주번호":10s} {"변대주명":18s} {"지사":12s} '
              f'{"회선":5s} {"철거판정":6s} 장애여부')
        for r in rows:
            d = dict(zip(SHOW, r))
            print(f'  {d["DCU_ID"]:12s} {d["변대주번호"]:10s} {d["변대주명"][:17]:18s} '
                  f'{d["지사"][:11]:12s} {d["회선상태"]:5s} {d["철거판정"]:6s} {d["장애여부"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
