#!/usr/bin/env python3
"""제외분 통보 이력 — 주덕기 과장에게 무엇을 언제 보고했는지 기록·조회.

  python3 scripts/exclusion_notify.py 현황                      # 축별 통보/미통보
  python3 scripts/exclusion_notify.py 미통보                     # 다음 보고에 넣을 목록
  python3 scripts/exclusion_notify.py 미통보 --csv out.csv       # 엑셀로 넘길 파일
  python3 scripts/exclusion_notify.py 기록 C9 --date 20261001 \
          --subject "25년 미청구·불가 추가 제외분"                # 발송 후 통보 처리
  python3 scripts/exclusion_notify.py 소급_20260923               # 9/23 메일분 소급 기록

★왜 별도 테이블인가 — `exclusions` 테이블은 인덱스 빌드(scripts/build_exclusions_index.py)
  가 매번 DROP/CREATE 한다. 거기에 통보 열을 붙이면 다음 빌드에 통째로 날아간다.
  그래서 `exclusion_notified` 를 따로 두고 계기번호로 조인한다.

★영준님 지시 2026-09-29: "c9제외분 기록해놔 디비에 그래야 나중에 보고할때 빼게."
  9/23 메일에는 C9 가 빠졌다 — 그때 C9 축이 아직 없었다. 그 뒤 미청구 241 · 불가 47 이
  제외됐으니 다음 보고에 넣어야 한다. 이 스크립트가 그 경계를 지킨다.

★외부 발송은 "보내" 라는 지시가 있을 때만 한다. 이 스크립트는 **기록만** 하고
  메일을 보내지 않는다.
"""
import csv
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data/ami.db'
XLSX_20260923 = ROOT / 'research/주덕기과장_보고근거_20260923.xlsx'

DDL = """
CREATE TABLE IF NOT EXISTS exclusion_notified (
  계기번호_norm TEXT NOT NULL,
  원본리스트     TEXT NOT NULL,
  축코드        TEXT,
  통보일        TEXT NOT NULL,     -- YYYYMMDD
  메일제목       TEXT,
  통보사유       TEXT,             -- 그 메일에서 쓴 사유 문구(과장 쪽 표현)
  비고          TEXT,
  기록시각       TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (계기번호_norm, 원본리스트, 통보일)
)
"""


def conn():
    c = sqlite3.connect(DB)
    c.execute(DDL)
    return c


def cmd_status(c):
    print('═══ 축별 통보 현황 ═══')
    rows = c.execute("""
        SELECT e.원본리스트, e.축코드, e.축이름,
               count(*) AS 전체,
               sum(CASE WHEN n.계기번호_norm IS NULL THEN 0 ELSE 1 END) AS 통보
          FROM exclusions e
          LEFT JOIN exclusion_notified n
                 ON n.계기번호_norm = e.계기번호_norm
                AND n.원본리스트    = e.원본리스트
         GROUP BY e.원본리스트, e.축코드
         ORDER BY e.원본리스트, e.축코드
    """).fetchall()
    cur_list = None
    for lst, code, name, tot, noti in rows:
        if lst != cur_list:
            print(f'\n[{lst}]')
            cur_list = lst
        mark = '' if noti == tot else ('  ★미통보 %d' % (tot - noti))
        print(f'  {code:4s} {str(name)[:26]:26s} 전체 {tot:>5,} · 통보 {noti:>5,}{mark}')
    print()
    for lst, in c.execute('SELECT DISTINCT 원본리스트 FROM exclusions'):
        t = c.execute('SELECT count(*) FROM exclusions WHERE 원본리스트=?', (lst,)).fetchone()[0]
        n = c.execute("""SELECT count(*) FROM exclusions e JOIN exclusion_notified n
                           ON n.계기번호_norm=e.계기번호_norm AND n.원본리스트=e.원본리스트
                          WHERE e.원본리스트=?""", (lst,)).fetchone()[0]
        print(f'  합계 {lst}: 제외 {t:,} · 통보 {n:,} · **미통보 {t-n:,}**')


def q_unnotified(c, code=None, lst=None):
    sql = """
        SELECT e.계기번호, e.원본리스트, e.축코드, e.축이름, e.고객번호, e.지사,
               e.주소, e.사유, e.판정근거, e.제외일자
          FROM exclusions e
          LEFT JOIN exclusion_notified n
                 ON n.계기번호_norm = e.계기번호_norm
                AND n.원본리스트    = e.원본리스트
         WHERE n.계기번호_norm IS NULL
    """
    p = []
    if code:
        sql += ' AND e.축코드=?'
        p.append(code)
    if lst:
        sql += ' AND e.원본리스트=?'
        p.append(lst)
    sql += ' ORDER BY e.원본리스트, e.축코드, e.계기번호'
    return c.execute(sql, p).fetchall()


def cmd_unnotified(c, args):
    code = None
    lst = None
    out = None
    for i, a in enumerate(args):
        if a == '--csv' and i + 1 < len(args):
            out = args[i + 1]
        elif a == '--축' and i + 1 < len(args):
            code = args[i + 1]
        elif a == '--리스트' and i + 1 < len(args):
            lst = args[i + 1]
    rows = q_unnotified(c, code, lst)
    from collections import Counter
    print(f'★미통보 제외분 {len(rows):,}건')
    print('  축별:', dict(Counter(f'{r[1]}/{r[2]}' for r in rows).most_common()))
    if out:
        head = ['계기번호', '원본리스트', '축코드', '축이름', '고객번호', '지사',
                '주소', '사유', '판정근거', '제외일자']
        with open(out, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(head)
            w.writerows(rows)
        print(f'  저장 {out}')
    else:
        for r in rows[:20]:
            print(f'   {r[0]} {r[1]} {r[2]} · {str(r[7])[:70]}')
        if len(rows) > 20:
            print(f'   … 외 {len(rows)-20:,}건 (--csv 로 전량 내보내기)')


def cmd_record(c, args):
    """기록 <축코드|ALL> --date YYYYMMDD [--subject ...] [--리스트 ...]"""
    if not args:
        sys.exit('사용법: 기록 <축코드|ALL> --date YYYYMMDD [--subject ...]')
    code = args[0]
    date = subj = lst = None
    for i, a in enumerate(args):
        if a == '--date' and i + 1 < len(args):
            date = args[i + 1]
        elif a == '--subject' and i + 1 < len(args):
            subj = args[i + 1]
        elif a == '--리스트' and i + 1 < len(args):
            lst = args[i + 1]
    if not date or len(date) != 8 or not date.isdigit():
        sys.exit('--date YYYYMMDD 가 필요하다')
    rows = q_unnotified(c, None if code == 'ALL' else code, lst)
    if not rows:
        print('미통보 건이 없다 — 기록할 것이 없다')
        return
    c.executemany("""INSERT OR IGNORE INTO exclusion_notified
                     (계기번호_norm,원본리스트,축코드,통보일,메일제목,통보사유)
                     VALUES (?,?,?,?,?,?)""",
                  [(r[0], r[1], r[2], date, subj, r[3]) for r in rows])
    c.commit()
    print(f'통보 기록 {len(rows):,}건 (통보일 {date} · 제목 {subj!r})')


def cmd_backfill_20260923(c):
    """9/23 메일 발송분(578건)을 소급 기록 — 시트2 '제외 상세' 가 원천."""
    try:
        import openpyxl
    except ImportError:
        sys.exit('openpyxl 이 필요하다')
    if not XLSX_20260923.exists():
        sys.exit(f'없다: {XLSX_20260923}')
    wb = openpyxl.load_workbook(XLSX_20260923, read_only=True)
    ws = wb['2.제외 상세']
    rows, head = [], None
    for r in ws.iter_rows(values_only=True):
        if head is None:
            if r and r[0] == '계기번호':
                head = list(r)
            continue
        if not r or not r[0]:
            continue
        d = dict(zip(head, r))
        rows.append((str(d['계기번호']).strip(), '25미청구', None,
                     '20260923', '25년 AMI 보강공사 미청구 제외 대상 및 정정 요청 (9/23)',
                     str(d.get('제외 사유') or '')))
    wb.close()
    c.executemany("""INSERT OR IGNORE INTO exclusion_notified
                     (계기번호_norm,원본리스트,축코드,통보일,메일제목,통보사유)
                     VALUES (?,?,?,?,?,?)""", rows)
    c.commit()
    print(f'9/23 발송분 소급 기록 {len(rows):,}건')
    from collections import Counter
    print('  사유별:', dict(Counter(r[5] for r in rows).most_common()))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    c = conn()
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd in ('현황', 'status'):
        cmd_status(c)
    elif cmd in ('미통보', 'unnotified'):
        cmd_unnotified(c, args)
    elif cmd in ('기록', 'record'):
        cmd_record(c, args)
    elif cmd == '소급_20260923':
        cmd_backfill_20260923(c)
    else:
        print(__doc__)
    c.close()


if __name__ == '__main__':
    main()
