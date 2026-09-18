#!/usr/bin/env python3
"""주소 회신 요청 엑셀 생성 — 주덕기 과장 앞 (PM 지시 2026-09-18)

대상: 보정판 잔량 중 **주소 전체 결손** 4,311건
      (research/미청구_미상잔량_보정_20260918.json 의 결손필드에 '주소전체' 가 있는 것)

★열 구성은 PM 지정이다: 계기번호 · 모뎀MAC · 고객번호 · 지사 · 최종시공일 · 현재확보주소(있으면).
  고객번호는 398건뿐이지만 **한전이 가장 빨리 찾는 키**라 앞쪽에 둔다(PM 2026-09-18).
  지사별 시트로 나누지 않는다. 한 장이다.

★이 목록은 **모뎀 MAC 이 유일하게 온전한 키**다(4,290/4,311 = 99.5%).
  계기번호는 재사용되므로(오염 11~18% 실측) 계기번호만으로 조회하면 남의 개소가 나온다.
  그래서 'MAC + 계기번호 -> 설치주소' 형식으로 요청한다.

★현재확보주소 열은 **전건 공란**이다. 우리가 가진 모든 소스를 훑고도 못 찾았다는 뜻이고,
  계기번호 단독 매칭으로 나온 후보 1,587건은 오염되어 있어 **일부러 넣지 않았다**
  (영준님/PM 원칙: 빈칸이 틀린 주소보다 낫다).
"""
import json
import re
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'research/미청구_미상잔량_보정_20260918.json'
OUT = ROOT / 'research/미청구_주소요청_주덕기과장_20260918.xlsx'

# 열 순서는 PM 지정(2026-09-18 재지시): 고객번호가 한전 조회에 가장 빠르므로 앞쪽에 둔다.
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
    gap = json.loads(SRC.read_text())
    rows = [r for r in gap['목록'] if '주소전체' in r['결손필드']]
    # 지사 -> 최종시공일 순으로 정렬해 과장이 보기 쉽게 한다
    rows.sort(key=lambda r: (r['지사'], re.sub(r'\D', '', str(r['최종시공일'] or ''))))
    print(f'대상 {len(rows):,}건 · MAC 보유 {sum(1 for r in rows if r["MAC"]):,}')

    wb = Workbook()
    ws = wb.active
    ws.title = '주소요청'

    head_fill = PatternFill('solid', fgColor='DDEBF7')
    ws.append(COLS)
    for i, w in enumerate(WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(row=1, column=i)
        c.font = Font(bold=True)
        c.fill = head_fill
        c.alignment = Alignment(horizontal='center')

    for r in rows:
        ws.append([
            r['계기번호'],            # ★원문 그대로 — 영문자 접두를 지우지 않는다
            r['MAC'],
            r['고객번호'],            # 있는 건 398건뿐이지만 한전은 이걸로 바로 찾는다
            r['지사'],
            fmt_day(r['최종시공일']),
            '',                       # 현재확보주소 — 전건 공란(못 찾았다는 뜻)
        ])
    # 계기번호·MAC·고객번호는 앞 0 이 날아가지 않게 텍스트로 고정
    for row in ws.iter_rows(min_row=2, max_col=3):
        for c in row:
            c.number_format = '@'

    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = f'A1:{get_column_letter(len(COLS))}{ws.max_row}'

    wb.save(OUT)
    print(f'저장 {OUT}  {ws.max_row - 1:,}행')

    # ── 원본 대조 ────────────────────────────────────────────────────────────
    from openpyxl import load_workbook
    chk = load_workbook(OUT)['주소요청']
    got = [(chk.cell(r, 1).value, chk.cell(r, 2).value) for r in range(2, chk.max_row + 1)]
    src_ids = [r['계기번호'] for r in rows]
    out_ids = [g[0] for g in got]
    alpha_src = sum(1 for x in src_ids if re.search(r'[A-Za-z]', str(x)))
    alpha_out = sum(1 for x in out_ids if re.search(r'[A-Za-z]', str(x)))
    cust_src = sum(1 for r in rows if r['고객번호'])
    cust_out = sum(1 for r in range(2, chk.max_row + 1) if chk.cell(r, 3).value)
    print('\n=== 원본 대조 ===')
    print(f'  행수      원본 {len(src_ids):,} · 엑셀 {len(out_ids):,}')
    print(f'  고객번호  원본 {cust_src:,} · 엑셀 {cust_out:,}')
    print(f'  차집합    원본에만 {len(set(src_ids)-set(out_ids))} · 엑셀에만 {len(set(out_ids)-set(src_ids))}')
    print(f'  접두 문자 원본 {alpha_src} · 엑셀 {alpha_out}')
    print(f'  MAC 공란  {sum(1 for g in got if not g[1]):,}')
    ok = (len(src_ids) == len(out_ids) and set(src_ids) == set(out_ids)
          and alpha_src == alpha_out and cust_src == cust_out)
    print('  판정:', 'OK' if ok else '★불일치 — 배포하지 마라')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
