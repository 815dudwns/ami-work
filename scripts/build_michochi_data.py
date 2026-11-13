#!/usr/bin/env python3
"""'미조치' list (2026-11-07) — 주덕기 과장 미설치 고객 리스트(11/06) 중 AE·G·아미고, 이미 시공한 계기 뺀 것.

PM 이 거른 입력을 그대로 싣는다(다시 거르지 않는다):
  main data/reference/michochi_rows_20261107.json   — 원본 열 + 계기번호(정리) + 번호기준타입
  main data/reference/silhyo_remain_20261107.json   — 실효에 남은 15계기. 위 목록에 없는 것만 실효 필드째 더한다.
  제외 내역(영준님 검토용) = main data/outbox_jdg_20261107/미조치_제외내역_20261107.xlsx
    (+ 합동 철거 시트를 더한 판 = main data/outbox_jdg_20261108/미조치_제외내역_20261108.xlsx)

★합동 철거계기 제외(2026-11-08, 영준님 승인 — 영구 축): 미조치 계기가 합동 리스트(지도 파일 + 아카이브)의
  철거계기(계기번호_전)이면 뺀다. 그 계기는 이미 교체돼 떼어졌고(KDN 11/06 판이 늦었다) 개소는 합동의 새 계기로
  지도에 남는다. FMPMTR 원시 수집분(data/inbox_hapdong)만 있는 철거계기는 빼지 않는다(지도에 다른 흔적이 없다).
  뺀 목록 = data/reference/michochi_exclude_hapdong_removed_<날짜>.json

★올해 실효 대상 제외(2026-11-08, 영준님 승인 — 영구 축): main data/reference/michochi_exclude_silhyo_target_2026_20261108.json
  (1,162 계기) 에 든 계기를 뺀다. 출처 = awms FMPMTR '연간대상 실효계기 목록'(fmpMtr2000, 실효년월 2025-01~2026-12,
  계기번호 가림) 을 우리 전체 번호에 앞4·뒤4·지번으로 맞춘 것(전부 유일, 전체번호 검색 표본 101/101 일치).
  실효 교체 사업 대상이라 미조치(모뎀)로 따로 가지 않는다. 제외 내역 엑셀에 '올해 실효 대상' 시트.
★내년 실효 대상 제외(2026-11-10, 영준님 "확신만 제외" — 같은 영구 축, 목록만 하나 더):
  data/reference/michochi_exclude_silhyo_target_2027_20261110.json (1,364 계기, 실효년월 2027).
  확인 = 전체번호 검색 일치 24 · 앞4·뒤4·지번 양쪽 유일 일치 1,340(같은 지번에 비슷한 번호 형제 없음, 교체 기록 없음).
  엑셀 '내년 실효 대상' 시트. 목록이 늘면 SILHYO_TARGETS 에 파일만 더한다.
★계기불량 대장 제외(2026-11-13, 영준님 "리스트에서 제외할 자료" — 영구 축): data/reference/meter_bad_ledger_2025_exclude_20261113.json
  (628 계기, 윤용운 반장 메일 — 2025 1~7월 계기불량 사진대장). 계기번호 정확 일치만(숫자만이면 zfill11, 추정·유사번호 금지).
  뺀 목록 = data/reference/michochi_exclude_bad_ledger_20261113.json. 엑셀 '계기불량 대장' 시트.
  목록 파일·매칭 = scripts/bad_ledger.py(25미청구 M7 과 공용) — 목록이 늘면 거기 BAD_LEDGERS 에 파일만 더한다.

Output: data/michochi/<지사영문>.json (지사별 7개, 2026-11-08 — 지도는 고른 지사 파일만 받는다) — 계기 1행. 상태키 '주소|미조치'(네임스페이스 — 실효·합동·미청구의 옛 완료를
  물려받지 않게). js/datasets.js code 'c'.
  ★2026-11-10 둘로 나눈다(계기 단위, is_plc_dcu) — DCU 대장에서 찾았고 DCU 통신방식 PLC·K-DCU = 미조치 data/michochi/,
    나머지(대장미등재·HPGP) = 미조치(lte) data/michochi-lte/<지사영문>.json (code 'l'). 상태키 '주소|미조치' / '주소|미조치lte'
    (2026-11-12 분리 — 11/10~11/12 엔 둘 다 '주소|미조치').
    게이트: 두 리스트 합 = 전체(겹침 0) · 리스트 하나·지사 파일 하나만 읽어도 키 같음 · validate_bdju · 좌표 구.
  ★파일 서식 = 한 줄에 한 행(compact). 14만 행이라 indent 를 주면 수십 MB 가 늘어난다.
  ★값이 빈 칸은 싣지 않는다(지도·상세는 없는 필드를 빈칸으로 읽는다).

필드
  지사 · 주소(원본, 공백만 정리) · 도로명주소(지오코딩 응답 또는 같은 주소의 기존 행) · 계기번호(정리본)
  계기타입 = 번호기준타입(AE/G/아미고 — 번호 3~4자리 기준) · 계기타입_원본(리스트 열, 번호 기준과 다를 때만)
  변대주(이름 축) · 변대주번호(= 전산화 번호, 8자리일 때만 — 아니면 변대주번호_원장 에 원문)
  변대주 하위(미설치 개소) · 상 구분 · 계약종별 · 계약상태 · 대상여부 · LP수신(성공실패 'x/96', #N/A 는 빈칸)
  lat · lng(6자리) · 좌표정확도(approximate 일 때만 — 없으면 exact) · 미설치개소(=원본 '변대주 하위(미설치 개소)')
  대상여부는 '대상' 이 아닐 때만 (+ dcu_철거예정 — apply_dcu_status.py 가 붙인다)
  변대주 영역(2026-11-09) = dcu_master 한 묶음 — 변대주·변대주번호·DCUID·DCU통신방식·회선상태·철거판정·DCU차수·대장출처
    (fix_bdju, 못 찾으면 대장출처 '대장미등재'). 원장 값이 대장과 다르면 변대주_원장·변대주번호_원장.

좌표 — 같은 주소의 기존 좌표를 먼저 쓴다(전 리스트 + 아카이브 + 종로맵·구로, exact 만).
  나머지는 scripts/michochi_geocode.py 가 만든 캐시(data/inbox_michochi/geocode-cache.json).
  캐시에 없는 주소가 하나라도 있으면 멈춘다(지오코딩을 먼저 끝내라).

DCU 철거예정 판정은 빌더 안에서(apply_dcu_status.apply_to — 파일에 돌리면 indent 로 다시 써 용량이 는다).
Gates: 원본 대조(계기 집합 양방향 — 실효 추가분 제외, 접두 문자 건수, 좌표 null) · validate_bdju · 아카이브 제외.

    python3 scripts/michochi_geocode.py     # 먼저(재개 가능)
    python3 scripts/build_michochi_data.py
"""
import glob
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = Path('/Users/woodelight/Projects/ami-work')
SRC = MAIN / 'data/reference/michochi_rows_20261107.json'
SILHYO = MAIN / 'data/reference/silhyo_remain_20261107.json'
# 지사별 파일(2026-11-08) — 레지스트리 fileByJisa 템플릿을 따른다. 한 파일(58MB)은 더 쓰지 않는다.
OUT_TPL = 'data/michochi/*.json'
# 미조치(lte) — DCU 없는 계기(2026-11-10). 레지스트리 'l' fileByJisa 와 같아야 한다(아래 _check_registry_paths).
OUT_LTE_TPL = 'data/michochi-lte/*.json'
CACHE = ROOT / 'data/inbox_michochi/geocode-cache.json'
# 합동 철거계기 제외 축 — 지도 합동 파일 + 아카이브만(원시 FMPMTR 수집분은 넣지 않는다)
HAPDONG_FILES = ['data/hapdong-data.json', 'data/hapdong-data-archive.json']
HAPDONG_EXCL_OUT = ROOT / 'data/reference/michochi_exclude_hapdong_removed_20261108.json'
# 실효 대상 제외 축(올해·내년) — 목록 파일들. 레포에 커밋된 판을 읽는다(main 에 합쳐지면 main 의 같은 파일).
SILHYO_TARGETS = [ROOT / 'data/reference/michochi_exclude_silhyo_target_2026_20261108.json',
                  ROOT / 'data/reference/michochi_exclude_silhyo_target_2027_20261110.json']
# 계기불량 대장 제외 축(2026-11-13) — 목록 파일·매칭은 scripts/bad_ledger.py(25미청구와 공용)
BAD_LEDGER_EXCL_OUT = ROOT / 'data/reference/michochi_exclude_bad_ledger_20261113.json'
POLE_MOVED_OUT = ROOT / 'data/reference/michochi_pole_near_moved_20261109.json'    # 옮긴 '?' 개소·갈래·거리
POLE_SPREAD_OUT = ROOT / 'data/reference/michochi_pole_near_spread_20261109.json'   # 형제가 300m 넘게 퍼진 '?' 개소
METER_RE = re.compile(r'^[0-9A-Z]{2}[0-9]{9}$')
TYPE_BY_CODE = {'19': 'AE', '25': 'G', '26': 'G', '27': 'G', '45': 'G', '46': 'G', '47': 'G',
                '52': '아미고', '53': '아미고', '54': '아미고', '55': '아미고'}
TYPE_OF_COL = {'AE타입': 'AE', 'G타입': 'G', '보안계기': '아미고'}

# 같은 주소의 좌표를 빌려 올 파일들 — 지도 리스트·아카이브(레지스트리) + 종로맵·구로 + 다른 빌더 캐시
POOL_FILES = ['jongno-combined/data/jongno-site-data.json', 'jongno-combined/data/guro-site-data.json']
POOL_CACHES = ['data/inbox_hapdong/geocode-cache.json', 'data/inbox_seonjochi/geocode-cache.json',
               'data/inbox_gwangmyeong/geocode-cache.json']

ws = lambda s: re.sub(r'\s+', ' ', str(s if s is not None else '')).strip()  # noqa: E731


def clean(v):
    v = ws(v)
    return '' if v in ('#N/A', 'None', 'nan', '-') else v


def area(a):
    m = re.match(r'^\S+\s+(\S+구)\b', ws(a))
    return m.group(1) if m else None


def coord_pool():
    """주소 -> {lat,lng,acc,road,src}. exact 를 우선한다. 주소·지번주소 둘 다로 건다."""
    sys.path.insert(0, str(ROOT / 'scripts'))
    from datasets import DATASETS, archive_paths, dataset_files
    files = []
    for d in DATASETS:
        if d['code'] != 'c':
            files += [ROOT / f for f in dataset_files(d)]
        files += archive_paths(d['code'])
    files += [ROOT / f for f in POOL_FILES]
    # 마지막 = 미조치 자기 이전 판(2026-11-08). 다른 리스트가 아카이브·재생성으로 그 주소를 잃어도 이미 게이트를
    #   통과한 좌표를 그대로 이어 쓴다(add 는 먼저 들어온 exact 를 지키므로 빈 주소만 채운다).
    files += sorted((ROOT / 'data/michochi').glob('*.json'))
    pool = {}

    def add(a, lat, lng, acc, road, src):
        a = ws(a)
        if not a or lat is None or lng is None:
            return
        old = pool.get(a)
        if old and (old['acc'] == 'exact' or acc != 'exact'):
            if old and not old['road'] and road and old['acc'] == acc:
                old['road'] = road
            return
        pool[a] = {'lat': lat, 'lng': lng, 'acc': acc, 'road': road or '', 'src': src}

    for f in files:
        if not f.exists():
            continue
        arr = json.loads(f.read_text(encoding='utf-8'))
        if not isinstance(arr, list):
            arr = next((v for v in arr.values() if isinstance(v, list)), [])
        for r in arr:
            if not isinstance(r, dict):
                continue
            acc = 'exact' if (r.get('좌표정확도') or 'exact') == 'exact' else 'approximate'
            road = ws(r.get('도로명주소'))
            for k in ('주소', '지번주소'):
                if r.get(k):
                    add(r[k], r.get('lat'), r.get('lng'), acc, road, f.name)
    for c in POOL_CACHES:
        p = ROOT / c
        if not p.exists():
            continue
        for a, v in json.loads(p.read_text(encoding='utf-8')).items():
            if isinstance(v, dict):
                add(a, v.get('lat'), v.get('lng'), 'exact' if v.get('acc') == 'exact' else 'approximate',
                    ws(v.get('road')), p.parent.name)
    return pool


def norm_meter(v):
    """계기번호: 공백·하이픈 제거, 대문자, 순수 숫자만 zfill(11) — 영문 접두는 그대로(build_hapdong_data 와 같다)."""
    s = re.sub(r'[\s-]', '', str(v if v is not None else '')).upper()
    return s.zfill(11) if s.isdigit() else s


def hapdong_removed():
    """합동 철거계기 -> 그 합동 행들(작업일 최신 먼저)."""
    by = {}
    for f in HAPDONG_FILES:
        for r in json.loads((ROOT / f).read_text(encoding='utf-8')):
            m = norm_meter(r.get('계기번호_전'))
            if m:
                by.setdefault(m, []).append(r)
    for rows in by.values():
        rows.sort(key=lambda r: str(r.get('작업일') or ''), reverse=True)
    return by


def dump(rows):
    return '[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows) + '\n]'


def main():
    src = json.loads(SRC.read_text(encoding='utf-8'))
    sil = json.loads(SILHYO.read_text(encoding='utf-8'))
    pool = coord_pool()
    cache = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}

    out = []
    bad_bd = []
    for r in src:
        m = ws(r['계기번호(정리)'])
        a = ws(r['주소'])
        t = r['번호기준타입']
        x = {'지사': ws(r['지사']), '주소': a}
        if a != str(r['주소']):
            x['주소_원문'] = r['주소']
        x['계기번호'] = m
        x['계기타입'] = t
        if TYPE_OF_COL.get(r['계기타입']) != t:
            x['계기타입_원본'] = ws(r['계기타입'])
        bd = clean(r['변대주'])
        if bd:
            x['변대주'] = bd
        no = clean(r['전산화 번호']).replace(' ', '').upper()
        if len(no) == 8:
            x['변대주번호'] = no
        elif no:
            x['변대주번호_원장'] = no
            bad_bd.append((m, no))
        v = clean(r['변대주 하위(미설치 개소)'])
        if v:
            x['미설치개소'] = v          # 원본 열 '변대주 하위(미설치 개소)' — 열 이름이 길어 줄였다(14만 행)
        for k in ('상 구분', '계약종별', '계약상태'):
            v = clean(r[k])
            if v:
                x[k] = v
        v = clean(r['대상여부'])
        if v and v != '대상':            # 99%가 '대상' — 없으면 '대상'
            x['대상여부'] = v
        lp = clean(r['성공실패'])
        if lp:
            x['LP수신'] = lp
        out.append(x)

    # 실효 잔여 — 목록에 없는 계기만 실효 필드째(상태키 판정용 필드는 뺀다)
    have = {x['계기번호'] for x in out}
    sil_add = []
    for r in sil:
        if r['계기번호'] in have:
            continue
        x = {k: v for k, v in r.items() if k not in ('실효상태키', '미설치겹침') and v not in ('', None)}
        x['계기타입'] = TYPE_BY_CODE.get(x['계기번호'][2:4], x.get('계기타입'))   # 번호 기준으로 맞춘다
        x['출처'] = '실효 잔여'
        sil_add.append(x)
    out += sil_add

    # 아카이브 제외(지금은 없다 — 나중에 완료분을 아카이브로 옮긴 뒤 다시 돌려도 되살리지 않게)
    from datasets import archived_meters
    arch = archived_meters('c') | archived_meters('l')   # 미조치 · 미조치(lte) 아카이브 둘 다 — 끝난 계기는 다시 안 올린다
    if arch:
        n0 = len(out)
        out = [x for x in out if x['계기번호'] not in arch]
        print(f'아카이브 제외 {n0 - len(out):,}')

    # 합동 철거계기 제외(영구 축 — 위 docstring)
    hd = hapdong_removed()
    excl = []
    keep = []
    for x in out:
        rows = hd.get(norm_meter(x['계기번호']))
        if not rows:
            keep.append(x)
            continue
        h = rows[0]
        excl.append({'계기번호': x['계기번호'], '지사': x['지사'], '미조치 주소': x['주소'],
                     '합동 주소': h.get('주소', ''), '합동 지번주소': h.get('지번주소', ''),
                     '합동 새 계기번호': h.get('계기번호', ''), '합동 작업일': h.get('작업일', ''),
                     '합동 행 수': len(rows)})
    out = keep
    excl_m = {e['계기번호'] for e in excl}
    print(f'합동 철거계기 제외 {len(excl):,} (합동 철거계기 {len(hd):,} 중) · 작업일 '
          f'{dict(sorted(Counter(e["합동 작업일"][:6] for e in excl).items()))}')
    HAPDONG_EXCL_OUT.write_text(json.dumps(excl, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    # 실효 대상 제외(올해·내년, 영구 축 — 위 docstring). 파일마다 같은 길로 빼고 따로 센다.
    for st_path in SILHYO_TARGETS:
        st_rows = json.loads(st_path.read_text(encoding='utf-8'))
        st_set = {norm_meter(r['계기번호']) for r in st_rows if r.get('계기번호')}
        n0 = len(out)
        st_hit = {x['계기번호'] for x in out if norm_meter(x['계기번호']) in st_set}
        out = [x for x in out if x['계기번호'] not in st_hit]
        print(f'실효 대상 제외 [{st_path.name}] {n0 - len(out):,} (목록 {len(st_set):,} 중 · 이미 다른 축으로 빠진 것 '
              f'{len(st_set & excl_m)} · 미조치에 없던 것 {len(st_set - st_hit - excl_m)} {sorted(st_set - st_hit - excl_m)[:20]})')
        excl_m = excl_m | st_hit

    # 계기불량 대장 제외(영구 축 — 위 docstring). 계기번호 정확 일치만.
    import bad_ledger as BL
    bl_set = BL.load()
    n0 = len(out)
    bad_excl = []
    hit_m = set()
    for x, v, fname in BL.hits(out):
        hit_m.add(x['계기번호'])
        bad_excl.append({'계기번호': x['계기번호'], '지사': x['지사'], '미조치 주소': x['주소'],
                         '대장 사업소': v.get('사업소', ''), '증상': v.get('증상', ''), '대장 장소': v.get('장소', ''),
                         '일자': v.get('일자', ''), '작업자': v.get('작업자', ''), '제조': v.get('제조', ''),
                         '분기': v.get('분기', ''), '대장 파일': fname})
    out = [x for x in out if x['계기번호'] not in hit_m]
    excl_n = {norm_meter(m) for m in excl_m}
    print(f'계기불량 대장 제외 {n0 - len(out):,} (목록 {len(bl_set):,} 중 · 이미 다른 축으로 빠진 것 '
          f'{len(set(bl_set) & excl_n)} · 미조치에 없던 것 {len(set(bl_set) - {norm_meter(m) for m in hit_m} - excl_n)})')
    excl_m = excl_m | hit_m
    BAD_LEDGER_EXCL_OUT.write_text(json.dumps(bad_excl, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    # 좌표
    miss = sorted({x['주소'] for x in out if x.get('lat') is None
                   and not (x['주소'] in pool and pool[x['주소']]['acc'] == 'exact') and x['주소'] not in cache})
    if miss:
        sys.exit(f'★좌표 캐시에 없는 주소 {len(miss):,} — scripts/michochi_geocode.py 먼저. 예 {miss[:3]}')
    how = Counter()
    for x in out:
        if x.get('lat') is not None:      # 실효 잔여분 — 자기 좌표
            how['실효 자기 좌표'] += 1
            continue
        a = x['주소']
        p = pool.get(a)
        if p and p['acc'] == 'exact':
            g, how_k = p, '기존 좌표'
        else:
            g, how_k = cache[a], '지오코딩'
        if g['lat'] is None:
            x['lat'] = x['lng'] = None
            x['좌표정확도'] = 'fail'
        else:
            x['lat'], x['lng'] = round(g['lat'], 6), round(g['lng'], 6)
            # ★exact 는 싣지 않는다(지도는 'approximate' 만 본다 — 없으면 정확). 14만 행이라 3.7MB.
            if g['acc'] != 'exact':
                x['좌표정확도'] = 'approximate'
        road = ws(g.get('road'))
        road = road if road.startswith('서울특별시') else re.sub(r'^서울\s', '서울특별시 ', road)
        # ★도로명이 다른 구면 싣지 않는다 — 경계 건물이라 지번은 이 구인데 도로명이 옆 구로 붙는다
        #   (면목동 1047 -> 동대문구 중랑천서자전거길 · 공덕동 111-262 -> 용산구 임정로). 좌표는 역지오코딩으로 이 구다.
        if road and not x.get('도로명주소'):
            if area(road) == area(a):
                x['도로명주소'] = road
            else:
                how['도로명 다른 구라 뺌'] += 1
        how[f'{how_k}·{x.get("좌표정확도", "exact")}'] += 1

    # ── 원본 대조 ──
    src_m = [ws(r['계기번호(정리)']) for r in src]
    out_m = [x['계기번호'] for x in out]
    add_m = {x['계기번호'] for x in sil_add}
    pre = lambda S: Counter(m[:2] for m in S if not m.isdigit())  # noqa: E731
    d1 = set(src_m) - set(out_m) - excl_m - set(arch or ())   # 일부러 뺀 것(합동 철거·실효 대상·계기불량 대장·아카이브)은 빠져도 된다
    d2 = set(out_m) - set(src_m) - add_m
    nulls = sum(1 for x in out if x.get('lat') is None)
    print(f'대조: 원본 {len(src_m):,} · 실효 추가 {len(sil_add)} · 제외 축(합동 철거+실효 대상+계기불량 대장) {len(excl_m)} · 출력 {len(out_m):,}'
          f' · 원본-출력(제외분 뺀) {len(d1)}'
          f' · 출력-원본(실효 추가 제외) {len(d2)} · 중복 {len(out_m) - len(set(out_m))}'
          f' · 접두 원본 {dict(pre(src_m))} 출력 {dict(pre(out_m))} · 좌표 null {nulls}')
    if d1 or d2 or len(out_m) != len(set(out_m)) or pre((set(src_m) | add_m) - excl_m - set(arch or ())) != pre(out_m) or nulls:
        sys.exit('★원본 대조 실패 — 출력하지 않는다')

    bad_fmt = [m for m in out_m if not METER_RE.match(m)]
    print(f'계기번호 형식 위반 {len(bad_fmt)} {bad_fmt[:10]}')
    print(f'전산화 번호 8자리 아님 -> 변대주번호_원장 {bad_bd}')
    print(f'좌표(계기) {dict(how)}')
    sites = {}
    for x in out:
        sites.setdefault(x['주소'], x.get('좌표정확도', 'exact'))
    print(f'개소 {len(sites):,} · 좌표(개소) {dict(Counter(sites.values()))}')
    print(f'지사 {dict(Counter(x["지사"] for x in out).most_common())}')
    print(f'계기타입 {dict(Counter(x["계기타입"] for x in out))}')
    print(f'실효 추가 {[(x["주소"], x["계기번호"]) for x in sil_add]}')

    # DCU 철거예정 판정 — 새 리스트마다(scripts/apply_dcu_status.py, 매칭키 변대주명+지사).
    #   ★그 스크립트를 파일에 돌리면 indent=1 로 다시 써서 수십 MB 가 는다 — 같은 함수를 여기서 부른다.
    import apply_dcu_status as DCU
    removal, comm = DCU.load_reference()
    st = DCU.apply_to(out, removal, comm)
    print(f'DCU 판정 {dict(st.most_common())}')

    # 변대주 영역 = dcu_master 한 묶음(2026-11-09, 영준님 "변대주 대입법칙 따라서 dcu 매칭") — 25미청구·불가와
    #   같은 함수(build_michunggu_dataset_20260918.fix_bdju): 형태로 칸을 정하고 번호 -> 이름 -> DCUID 순으로
    #   같은 축끼리만 찾는다. 찾으면 이름·번호·DCUID·통신방식·회선상태·철거판정·차수를 같은 대장 행에서 통째로,
    #   못 찾으면 번호·DCUID 를 비우고 대장출처 '대장미등재'(상세 'DCU 없음'). 원장 값은 변대주_원장·변대주번호_원장.
    #   ★위 DCU 판정(변대주명+지사) 뒤에 돈다 — 이름이 대장 표기로 바뀌어도 통신방식 판정은 원본 이름 그대로다.
    #   ★칸별 출처(변대주출처 등)는 싣지 않는다 — 전부 대장출처와 같다(14만 행).
    import importlib.util
    _s = importlib.util.spec_from_file_location('michunggu_ds', str(ROOT / 'scripts/build_michunggu_dataset_20260918.py'))
    D = importlib.util.module_from_spec(_s)
    _s.loader.exec_module(D)
    by_id, by_no, by_name = D.load_dcu_master()
    multi = dcu_multi_cha()
    multi_hit = Counter(x['변대주번호'] for x in out if x.get('변대주번호') in multi)
    D.fix_bdju(out, by_id, by_no, by_name)
    for x in out:
        for k in ('변대주출처', '변대주번호출처', 'DCUID출처'):
            x.pop(k, None)
    print(f'대장출처 {dict(Counter(x["대장출처"] for x in out).most_common())}')
    print(f'번호 하나에 DCU 여럿(첫 행 채택) — 번호 {len(multi_hit)} · 계기 {sum(multi_hit.values())} · '
          f'{sorted(multi_hit.items())}')
    for x in out:                       # 빈 칸은 싣지 않는다(apply_to 는 판정 없음을 '' 로 넣는다)
        for k in [k for k, v in x.items() if (v == '' or v is None) and k not in ('lat', 'lng')]:
            del x[k]
        # ★통신방식은 실효 잔여(실효 리스트의 실제 계기 정보)에만 남긴다(PM 2026-11-09).
        #   나머지 행의 값은 apply_dcu_status 가 변대주명으로 끌어온 DCU 값이라 위 대장 묶음(DCU통신방식)과
        #   겹치고(7만 행 중 25 만 다름), 상세가 대장출처 행의 통신방식을 '현재 통신방식' 으로 그려 틀린 말이 된다.
        #   dcu_철거예정 은 따로 규칙이라 남긴다.
        if x.get('출처') != '실효 잔여':
            x.pop('통신방식', None)
            x.pop('통신방식_출처', None)

    pole_near(out, cache)
    # ── 미조치 / 미조치(lte) 나누기(2026-11-10 영준님 "변대주 기준으로 dcu 가 있는 개소와 없는 개소로") ──
    #   계기 단위다 — 대장(dcu_master)에서 DCU 를 찾았고 그 DCU 통신방식이 PLC·K-DCU 인 계기 = 미조치,
    #   나머지(대장미등재 · DCU 통신방식 HPGP — 영준님 "Hpgp lte포함해") = 미조치(lte).
    #   한 주소에 양쪽이 섞이면 두 리스트에 다 나온다(마커마다 그 리스트 계기만). 좌표·주소·칸은 안 바꾼다.
    #   ★상태키는 리스트마다 따로 — 미조치 '주소|미조치' · 미조치(lte) '주소|미조치lte'(2026-11-12 영준님 "모든리스트 개별동작하게").
    dcu = [x for x in out if is_plc_dcu(x)]
    lte = [x for x in out if not is_plc_dcu(x)]
    print(f'나누기 기준 {dict(Counter((x.get("대장출처", "")[:10], x.get("DCU통신방식", "")) for x in out).most_common())}')
    print(f'나누기: 미조치(DCU PLC·K-DCU) {len(dcu):,}계기 · {len({x["주소"] for x in dcu}):,}개소 / '
          f'미조치(lte) {len(lte):,}계기 · {len({x["주소"] for x in lte}):,}개소 / '
          f'섞인 개소 {len({x["주소"] for x in dcu} & {x["주소"] for x in lte}):,}')
    write_split({'c': (dcu, OUT_TPL), 'l': (lte, OUT_LTE_TPL)}, out)


MICHOCHI_DCU_COMM = ('PLC', 'K-DCU')   # 미조치에 남는 DCU 통신방식 — HPGP 는 lte 로(2026-11-10 영준님)


def is_plc_dcu(x):
    """미조치(DCU)에 남는 계기인가 — DCU 대장에서 찾았고(대장출처 'dcu_master/...', 못 찾으면 '대장미등재')
    그 DCU 통신방식(DCU통신방식)이 PLC·K-DCU. 아니면 미조치(lte)."""
    return (str(x.get('대장출처') or '').startswith('dcu_master/')
            and str(x.get('DCU통신방식') or '').strip() in MICHOCHI_DCU_COMM)


def _check_registry_paths(lists):
    """빌더 출력 경로가 레지스트리(scripts/datasets.py) fileByJisa 와 같은가 — 어긋나면 지도가 못 찾는다."""
    from datasets import DATASETS
    reg = {d['code']: d.get('fileByJisa') for d in DATASETS}
    for code, (_, tpl) in lists.items():
        if reg.get(code) != tpl:
            sys.exit(f'★레지스트리 경로 불일치 — {code}: 빌더 {tpl} / 레지스트리 {reg.get(code)}')


# ── '?' 개소를 같은 변대주의 정확 개소 옆으로(2026-11-09, 영준님 "물음표를 변대주로 옮겨 … 마커 겹치지 않게") ──
#   ★옮기는 건 **위치를 모르는 '?'** 만이다(where_unknown — 번지없음·주소해석불가·본번다름). 본번이 같은 '?' 는
#     제자리 근처라 그대로 둔다(영준님 정정 2026-11-09).
#   우리 DCU 대장엔 변대주 좌표가 없다 — 같은 변대주에 붙은 미조치 **정확 개소**들이 변대주 위치의 근사다.
#   ★'?' 는 남긴다(좌표정확도 approximate 그대로, 광명 7차 선례). 좌표출처 'pole_<변대주명>_근처' 로 상세에 띄운다.
#   ★주소·상태키(주소|미조치)·계기 집합·정확 개소는 안 건드린다. lat/lng/좌표출처 만.
#   키 = 변대주번호(대장) > 변대주번호_원장 > 변대주명(공백 제거) — 축을 넘나들지 않는다(축 이름까지 키에 넣는다).
#   형제 = 같은 키 · 같은 구의 정확 개소. 같은 동에 있으면 그것만. 기준점 = 형제 좌표의 medoid(실제 개소 하나).
#   겹침 금지 = 기준점 둘레 고리(20m, 다 차면 15m씩 바깥)에 각도를 나눠 놓고, 모든 미조치 마커·먼저 놓은 개소와
#   POLE_MIN_SEP 이상 떨어진 첫 자리. 지도는 소수 6자리 같은 좌표를 한 마커로 합친다(status-key.js markerKeyOf).
POLE_RING0, POLE_RING_STEP, POLE_MIN_SEP = 20.0, 15.0, 12.0
POLE_SPREAD_WARN = 300.0


def _dist_m(a, b):
    import math
    dy = (a[0] - b[0]) * 111320.0
    dx = (a[1] - b[1]) * 111320.0 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


def _dong_of(addr):
    m = re.match(r'^\S+\s+\S+구\s+(\S+)', ws(addr))
    return m.group(1) if m else ''


def _pole_key(x):
    if x.get('변대주번호'):
        return ('번호', x['변대주번호'].upper())
    if x.get('변대주번호_원장'):
        return ('원장번호', str(x['변대주번호_원장']).upper())
    if x.get('변대주'):
        return ('이름', re.sub(r'\s+', '', x['변대주']).upper())
    return None


def where_unknown(a, cache):
    """'?' 개소가 **어디 들어갈지 모르는** 것인가(영준님 정정 2026-11-09 "제대로 들어간 애들은 놔둬야 해.
    어디 들어갈지 몰라서 동 가운데나 그 동네 찍힌 것들만"). 옮길 갈래 이름 또는 None(그대로).
      번지없음 — 동 중심이거나 응답에 번지가 없다 / 주소해석불가 — 원본 주소를 못 읽었다
      본번다름 — 응답 본번이 원본 본번과 다르다(이웃 지번으로 찍힌 것)
      None    — 본번이 같다(부번·산·본번 검색 차이 — 제자리 근처)"""
    import michochi_geocode as MG
    v = cache.get(a) or {}
    meth = v.get('method', '')
    if meth.startswith('unparsed'):
        return '주소해석불가'
    if meth.startswith('dong_center'):
        return '번지없음'
    p = MG.parts(a)
    g = MG.parts(v['jibun']) if v.get('jibun') else None
    lp = MG.lot(p[2]) if p else None
    lg = MG.lot(g[2]) if g else None
    if not lp or not lg:
        return '번지없음'
    return None if lp[1] == lg[1] else '본번다름'


def pole_near(out, cache):
    import math
    sites = {}
    for x in out:
        sites.setdefault(x['주소'], []).append(x)
    approx = {a: v for a, v in sites.items() if any(x.get('좌표정확도') == 'approximate' for x in v)}
    exact = {a: v for a, v in sites.items() if a not in approx}
    # 키 -> 정확 개소 (구, 동, 좌표)
    sib = {}
    for a, v in exact.items():
        for k in {_pole_key(x) for x in v} - {None}:
            sib.setdefault(k, {})[a] = (area(a), _dong_of(a), (v[0]['lat'], v[0]['lng']))
    # 겹침 검사용 격자(약 22m 칸) — 모든 미조치 마커 좌표
    CELL = 0.0002
    grid = {}

    def put(pt):
        grid.setdefault((int(pt[0] // CELL), int(pt[1] // CELL)), []).append(pt)

    def free(pt):
        ci, cj = int(pt[0] // CELL), int(pt[1] // CELL)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for q in grid.get((ci + di, cj + dj), ()):
                    if _dist_m(pt, q) < POLE_MIN_SEP:
                        return False
        return True

    for v in sites.values():
        if v[0].get('lat') is not None:
            put((v[0]['lat'], v[0]['lng']))
    st = Counter()
    moved_d, spread, moved_list = [], [], []
    for a in sorted(approx, key=lambda a: (str(_pole_key(approx[a][0])), a)):
        v = approx[a]
        why = where_unknown(a, cache)
        if why is None:
            st['그대로 — 본번 같음(제자리 근처)'] += 1
            continue
        keys = Counter(k for k in (_pole_key(x) for x in v) if k)
        if not keys:
            st[f'그대로 — 변대주 없음({why})'] += 1
            continue
        k = sorted(keys.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        gu, dong = area(a), _dong_of(a)
        cand = [(aa, t[2]) for aa, t in sib.get(k, {}).items() if t[0] == gu]
        if not cand:
            st[f'그대로 — 같은 변대주·같은 구 정확 개소 없음({why})'] += 1
            continue
        same_dong = [(aa, p) for aa, p in cand if sib[k][aa][1] == dong]
        if same_dong:
            cand = same_dong
        pts = [p for _, p in cand]
        anchor = min(pts, key=lambda p: (sum(_dist_m(p, q) for q in pts), p))
        far = max(_dist_m(anchor, q) for q in pts)
        if far > POLE_SPREAD_WARN:
            spread.append((a, k[1], len(pts), round(far)))
        spot = None
        ring = 0
        while spot is None and ring < 40:
            r = POLE_RING0 + ring * POLE_RING_STEP
            n = max(6, int(2 * math.pi * r // POLE_MIN_SEP))
            for i in range(n):
                th = 2 * math.pi * i / n + ring * 0.37
                dlat = r * math.cos(th) / 111320.0
                dlng = r * math.sin(th) / (111320.0 * math.cos(math.radians(anchor[0])))
                pt = (round(anchor[0] + dlat, 6), round(anchor[1] + dlng, 6))
                if free(pt):
                    spot = pt
                    break
            ring += 1
        if spot is None:
            st['그대로 — 빈 자리 없음'] += 1
            continue
        old = (v[0]['lat'], v[0]['lng'])
        name = next((x.get('변대주') for x in v if _pole_key(x) == k and x.get('변대주')), '') or k[1]
        for x in v:
            x['lat'], x['lng'] = spot
            x['좌표출처'] = f'pole_{name}_근처'
        put(spot)
        moved_d.append(_dist_m(old, spot))
        st['옮김'] += 1
        st['옮김 계기'] += len(v)
        st[f'  옮김 {why}'] += 1
        moved_list.append({'주소': a, '갈래': why, '변대주': name, '형제 개소': len(pts),
                           '이동m': round(_dist_m(old, spot)), '기준 개소': next(aa for aa, p in cand if p == anchor)})
        st[f'  형제 {"같은 동" if same_dong else "같은 구"}'] += 1
    moved_d.sort()
    q = lambda f: round(moved_d[min(len(moved_d) - 1, int(f * len(moved_d)))]) if moved_d else 0  # noqa: E731
    print(f"변대주 근처로 옮김: {dict(st)} · 이동거리 중앙 {q(0.5)}m · p90 {q(0.9)}m · 최대 {q(1.0)}m · "
          f"형제 {POLE_SPREAD_WARN:.0f}m 넘게 퍼짐 {len(spread)}")
    POLE_SPREAD_OUT.write_text(json.dumps([{'주소': a, '키': kk, '형제 개소': n, '최대 거리m': d}
                                           for a, kk, n, d in spread], ensure_ascii=False, indent=1) + '\n',
                               encoding='utf-8')
    POLE_MOVED_OUT.write_text(json.dumps(moved_list, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return st


def dcu_multi_cha():
    """dcu_master 에서 변대주번호 하나에 DCU(차수) 가 여럿인 번호 -> 행들. fix_bdju 는 첫 행을 쓴다."""
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    by = {}
    for did, no, cha in con.execute('SELECT DCU_ID,변대주번호,차수 FROM dcu_master'):
        no = (no or '').strip()
        if no:
            by.setdefault(no, []).append(((did or '').strip(), (cha or '').strip()))
    con.close()
    return {k: v for k, v in by.items() if len(v) > 1}


def write_split(lists, full):
    """리스트별·지사별 파일로 쓰고 게이트를 돈다. 실패하면 이번에 쓴 파일을 전부 지운다.
    lists = {코드: (rows, 경로 템플릿)} — 미조치 'c' · 미조치(lte) 'l'. full = 나누기 전 전체(키 기준).
    ★지사 판정 = 지도 jisaOf 와 같은 함수(scripts/jisa_split.py) — 지사를 고르면 그 파일만 받는다.
    게이트: 두 리스트 합 = 전체(계기 집합 정확히, 겹침 0) · 상태키 — 전체로 계산한 키 = 리스트 하나·지사 파일 하나만
    읽었을 때의 키 · validate_bdju · 좌표 구.
    ★상태키 게이트는 주소 부분을 본다(카테고리를 '미조치' 로 맞춰 계산) — 2026-11-12 부터 실제 키는 리스트마다
      '주소|미조치' / '주소|미조치lte' 지만, 리스트 하나만 읽어도 주소 부분이 전체와 같아야 미조치 쪽 키가 나누기 전과
      같고 lte 쪽 옛 공유 기록을 접미만 바꿔 옮길 수 있다(scripts/migrate_michochi_lte_keys.py)."""
    import jisa_split as JS
    _check_registry_paths(lists)
    ids = [x['계기번호'] for rows, _ in lists.values() for x in rows]
    if len(ids) != len(full) or set(ids) != {x['계기번호'] for x in full} or len(ids) != len(set(ids)):
        sys.exit(f'★나누기 게이트 실패 — 합 {len(ids):,} / 전체 {len(full):,} / 겹침 {len(ids) - len(set(ids))}')
    parts_all = {}
    for code, (rows, _) in lists.items():
        parts, cross = JS.split_rows(rows)
        parts_all[code] = parts
        print(f'[{code}] 지사 파일 {dict((j, len(v)) for j, v in parts.items())} · 두 지사에 걸친 주소 {cross}')
    flat = {(c, j): v for c, ps in parts_all.items() for j, v in ps.items()}
    bad = JS.key_diff(full, flat, '미조치')
    if bad:
        sys.exit(f'★상태키 게이트 실패 — 리스트 하나·지사 파일 하나만 읽으면 키가 바뀌는 계기 {len(bad)} {bad[:5]}')
    print(f'상태키 게이트 통과 — 리스트·지사 파일 {len(flat)}개 각각만 읽어도 전체와 같은 키')
    files = []
    for code, (rows, tpl) in lists.items():
        outdir = ROOT / Path(tpl).parent
        outdir.mkdir(parents=True, exist_ok=True)
        for j, slug in JS.JISA_SLUG.items():
            f = ROOT / tpl.replace('*', slug)
            part = parts_all[code].get(j)
            if part:
                f.write_text(dump(part), encoding='utf-8')
                files.append(f)
                print(f'저장 {f.relative_to(ROOT)} ({len(part):,}계기, {f.stat().st_size / 1e6:.1f}MB)')
            elif f.exists():
                f.unlink()          # 이번 판에 없는 지사 — 옛 파일이 남으면 지도가 지난 행을 보여 준다
    r = subprocess.run([sys.executable, str(ROOT / 'scripts/validate_bdju.py')] + [str(f) for f in files])
    if r.returncode:
        for f in files:
            f.unlink()
        sys.exit('★validate_bdju 실패 — 산출물을 지웠다')
    # 좌표 구 게이트(역지오코딩) — 좌표가 주소의 구 안에 있어야 한다. 캐시가 있어 두 번째부터는 호출이 거의 없다.
    r = subprocess.run([sys.executable, str(ROOT / 'scripts/check_geo_gu.py'), '--reverse'] + [str(f) for f in files])
    if r.returncode:
        for f in files:
            f.unlink()
        sys.exit('★좌표 구 게이트 실패 — 산출물을 지웠다')

if __name__ == '__main__':
    main()
