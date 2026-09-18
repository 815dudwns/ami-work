#!/usr/bin/env python3
"""미청구 최종 대상 8,994 커버리지 재집계 (PM 대조용, 2026-09-18)

★PM 이 같은 계산을 병렬로 돌려 숫자를 대조한다. 그래서 **두 벌**로 낸다.
  (A) awms 회수분 포함 — 현재 DB/JSON 에 반영돼 있는 실제 상태
  (B) awms 회수분 제외 — awms 를 안 썼을 때의 숫자 (PM 계산과 맞춰볼 기준선)
  둘을 갈라 놓지 않으면 어느 쪽이 틀린 건지 가릴 수 없다.

출력: research/미청구_커버리지_20260918.md  (+ 표준출력)
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READY = ROOT / 'research/미청구_대상_지도업로드_20260918.json'
WAIT = ROOT / 'research/미청구_대상_주소대기_20260918.json'
OUT = ROOT / 'research/미청구_커버리지_20260918.md'

AWMS_SRC = 'awms/fmpMtr1000'


def load():
    return json.loads(READY.read_text()) + json.loads(WAIT.read_text())


def has_addr(r):
    return bool(r['지번주소'] or r['도로명주소'])


def has_bdju(r):
    return bool(r['변대주번호'] or r['변대주명'])


def table(rows, title, lines):
    n = len(rows)
    a = sum(1 for r in rows if has_addr(r))
    b = sum(1 for r in rows if has_bdju(r))
    bn = sum(1 for r in rows if r['변대주번호'])
    bm = sum(1 for r in rows if r['변대주명'])
    cu = sum(1 for r in rows if r['고객번호'])
    dc = sum(1 for r in rows if r['DCU_ID'])
    mac = sum(1 for r in rows if r['MAC'])
    jib = sum(1 for r in rows if r['지번주소'])
    road = sum(1 for r in rows if r['도로명주소'])
    lines.append(f'\n### {title}  (모수 {n:,})\n')
    lines.append('| 항목 | 보유 | 결손 | 확보율 |')
    lines.append('|---|---:|---:|---:|')
    for lbl, v in (('**주소(지번·도로명 중 하나)**', a), ('　지번주소', jib), ('　도로명주소', road),
                   ('**변대주(번호·명 중 하나)**', b), ('　변대주번호', bn), ('　변대주명', bm),
                   ('고객번호', cu), ('DCU ID', dc), ('모뎀 MAC', mac)):
        lines.append(f'| {lbl} | {v:,} | {n-v:,} | {v/n*100:.1f}% |')
    return {'모수': n, '주소보유': a, '주소결손': n - a, '변대주보유': b, '변대주결손': n - b}


def by_dept(rows, lines, title):
    d = defaultdict(lambda: [0, 0, 0])
    for r in rows:
        x = d[r['지사']]
        x[0] += 1
        x[1] += 1 if has_addr(r) else 0
        x[2] += 1 if has_bdju(r) else 0
    lines.append(f'\n### {title}\n')
    lines.append('| 지사 | 계기 | 주소 보유 | 주소 결손 | 주소 확보율 | 변대주 보유 | 변대주 확보율 |')
    lines.append('|---|---:|---:|---:|---:|---:|---:|')
    tot = [0, 0, 0]
    for k, v in sorted(d.items(), key=lambda x: -x[1][0]):
        tot = [tot[i] + v[i] for i in range(3)]
        lines.append(f'| {k} | {v[0]:,} | {v[1]:,} | {v[0]-v[1]:,} | {v[1]/v[0]*100:.1f}% '
                     f'| {v[2]:,} | {v[2]/v[0]*100:.1f}% |')
    lines.append(f'| **계** | **{tot[0]:,}** | **{tot[1]:,}** | **{tot[0]-tot[1]:,}** '
                 f'| **{tot[1]/tot[0]*100:.1f}%** | **{tot[2]:,}** | **{tot[2]/tot[0]*100:.1f}%** |')


def by_source(rows, lines, key, title):
    c = Counter(r[key] or '(미상)' for r in rows)
    lines.append(f'\n### {title}\n')
    lines.append('| 출처 | 건수 | 비율 |')
    lines.append('|---|---:|---:|')
    n = len(rows)
    for k, v in c.most_common():
        lines.append(f'| `{k}` | {v:,} | {v/n*100:.1f}% |')


def main():
    rows = load()
    n = len(rows)
    awms_rows = [r for r in rows if r['주소출처'] == AWMS_SRC]
    # (B) awms 를 안 썼다면 그 건들은 주소가 없는 상태였다
    rows_wo = []
    for r in rows:
        if r['주소출처'] == AWMS_SRC:
            r = {**r, '지번주소': '', '도로명주소': '', '주소출처': '', '신뢰등급': '미상',
                 '상태': 'await_addr'}
        rows_wo.append(r)

    L = ['# 미청구 최종 대상 8,994 — 커버리지 재집계 (2026-09-18, 통신팀)', '',
         'PM 병렬 계산과 숫자를 맞추기 위한 대조표.',
         '',
         f'- 대상 계기 **{n:,}** (PM 목록과 양방향 차집합 0)',
         f'- awms FMPMTR 로 주소를 채운 건 **{len(awms_rows):,}** — 아래 (A)/(B) 로 갈라 표시한다.',
         '  PM 이 awms 없이 계산했다면 **(B) 와 맞춰야 한다.**']

    a = table(rows, '(A) 현재 상태 — awms 회수분 포함', L)
    b = table(rows_wo, '(B) 기준선 — awms 회수분 제외', L)
    L.append('')
    L.append(f'**차이**: 주소 보유 {a["주소보유"]:,} vs {b["주소보유"]:,} '
             f'(= awms {len(awms_rows):,}건) · 주소 결손 {a["주소결손"]:,} vs {b["주소결손"]:,}')

    by_dept(rows, L, '(A) 지사별 — awms 포함')
    by_dept(rows_wo, L, '(B) 지사별 — awms 제외')
    by_source(rows, L, '주소출처', '주소 출처별 (A 기준)')
    by_source(rows, L, '신뢰등급', '주소 신뢰등급별 (A 기준)')
    by_source(rows, L, '변대주출처', '변대주 출처별')

    # 결손 조합
    L.append('\n### 결손 조합 (A 기준)\n')
    c = Counter()
    for r in rows:
        c[(('주소O' if has_addr(r) else '주소X'), ('변대주O' if has_bdju(r) else '변대주X'))] += 1
    L.append('| 조합 | 건수 | 비율 |')
    L.append('|---|---:|---:|')
    for k, v in c.most_common():
        L.append(f'| {k[0]} / {k[1]} | {v:,} | {v/n*100:.1f}% |')

    txt = '\n'.join(L) + '\n'
    OUT.write_text(txt)
    print(txt)
    print(f'저장 {OUT}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
