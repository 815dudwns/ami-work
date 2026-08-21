#!/usr/bin/env python3
"""SKT 중계기 AMI 모뎀 설치요청건 엑셀 -> 보관본(281건) + 지도용(미작업만).

배경 (주덕기 반장 메일 2026-08-21 08:07, 영준님 승인)
  SKT 중계기가 붙은 개소에 AMI 모뎀을 설치해 달라는 요청이다. 주 반장 본인 요청이
  **"기존 리스트에 통합하지 말고 카테고리를 추가해서 표기"** 라 별도 데이터셋으로 만든다.

산출물 둘
  1) data/skt-full-YYYYMMDD.json  — 원본 281건 전체. 지도엔 안 쓴다.
     다음 엑셀이 오면 대조해 진척을 센다(이번에도 5월 백업이 있어 113건 진척을 셀 수 있었다).
     LP 14열·불가사유·비고·KDN작업일을 전부 보존한다.
  2) data/skt-data.json — 지도용. **작업결과가 빈 '미작업' 건만.**
     완료(O)·작업불요를 함께 올리면 할 일 41건이 묻힌다(영준님 지시).

★상태 판정 (PM 확정 2026-08-21 — 다시 해석하지 말 것)
  LP 값 '9/24'·'36/96' 은 **정상이다**. 24개 중 9개여서 미달로 보이지만 아니다 —
  엑셀에 불가사유 'LP정상' 으로 적힌 건이 전부 '9/24' 다(한전이 정상으로 판정한 실증).
  실패는 '#N/A'(수신없음) 와 '0/24' 뿐이다.
  판정은 **LP1·LP2 중 좋은 쪽**으로 본다 — 개소마다 한쪽만 값이 있어 하나만 보면 오판한다.

★좌표는 새로 뽑지 않는다
  data/skt-data.backup-20260522-083900.json (281건) 에 이미 있다. 같은 개소 목록이고
  고객번호가 100% 일치한다. 고객번호(앞 0 정규화) 로 lat/lng/좌표정확도를 재사용하고,
  매칭 안 되는 것만 지오코딩한다.

사용:
    python3 scripts/build_skt_data.py
    python3 scripts/build_skt_data.py "data/inbox_jdg_20260821/....xlsx" 20260814
"""

import glob
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = Path(__file__).resolve().parent.parent
INBOX_GLOB = str(ROOT / 'data' / 'inbox_jdg_*' / '*.xlsx')
BACKUP = ROOT / 'data' / 'skt-data.backup-20260522-083900.json'
OUT_MAP = ROOT / 'data' / 'skt-data.json'

SHEET = '전체내역'
# LP 회차 — 엑셀 열 머리(‘260414\nLP1’) 순서와 같아야 한다. 회차가 늘면 여기에 덧붙인다.
LP_ROUNDS = ['260414', '260428', '260520', '260528', '260612', '260714', '260814']
LP_COL0 = 13          # '260414 LP1' 열 index(0-base)

# 열 index (0-base) — 엑셀 머리글 순서
C = dict(순번=0, 지사=1, 고객번호=2, 계기번호=3, 계기위치세부=4, 실효년월=5,
         주소1=6, 주소2=7, 변대번호=8, KDN작업일=9, 작업결과=10, 불가사유=11, 비고=12,
         KDN작업이력=27)

# 계기번호 3~4자리 -> 타입. ★js/utils.js parseType 과 **같은 표기**를 쓴다(E/AE/G/AMIGO).
#   앱은 계기번호로 직접 파싱하는 쪽이 1순위지만, 표기가 어긋나면 폴백에서 갈린다.
METER_TYPE_MAP = {
    '17': 'E',
    '19': 'AE',
    '25': 'G', '26': 'G', '27': 'G', '45': 'G', '46': 'G', '47': 'G',
    '53': 'AMIGO', '55': 'AMIGO',
}


def clean(v):
    """엑셀 값 -> 문자열. '-' 와 '#N/A' 는 값이 없다는 뜻이라 빈 문자열로."""
    s = '' if v is None else str(v).strip()
    if s in ('-', '#N/A', 'None', 'nan'):
        return ''
    return re.sub(r'\s+', ' ', s)


def clean_addr(v):
    """주소는 앞뒤만 다듬는다. ★가운데 이중 공백은 그대로 둔다 —
    백업 좌표 파일과 workStatus 키가 이 표기로 쌓여 있어 건드리면 어긋난다.
    ★'-' 만 든 칸은 빈값이다(도로명 6건). 그대로 실으면 도로명 자리에 '-' 가 박힌다."""
    s = '' if v is None else str(v).strip()
    return '' if s in ('-', '#N/A', 'None') else s


def norm_meter(v):
    """계기번호: 숫자면 zfill(11). 하이픈 금지(CLAUDE.md 데이터규칙).

    ★'25170104809 → 07530116073' 처럼 **구계기 → 신계기** 로 적힌 행이 있다(41건 중 3건).
      현재 계기는 화살표 뒤다. (신, 구) 로 갈라 돌려준다. 유추가 아니라 원문 표기의 파싱이다.
    """
    s = clean(v).replace('-', '')
    if not s:
        return '', ''
    if '→' in s or '->' in s:
        parts = [p.strip() for p in re.split(r'→|->', s) if p.strip()]
        if len(parts) >= 2:
            new, old = parts[-1], parts[0]
            return (new.zfill(11) if new.isdigit() else new,
                    old.zfill(11) if old.isdigit() else old)
    return (s.zfill(11) if s.isdigit() else s), ''


def parse_meter_type(meter_no):
    return METER_TYPE_MAP.get(meter_no[2:4], '') if len(meter_no) >= 4 else ''


def lp_state(v):
    """LP 한 칸의 상태. ★'9/24'·'36/96' 은 정상이다(위 주석)."""
    s = clean(v)
    if not s:
        return '수신없음'          # '#N/A' 는 clean 이 빈값으로 만든다
    if s == '0/24':
        return '0수신'
    return '정상'


def lp_rows(r):
    """[{회차, lp1, lp2}] — '#N/A' 는 빈값으로. 상세모달이 그대로 그린다."""
    out = []
    for i, rd in enumerate(LP_ROUNDS):
        out.append({'회차': rd,
                    'lp1': clean(r[LP_COL0 + i * 2]),
                    'lp2': clean(r[LP_COL0 + i * 2 + 1])})
    return out


def lp_best(r, i):
    """회차 i 의 판정 — LP1·LP2 중 좋은 쪽. 하나만 보면 오판한다."""
    st = {lp_state(r[LP_COL0 + i * 2]), lp_state(r[LP_COL0 + i * 2 + 1])}
    for pref in ('정상', '0수신', '수신없음'):
        if pref in st:
            return pref
    return '수신없음'


def load_rows(xlsx):
    import openpyxl
    ws = openpyxl.load_workbook(xlsx, data_only=True)[SHEET]
    return [[c.value for c in row] for row in ws.iter_rows(min_row=2)]


def to_full(r):
    """보관본 레코드 — 원본을 잃지 않게 전부 싣는다."""
    meter, meter_prev = norm_meter(r[C['계기번호']])
    return {
        '순번': r[C['순번']],
        '지사': clean(r[C['지사']]),
        '고객번호': clean(r[C['고객번호']]),
        '계기번호': meter,
        '계기번호_전': meter_prev,
        '계기번호_원문': clean(r[C['계기번호']]),
        '계기타입': parse_meter_type(meter),
        '계기위치세부': clean(r[C['계기위치세부']]),
        '실효년월': clean(r[C['실효년월']]),
        '주소1': clean_addr(r[C['주소1']]),
        '주소2': clean_addr(r[C['주소2']]),
        '변대번호': clean(r[C['변대번호']]),
        'KDN작업일': clean(r[C['KDN작업일']]),
        '작업결과': clean(r[C['작업결과']]),
        '불가사유': clean(r[C['불가사유']]),
        '비고': clean(r[C['비고']]),
        'KDN작업이력': clean(r[C['KDN작업이력']]),
        'lp_이력': lp_rows(r),
        'lp_최근판정': lp_best(r, len(LP_ROUNDS) - 1),
        'lp_최근회차': LP_ROUNDS[-1],
    }


def to_map(r, coord):
    """지도용 레코드 — data/gapap-data.json 스키마 준용.

    ★없는 값은 유추하지 않는다. 변대번호가 '-' 인 건은 빈값 그대로 둔다(영준님 지시).
    """
    meter, meter_prev = norm_meter(r[C['계기번호']])
    return {
        '지사': clean(r[C['지사']]),
        '주소': clean_addr(r[C['주소1']]),          # 지번
        '도로명주소': clean_addr(r[C['주소2']]),
        '계기번호': meter,
        '계기타입': parse_meter_type(meter),
        '고객번호': clean(r[C['고객번호']]),
        '변대주': clean(r[C['변대번호']]),
        '상호': clean(r[C['계기위치세부']]),
        '실효년월': clean(r[C['실효년월']]),
        '계기번호_전': meter_prev,
        # ─ 원본에 없는 값. 채우지 않는다 ─
        '통신방식': '',
        '공동주택명': '',
        '검기만료년월': '',
        '계기타입_전': '',
        '인입주': '',
        'DCUID': '',
        '모뎀MAC': '',
        'DCU장애여부': '',
        'dcu_철거예정': '',
        # ─ 좌표(백업 재사용) ─
        'lat': coord.get('lat'),
        'lng': coord.get('lng'),
        '좌표정확도': coord.get('좌표정확도', ''),
        # ─ SKT 전용 (js/detail.js 의 category==='skt' 블록이 읽는 이름) ─
        '교체사유': 'SKT 중계기',
        'skt_작업결과': clean(r[C['작업결과']]),
        'skt_불가사유': clean(r[C['불가사유']]),
        'skt_비고': clean(r[C['비고']]),
        'skt_kdn_작업일': clean(r[C['KDN작업일']]),
        'skt_kdn_이력': clean(r[C['KDN작업이력']]),
        'lp_이력': lp_rows(r),
        'lp_최근판정': lp_best(r, len(LP_ROUNDS) - 1),
        'lp_최근회차': LP_ROUNDS[-1],
    }


def norm_cust(v):
    """고객번호 대조용 — 앞의 0 만 뗀다."""
    return str(v if v is not None else '').strip().lstrip('0')


def main():
    args = sys.argv[1:]
    xlsx = args[0] if args else (sorted(glob.glob(INBOX_GLOB)) or [None])[0]
    if not xlsx:
        print(f'엑셀 없음 — {INBOX_GLOB}', file=sys.stderr)
        sys.exit(1)
    stamp = args[1] if len(args) > 1 else LP_ROUNDS[-1]
    out_full = ROOT / 'data' / f'skt-full-{"20" + stamp if len(stamp) == 6 else stamp}.json'

    rows = load_rows(xlsx)
    print(f'{Path(xlsx).name}: {len(rows)}행')

    # 1) 보관본 — 281건 전체
    full = [to_full(r) for r in rows]
    out_full.write_text(json.dumps(full, ensure_ascii=False, indent=1), encoding='utf-8')

    import collections
    buckets = collections.defaultdict(list)
    for r, f in zip(rows, full):
        res = f['작업결과'] or '미작업'
        buckets[res].append(f['lp_최근판정'])
    print(f'저장: {out_full.name} — {len(full):,}건')
    for k in ('○', '미작업', '작업불요'):
        if k in buckets:
            c = collections.Counter(buckets[k])
            label = '완료(○)' if k == '○' else k
            print(f"  {label:8s} {len(buckets[k]):3d} : " + ' · '.join(f'{a} {b}' for a, b in c.items()))

    # 2) 지도용 — 미작업(작업결과 빈값)만
    todo = [r for r in rows if not clean(r[C['작업결과']])]

    coords = {}
    if BACKUP.exists():
        for b in json.loads(BACKUP.read_text(encoding='utf-8')):
            coords[norm_cust(b.get('고객번호'))] = b

    reused = missing = 0
    recs = []
    for r in todo:
        b = coords.get(norm_cust(r[C['고객번호']]))
        if b and b.get('lat') is not None:
            recs.append(to_map(r, b))
            reused += 1
        else:
            recs.append(to_map(r, {}))
            missing += 1

    # 백업에 없는 건만 지오코딩한다. 있으면 그대로 재사용(재조회 0).
    if missing:
        from geocode_cascade import resolve as geo_resolve
        print(f'백업에 없어 새로 조회할 건: {missing}', flush=True)
        for e in recs:
            if e['lat'] is not None:
                continue
            hit = geo_resolve(jibun=e['주소'], road=e['도로명주소'])
            e['lat'], e['lng'] = hit.lat, hit.lng
            e['좌표정확도'] = hit.accuracy or 'fail'

    OUT_MAP.write_text(json.dumps(recs, ensure_ascii=False, indent=1), encoding='utf-8')
    acc = collections.Counter(e['좌표정확도'] for e in recs)
    print(f'\n저장: {OUT_MAP.name} — 미작업 {len(recs):,}건')
    print(f'  좌표: 백업 재사용 {reused} / 새로 조회 {missing} · ' +
          ' · '.join(f'{a} {b}' for a, b in acc.items()))
    print('  지사별:', dict(collections.Counter(e['지사'] for e in recs)))
    print('  계기타입:', dict(collections.Counter(e['계기타입'] or '(빈값)' for e in recs)))
    print('  변대주 빈값:', sum(1 for e in recs if not e['변대주']),
          '· 도로명 빈값:', sum(1 for e in recs if not e['도로명주소']),
          '· 계기교체(→) 표기:', sum(1 for e in recs if e['계기번호_전']))


if __name__ == '__main__':
    main()
