#!/usr/bin/env python3
"""광명지사 리스트 -> data/gwangmyeong-data.json (2026-10-30, 영준님 지시 · PM 발주).

다른 회사(광명) 작업분이다. 우리 강북/KDN 작업과 섞이면 안 된다 — 이 데이터셋은
js/datasets.js 에서 allowGroup 'kmtest' 로만 보이고, 상태키는 '주소|광명' 네임스페이스다.

원천
  main 워크트리 DB(절대경로) data/ami.db 표 `대상리스트_25년시공불가_해지고객제외`, visible=1 만.
  (숨김 264행 = 보낸 쪽이 LP 통신 성공으로 걸러 둔 것 — 대상 아님)
  원본 엑셀 data/inbox_jdg_20261030/광명지사.xlsx

규칙
  - 개소 = 지번주소(공백 정리 — 원본에 이중 공백이 있다). '주소' 가 상태키라 지번주소 그대로 싣는다.
  - 계기번호: 순수 숫자면 zfill(11), 영문 접두는 그대로. 고객번호 zfill(10).
  - 계기타입: 엑셀을 믿지 않고 계기번호 3~4번째 자리로(build_lpnoapp_data.meter_type 과 같은 표).
    표에 없는 코드(52·84 등)는 빈값 + 번호 원본 유지. 추측하지 않는다.
  - 변대주 3축은 따로 싣는다: 변대주(이름)=변대주명 · 변대주번호(8자리)=변대주 · DCUID(10자리)=DCU ID.
    '#N/A' 는 빈값. 인입주(이름)=인입주명 · 인입주전산화=인입주. scripts/validate_bdju.py 게이트.
  - 474행은 계기타입1·부설일자·실효년월·LP취득여부·보강대상 등이 비어 있다 — 그래도 싣는다
    (영준님: 주소+계기번호만 있으면 채울 수 있다). ami.db 다른 표에서 계기번호·고객번호로 찾아
    값이 있으면 채우고, 없으면 빈칸. 유추 금지.
  - 좌표: geocode_cascade(카카오 -> 네이버 -> 동 중심), 행은 버리지 않는다.
    '453번지' 처럼 부번 없는 번지는 그 번지(453)로 조회한다. '0번지' 는 실재 번지가 아니라 동 중심.
  - apply_dcu_status.py 는 돌리지 않는다(서울 강북 철거 목록이라 광명과 무관).

    python3 scripts/build_gwangmyeong_data.py            # 빌드 + 원본 대조 + 게이트
"""
import json
import re
import sqlite3
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))

DB = Path('/Users/woodelight/Projects/ami-work/data/ami.db')
TABLE = '대상리스트_25년시공불가_해지고객제외'
OUT = ROOT / 'data' / 'gwangmyeong-data.json'
GEO_CACHE = ROOT / 'data' / 'inbox_gwangmyeong' / 'geocode-cache.json'
JISA = '광명지사'

# 계기번호 3~4번째 자리 -> 타입. build_lpnoapp_data.meter_type 과 같은 표(표기 'AE').
TYPE_BY_CODE = {'17': 'E', '19': 'AE', '25': 'G', '26': 'G', '27': 'G',
                '45': 'G', '46': 'G', '47': 'G', '53': 'Amigo', '55': 'Amigo'}

# 지역(시·구·동) -> 묶음. 지도 리스트 밑 체크박스(합동 날짜 트리와 같은 모양)가 이 값을 읽는다.
#   ★영준님 2026-10-30 "지사가 아니라 리스트에서 동 묶어야 함". 표는 여기 하나뿐이다.
#   ★표에 없는 지역이 나오면 빌드를 멈춘다 — 조용히 빼거나 추측해 넣지 않는다.
#   순서 = 지도 체크박스 순서(js/datasets.js 광명 groupOrder 와 같아야 한다).
GROUP_ORDER = ['광명동', '철산·하안', '소하·일직', '학온·옥길']
GROUP_BY_AREA = {
    '광명시 광명동': '광명동',
    '광명시 철산동': '철산·하안', '광명시 하안동': '철산·하안', '금천구 독산동': '철산·하안',
    '금천구 시흥동': '철산·하안', '구로구 구로동': '철산·하안',
    '광명시 소하동': '소하·일직', '광명시 일직동': '소하·일직', '안양시 만안구 석수동': '소하·일직',
    '광명시 노온사동': '학온·옥길', '광명시 가학동': '학온·옥길', '광명시 옥길동': '학온·옥길',
    '부천시 소사구 옥길동': '학온·옥길', '시흥시 무지내동': '학온·옥길', '시흥시 과림동': '학온·옥길',
    '구로구 천왕동': '학온·옥길', '구로구 항동': '학온·옥길',
}

# 474 빈칸 행을 다른 표에서 채울 필드(원천 열 이름 = 출력 열 이름)
FILL_FIELDS = ['계기타입1', '부설일자', '실효년월', 'LP취득여부', '보강공사 대상/비대상', '제조년월',
               '변대주 기준 통신방식', 'DCU ID']


def ws(s):
    return re.sub(r'\s+', ' ', str(s if s is not None else '')).strip()


def clean(v):
    v = ws(v)
    return '' if v in ('#N/A', 'None', 'nan') else v


def norm_meter(v):
    s = ws(v).replace(' ', '').replace('-', '').upper()
    return s.zfill(11) if s.isdigit() else s


def norm_cust(v):
    s = ws(v).replace(' ', '')
    return s.zfill(10) if s.isdigit() else s


def meter_type(no):
    return TYPE_BY_CODE.get(no[2:4], '') if len(no) >= 4 else ''


def clean_road(v):
    """'경기도 부천시 소사구  연동로 61-0  (옥길동)' -> '경기도 부천시 소사구 연동로 61'."""
    s = clean(v)
    s = re.sub(r'\s*\([^)]*\)\s*$', '', s)
    s = re.sub(r'(\d+)-0\b', r'\1', s)
    return ws(s)


def geo_query_jibun(jibun):
    """지오코딩 질의용 지번. 'N번지' -> 'N', '0번지' -> 동까지만(동 중심)."""
    m = re.match(r'^(.*\S)\s+(\d+)번지$', jibun)
    if m:
        return (m.group(1), True) if m.group(2) == '0' else (f'{m.group(1)} {m.group(2)}', False)
    return jibun, False


def area_of(jibun):
    """필터용 지역 = 시도 다음부터 동까지('광명시 광명동' · '부천시 소사구 옥길동' · '금천구 독산동')."""
    t = jibun.split()
    return ' '.join(t[1:-1]) if len(t) >= 3 else jibun


def load_source():
    c = sqlite3.connect(str(DB))
    c.row_factory = sqlite3.Row
    rows = [dict(r) for r in c.execute(f'SELECT * FROM "{TABLE}" WHERE visible = 1 ORDER BY CAST(xl_row AS INTEGER)')]
    hidden = c.execute(f'SELECT COUNT(*) FROM "{TABLE}" WHERE visible != 1').fetchone()[0]
    return c, rows, hidden


def lookup_other_tables(c, meters, custs):
    """474 빈칸 행용 — 다른 표에서 같은 계기번호(먼저)·고객번호로 FILL_FIELDS 를 찾는다."""
    found = {}   # (kind, key) -> {field: value}
    tabs = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'") if r[0] != TABLE]
    for tb in tabs:
        cols = [r[1] for r in c.execute(f'PRAGMA table_info("{tb}")')]
        have = [f for f in FILL_FIELDS if f in cols]
        if not have:
            continue
        for kind, col, keys in (('m', '계기번호_norm', meters), ('c', '고객번호_norm', custs)):
            if col not in cols or not keys:
                continue
            q = ','.join('?' * len(keys))
            sel = ', '.join(f'"{f}"' for f in have)
            for r in c.execute(f'SELECT "{col}", {sel} FROM "{tb}" WHERE "{col}" IN ({q})', list(keys)):
                d = found.setdefault((kind, r[0]), {})
                for f, v in zip(have, r[1:]):
                    if clean(v) and f not in d:
                        d[f] = clean(v)
    return found


def main():
    c, src, hidden = load_source()
    print(f'원천 {TABLE}: visible=1 {len(src):,}행 (숨김 {hidden} 제외)')

    blank_rows = [r for r in src if not clean(r.get('계기타입1'))]
    found = lookup_other_tables(c, {norm_meter(r['계기번호']) for r in blank_rows},
                                {norm_cust(r['고객번호']) for r in blank_rows})
    fill_cnt = Counter()

    out = []
    for r in src:
        no = norm_meter(r['계기번호'])
        cust = norm_cust(r['고객번호'])
        jibun = ws(r['지번주소'])
        v = {f: clean(r.get(f)) for f in FILL_FIELDS}
        if not clean(r.get('계기타입1')):
            for f in FILL_FIELDS:
                if not v[f]:
                    hit = (found.get(('m', no)) or {}).get(f) or (found.get(('c', cust)) or {}).get(f)
                    if hit:
                        v[f] = hit
                        fill_cnt[f] += 1
        mt = meter_type(no)
        out.append({
            '지사': JISA,
            '주소': jibun,
            '지번주소': jibun,
            '도로명주소': clean_road(r.get('도로명주소')),
            '지역': area_of(jibun),
            '묶음': GROUP_BY_AREA.get(area_of(jibun), ''),
            '계기번호': no,
            '계기타입': mt,
            '고객번호': cust,
            '상호': clean(r.get('상호')),
            '공동주택명': clean(r.get('공동주택명')),
            '계기위치': clean(r.get('계기위치')),
            '변대주': clean(r.get('변대주명')),
            '변대주번호': clean(r.get('변대주')),
            # ★DCUID 칸에는 10자리 DCUID 만 싣는다(변대주 3축 게이트). PLC(LwM2M) DCU 는 원본에
            #   'LAP1GG00250' 같은 11자리 식별자가 와서 DCUID 축이 아니다 — 버리지 않고 따로 싣는다.
            'DCUID': v['DCU ID'] if re.fullmatch(r'[0-9A-Z]{10}', v['DCU ID']) else '',
            'DCU기타ID': '' if re.fullmatch(r'[0-9A-Z]{10}', v['DCU ID']) else v['DCU ID'],
            '인입주': clean(r.get('인입주명')),
            '인입주전산화': clean(r.get('인입주')),
            '가공지중': clean(r.get('가공지중구분코드')),
            'DCU통신방식': v['변대주 기준 통신방식'],
            'M/S': clean(r.get('M/S')),
            '계약종별': clean(r.get('계약종별')),
            '계약전력': clean(r.get('계약전력')),
            '계약상태': clean(r.get('계약상태')),
            '공급방식': clean(r.get('공급방식')),
            '자재명': clean(r.get('자재명')),
            '계기타입원본': clean(r.get('계기타입')),
            '제작소': clean(r.get('제작소')),
            '제조년월': v['제조년월'],
            '부설일자': v['부설일자'],
            '실효년월': v['실효년월'],
            'LP취득여부': v['LP취득여부'],
            '보강대상': v['보강공사 대상/비대상'],
            'LP성공여부_1007': clean(r.get('20261007 LP성공 여부(고객번호 기준)')),
            '설치불가': clean(r.get('설치불가')),
            '검침원': clean(r.get('검침원_2')),
        })

    unknown = Counter(x['지역'] for x in out if not x['묶음'])
    if unknown:
        sys.exit(f'★묶음 표(GROUP_BY_AREA)에 없는 지역 {dict(unknown)} — 표에 넣고 다시 돌려라')

    # ── 좌표 ──
    from geocode_cascade import resolve
    GEO_CACHE.parent.mkdir(parents=True, exist_ok=True)
    cache = json.loads(GEO_CACHE.read_text(encoding='utf-8')) if GEO_CACHE.exists() else {}
    sites = {}
    for x in out:
        sites.setdefault(x['주소'], x['도로명주소'] or sites.get(x['주소'], ''))
    todo = [a for a in sites if a not in cache]
    print(f'개소 {len(sites):,} · 지오코딩 {len(todo):,} (캐시 {len(sites) - len(todo):,})')
    for i, a in enumerate(todo, 1):
        q, force_center = geo_query_jibun(a)
        road = '' if force_center else sites[a]
        h = resolve(jibun=q, road=road)
        acc = h.accuracy
        if force_center and acc == 'exact':
            acc = 'approximate'          # 동까지만 물었으니 동 중심이다
        cache[a] = {'acc': acc, 'lat': h.lat, 'lng': h.lng, 'method': h.method,
                    'road': h.road or '', 'jibun': h.jibun or ''}
        if i % 200 == 0:
            GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')
            print(f'  [{i}/{len(todo)}] {dict(Counter(cache[k]["acc"] for k in todo[:i]))}', flush=True)
    GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')
    for x in out:
        g = cache[x['주소']]
        x['lat'], x['lng'], x['좌표정확도'] = g['lat'], g['lng'], g['acc']
        if not x['도로명주소'] and g.get('road') and g['acc'] == 'exact':
            x['도로명주소'] = g['road']

    # ── 원본 대조 ──
    src_m = {norm_meter(r['계기번호']) for r in src}
    out_m = {x['계기번호'] for x in out}
    pre = lambda S: Counter(m[:2] for m in S if not m.isdigit())
    print(f'대조: 원본-출력 {len(src_m - out_m)} · 출력-원본 {len(out_m - src_m)} · 중복 {len(out) - len(out_m)}'
          f' · 접두 원본 {sum(pre(src_m).values())} 출력 {sum(pre(out_m).values())}'
          f' · 좌표 null {sum(1 for x in out if x["lat"] is None)}')
    if src_m != out_m or len(out) != len(out_m) or pre(src_m) != pre(out_m) or any(x['lat'] is None for x in out):
        sys.exit('★원본 대조 실패 — 출력하지 않는다')

    site_acc = Counter(cache[a]['acc'] for a in sites)
    print(f'좌표(개소): {dict(site_acc)} · 계기: {dict(Counter(x["좌표정확도"] for x in out))}')
    print(f'방법(개소): {dict(Counter(cache[a]["method"] for a in sites).most_common())}')
    print(f'계기타입: {dict(Counter(x["계기타입"] or "(빈값)" for x in out))}')
    print(f'474 빈칸 행 {len(blank_rows)} — 다른 표에서 채움 {dict(fill_cnt) or 0} · 계기타입은 번호로 {sum(1 for r in blank_rows if meter_type(norm_meter(r["계기번호"])))}건')
    print(f'지역: {dict(Counter(x["지역"] for x in out).most_common())}')
    for g in GROUP_ORDER:
        rs = [x for x in out if x['묶음'] == g]
        print(f'  묶음 {g}: 개소 {len({x["주소"] for x in rs}):,} · 계기 {len(rs):,}')
    print(f'DCU: DCUID(10자리) {sum(1 for x in out if x["DCUID"])} · 기타 형식(DCU기타ID) {sum(1 for x in out if x["DCU기타ID"])}'
          f' {dict(Counter(len(x["DCU기타ID"]) for x in out if x["DCU기타ID"]))}')

    tmp = OUT.with_suffix('.tmp.json')
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    gate = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'validate_bdju.py'), str(tmp)],
                          capture_output=True, text=True)
    print(gate.stdout[-800:])
    if gate.returncode != 0:
        tmp.unlink()
        sys.exit('★validate_bdju 실패 — 출력하지 않는다')
    tmp.replace(OUT)
    print(f'저장 {OUT} — {len(out):,}계기 · {len(sites):,}개소')


if __name__ == '__main__':
    main()
