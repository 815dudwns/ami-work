#!/usr/bin/env python3
"""DCU 철거예정 판정을 site-data 형식 데이터셋에 붙인다 (재사용 도구).

새 리스트가 들어올 때마다 반드시 한 번 돌린다 — 새 데이터셋 추가 프로세스의 고정 단계.

사용:
    python3 scripts/apply_dcu_status.py data/site-data.json [더 많은 파일...]
    python3 scripts/apply_dcu_status.py --dry-run data/site-data.json

동작:
  - 대상 레코드의 '인입주'(없으면 '변대주')를 DCU 목록의 '변대주명'과 대조한다.
  - 지사까지 일치할 때만 매칭으로 인정한다(동명이인 변대주 방지).
  - 판정에 따라 dcu_철거예정 필드를 채운다:
        해지 -> 'DCU 철거예정 개소 LTE 시설'
        유지 -> 'DCU 유지'
    매칭 없으면 빈 문자열.

★규칙 두 가지 (실측으로 확정, 2026-08-02):
  1. 매칭키는 변대주'명'이다. DCU 목록의 '변대주번호'(0028G232)와 보강 엑셀의
     'DCU ID'(9726G1525M)는 체계가 달라 번호 매칭은 성립하지 않는다.
  2. 태그는 dcu_철거예정 필드에만 싣는다. 변대주 값에 문자열로 섞지 마라 —
     표시는 js/detail.js 의 큰 글씨 공통줄이 담당한다.

DCU 목록 정본: data/reference/DCU_철거_예정_개소_목록.xlsx
  (한전에서 새 목록이 오면 이 파일을 교체하고 다시 돌린다)
"""
import json
import re
import sys
import collections
from pathlib import Path

from openpyxl import load_workbook

BASE = Path(__file__).resolve().parent.parent
DCU_XLSX = BASE / 'data/reference/DCU_철거_예정_개소_목록.xlsx'

TAG_REMOVE = 'DCU 철거예정 개소 LTE 시설'
TAG_KEEP = 'DCU 유지'


def nkey(s):
    return re.sub(r'\s+', '', str(s or '')).upper()


def load_dcu(path=DCU_XLSX):
    """변대주명(정규화) -> [{'dept','verdict'}]"""
    ws = load_workbook(path, data_only=True).worksheets[0]
    by_name = collections.defaultdict(list)
    for r in ws.iter_rows(min_row=4, values_only=True):
        if not r[4]:                      # 변대주번호 없으면 데이터행 아님
            continue
        by_name[nkey(r[5])].append({
            'dept': str(r[1] or '').strip(),
            'verdict': str(r[7] or '').strip(),
        })
    return by_name


def apply_to(records, by_name):
    stat = collections.Counter()
    for x in records:
        name = (x.get('인입주') or x.get('변대주') or '').strip()
        dept = (x.get('지사') or '').strip()
        tag = ''
        for h in by_name.get(nkey(name), []):
            if h['dept'] == dept:         # 지사까지 같아야 인정
                tag = TAG_REMOVE if h['verdict'] == '해지' else TAG_KEEP
                break
        if x.get('dcu_철거예정', '') != tag:
            stat['변경'] += 1
        x['dcu_철거예정'] = tag
        stat[tag or '(매칭없음)'] += 1
    return stat


def main(argv):
    dry = '--dry-run' in argv
    targets = [a for a in argv if not a.startswith('--')]
    if not targets:
        print(__doc__)
        return 1

    by_name = load_dcu()
    print(f'DCU 목록 {DCU_XLSX.name} — 변대주 {len(by_name):,}개')

    for t in targets:
        p = Path(t)
        data = json.loads(p.read_text())
        recs = data if isinstance(data, list) else (data.get('data') or [])
        stat = apply_to(recs, by_name)
        line = (f'{p.name:36} 총 {len(recs):,} | '
                f'해지 {stat[TAG_REMOVE]:,} · 유지 {stat[TAG_KEEP]:,} | '
                f'변경 {stat["변경"]:,}')
        if dry:
            print('[DRY] ' + line)
        else:
            p.write_text(json.dumps(data, ensure_ascii=False))
            print('[적용] ' + line)

    if not dry:
        print('\n※ site-data.json 을 바꿨으면 scripts/gen_site_version.py 를 반드시 다시 돌려라.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
