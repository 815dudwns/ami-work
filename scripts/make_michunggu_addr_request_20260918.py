#!/usr/bin/env python3
"""주소 회신 요청 엑셀 생성 — 주덕기 과장 앞 (PM 지시 2026-09-18, 최종 대상판)

대상: **최종 대상 8,512 중 주소가 없는 1,276건**
      `research/미청구_대상_주소대기_20260918.json` (상태 `await_addr`)

★이전 판(3,956행)은 최종 대상 밖 3,035건이 섞여 있었다 —
  Sheet2 1,997 · 26년시공 534 · 우리리스트(N2 재사용) 355 · 고압 172.
  대상 정의가 확정되면서(scripts/build_michunggu_target_20260918.py) 요청 리스트도 그만큼 줄었다.
  즉 재사용·고압·Sheet2 제외는 **대상 정의 단계에서 이미 끝났다** — 여기서 다시 거르지 않는다.

★열 구성은 PM 지정: 계기번호 · 모뎀MAC · 고객번호 · 지사 · 최종시공일 · 현재확보주소(있으면).
  고객번호는 건수가 적어도 **한전이 가장 빨리 찾는 키**라 앞쪽에 둔다.
  지사별 시트로 나누지 않는다. 한 장이다.

★★계기번호와 MAC 은 회신분을 다시 붙일 **식별자**다. 가공하지 마라.
  과장이 주소를 회신하면 `scripts/promote_michunggu_addr_20260918.py` 가 이 두 열로
  `await_addr` -> `ready` 승격을 한다. 열 이름·값 형식을 바꾸면 그 스크립트가 깨진다.
  셀 서식을 텍스트로 고정하는 것도 그래서다 — 엑셀이 숫자로 읽으면 앞 0 이 날아간다.

★현재확보주소 열은 전건 공란이다. 우리가 가진 모든 소스를 훑고도 못 찾았다는 뜻이고,
  계기번호 단독 매칭으로 나온 후보는 오염 11~18% 라 **일부러 넣지 않았다**
  (원칙: 빈칸이 틀린 주소보다 낫다).
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'research/미청구_대상_주소대기_20260918.json'
OUT = ROOT / 'research/미청구_주소요청_주덕기과장_20260918.xlsx'

COLS = ['계기번호', '모뎀MAC', '고객번호', '지사', '최종시공일', '현재확보주소(있으면)']
WIDTHS = [16, 20, 14, 16, 20, 34]


def fmt_day(v):
    """원장 시공일은 '20251017163426' 과 '20260410 14:01:09' 두 꼴이 섞여 온다."""
    s = re.sub(r'\D', '', str(v or ''))
    if len(s) >= 14:
        return f'{s[0:4]}-{s[4:6]}-{s[6:8]} {s[8:10]}:{s[10:12]}:{s[12:14]}'
    if len(s) >= 8:
        return f'{s[0:4]}-{s[4:6]}-{s[6:8]}'
    return str(v or '')


def main():
    rows = json.loads(SRC.read_text())
    assert all(r['상태'] == 'await_addr' for r in rows), 'await_addr 아닌 행이 섞였다'
    assert not any(r['지번주소'] or r['도로명주소'] for r in rows), '주소 있는 행이 섞였다'
    rows.sort(key=lambda r: (r['지사'], re.sub(r'\D', '', str(r['최종시공일'] or ''))))
    print(f'대상 {len(rows):,}건 · MAC 보유 {sum(1 for r in rows if r["MAC"]):,}'
          f' · 고객번호 보유 {sum(1 for r in rows if r["고객번호"]):,}')
    print('  지사별: ' + ' · '.join(f'{k} {v:,}' for k, v in
                                  Counter(r['지사'] for r in rows).most_common()))

    wb = Workbook()
    ws = wb.active
    ws.title = '주소요청'
    ws.append(COLS)
    head_fill = PatternFill('solid', fgColor='DDEBF7')
    for i, w in enumerate(WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(row=1, column=i)
        c.font, c.fill = Font(bold=True), head_fill
        c.alignment = Alignment(horizontal='center')

    for r in rows:
        ws.append([r['계기번호'], r['MAC'], r['고객번호'], r['지사'],
                   fmt_day(r['최종시공일']), ''])
    # ★계기번호·MAC·고객번호는 앞 0 이 날아가지 않게 텍스트로 고정한다(승격 식별자).
    for row in ws.iter_rows(min_row=2, max_col=3):
        for c in row:
            c.number_format = '@'

    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = f'A1:{get_column_letter(len(COLS))}{ws.max_row}'
    wb.save(OUT)
    print(f'저장 {OUT}  {ws.max_row - 1:,}행')

    # ── 원본 대조 ────────────────────────────────────────────────────────────
    chk = load_workbook(OUT)['주소요청']
    out_ids = [chk.cell(r, 1).value for r in range(2, chk.max_row + 1)]
    out_mac = [chk.cell(r, 2).value for r in range(2, chk.max_row + 1)]
    src_ids = [r['계기번호'] for r in rows]

    def alpha(xs):
        return sum(1 for x in xs if re.search(r'[A-Za-z]', str(x or '')))

    cust_src = sum(1 for r in rows if r['고객번호'])
    cust_out = sum(1 for r in range(2, chk.max_row + 1) if chk.cell(r, 3).value)
    print('\n=== 원본 대조 ===')
    print(f'  행수      원본 {len(src_ids):,} · 엑셀 {len(out_ids):,}')
    print(f'  차집합    원본에만 {len(set(src_ids)-set(out_ids))}'
          f' · 엑셀에만 {len(set(out_ids)-set(src_ids))}')
    print(f'  접두 문자 원본 {alpha(src_ids)} · 엑셀 {alpha(out_ids)}')
    print(f'  고객번호  원본 {cust_src:,} · 엑셀 {cust_out:,}')
    print(f'  MAC 공란  {sum(1 for m in out_mac if not m):,}')
    ok = (len(src_ids) == len(out_ids) and set(src_ids) == set(out_ids)
          and alpha(src_ids) == alpha(out_ids) and cust_src == cust_out)
    print('  판정:', 'OK' if ok else '★불일치 — 보내지 마라')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
