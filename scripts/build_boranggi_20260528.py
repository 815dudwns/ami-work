#!/usr/bin/env python3
"""보강현황 신규 6,975건 추출 + coords-todo 생성
입력: data/계기교체_보강현황_20260528.xlsx
출력: data/boranggi-new-6975.json, data/coords-todo.json
"""
import json
import sys
from datetime import datetime

import openpyxl

BASE = '/Users/woodelight/Projects/ami-work'
EXCEL = f'{BASE}/data/계기교체_보강현황_20260528.xlsx'
SITE_DATA = f'{BASE}/data/site-data.json'
OUT_JSON = f'{BASE}/data/boranggi-new-6975.json'
OUT_TODO = f'{BASE}/data/coords-todo.json'

METER_TYPE_MAP = {
    '19': 'AE타입',
    '25': 'G타입', '26': 'G타입', '27': 'G타입',
    '45': 'G타입', '46': 'G타입', '47': 'G타입',
    '53': '보안계기', '55': '보안계기',
}


def normalize_meter(v):
    """계기번호 정규화: 숫자면 float->int->zfill(11), 알파포함이면 as-is."""
    s = str(v).strip() if v is not None else ''
    if not s:
        return ''
    if s.replace('.', '', 1).lstrip('-').isdigit():
        return str(int(float(s))).zfill(11)
    return s


def normalize_str(v):
    """문자열 정규화: None/'0'/'#N/A' -> ''"""
    if v is None:
        return ''
    s = str(v).strip()
    if s in ('0', '#N/A', 'None'):
        return ''
    return s


def normalize_date(v):
    """날짜 정규화: datetime -> 'YYYY-MM-DD', 그 외 -> ''"""
    if v is None:
        return ''
    if isinstance(v, datetime):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    if s in ('', 'None', '#N/A'):
        return ''
    return s


def parse_meter_type(meter_no):
    """계기번호 [2:4] 에서 계기타입 파싱."""
    prefix = meter_no[2:4]
    if prefix in METER_TYPE_MAP:
        return METER_TYPE_MAP[prefix]
    print(f'[ERROR] 미지 prefix={prefix!r}, 계기번호={meter_no}', file=sys.stderr)
    sys.exit(1)


def main():
    print('엑셀 로드 중...', flush=True)
    wb = openpyxl.load_workbook(EXCEL, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    # 헤더 제외, col22=='대상' 필터
    target_rows = [r for r in rows[1:] if len(r) > 22 and r[22] == '대상']
    assert len(target_rows) == 17864, f'대상 행수 불일치: {len(target_rows)}'
    print(f'대상 행수: {len(target_rows):,}', flush=True)

    # 기존 site-data 계기번호 집합
    print('site-data 로드 중...', flush=True)
    with open(SITE_DATA) as f:
        site = json.load(f)
    existing_meters = set(e['계기번호'] for e in site)
    print(f'기존 계기번호 수: {len(existing_meters):,}', flush=True)

    # 신규 레코드 생성
    new_records = []
    coords_todo = []
    meter_type_dist = {}

    for r in target_rows:
        meter_no = normalize_meter(r[21])
        if meter_no in existing_meters:
            continue

        meter_type = parse_meter_type(meter_no)
        meter_type_dist[meter_type] = meter_type_dist.get(meter_type, 0) + 1

        # 변대주/상호/인입주 '0' -> ''
        biandaeju = normalize_str(r[31])
        ib_ipju = normalize_str(r[32])
        sang_ho = normalize_str(r[36])

        record = {
            '지사': normalize_str(r[0]),
            '주소': normalize_str(r[33]),
            '도로명주소': normalize_str(r[34]),
            '계기번호': meter_no,
            '계기타입': meter_type,
            '고객번호': normalize_str(r[3]),
            '통신방식': normalize_str(r[17]),
            '공동주택명': normalize_str(r[35]),
            '상호': sang_ho,
            '검기만료년월': normalize_str(r[7]),
            '계기타입_전': '',
            '인입주': ib_ipju,
            '변대주': biandaeju,
            'DCUID': normalize_str(r[15]),
            'lat': None,
            'lng': None,
            '좌표정확도': None,
            'DCU장애여부': normalize_str(r[4]),
            '교체사유': normalize_str(r[5]),
            '시스템등록일': normalize_date(r[6]),
            '계기교체일': normalize_date(r[8]),
            '연계수신일': normalize_date(r[9]),
            '등록소요일': str(r[12]) if r[12] is not None else '',
            '사업차수_전': normalize_str(r[16]),
            '통신방식_전': normalize_str(r[17]),
            '검침방법_전': normalize_str(r[18]),
            '검침방법': normalize_str(r[18]),
            '사업차수': '',
        }
        new_records.append(record)
        coords_todo.append({
            '계기번호': meter_no,
            '주소': normalize_str(r[33]),
            '도로명주소': normalize_str(r[34]),
        })

    print(f'\n신규 건수: {len(new_records):,}', flush=True)
    print(f'계기타입 분포: {meter_type_dist}', flush=True)

    # 출력
    with open(OUT_JSON, 'w') as f:
        json.dump(new_records, f, ensure_ascii=False, indent=2)
    print(f'저장: {OUT_JSON}', flush=True)

    with open(OUT_TODO, 'w') as f:
        json.dump(coords_todo, f, ensure_ascii=False, indent=2)
    print(f'저장: {OUT_TODO}', flush=True)


if __name__ == '__main__':
    main()
