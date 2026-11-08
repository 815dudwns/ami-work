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

Output: data/michochi/<지사영문>.json (지사별 7개, 2026-11-08 — 지도는 고른 지사 파일만 받는다) — 계기 1행. 상태키 '주소|미조치'(네임스페이스 — 실효·합동·미청구의 옛 완료를
  물려받지 않게). js/datasets.js code 'c'.
  ★파일 서식 = 한 줄에 한 행(compact). 14만 행이라 indent 를 주면 수십 MB 가 늘어난다.
  ★값이 빈 칸은 싣지 않는다(지도·상세는 없는 필드를 빈칸으로 읽는다).

필드
  지사 · 주소(원본, 공백만 정리) · 도로명주소(지오코딩 응답 또는 같은 주소의 기존 행) · 계기번호(정리본)
  계기타입 = 번호기준타입(AE/G/아미고 — 번호 3~4자리 기준) · 계기타입_원본(리스트 열, 번호 기준과 다를 때만)
  변대주(이름 축) · 변대주번호(= 전산화 번호, 8자리일 때만 — 아니면 변대주번호_원장 에 원문)
  변대주 하위(미설치 개소) · 상 구분 · 계약종별 · 계약상태 · 대상여부 · LP수신(성공실패 'x/96', #N/A 는 빈칸)
  lat · lng(6자리) · 좌표정확도(approximate 일 때만 — 없으면 exact) · 미설치개소(=원본 '변대주 하위(미설치 개소)')
  대상여부는 '대상' 이 아닐 때만 (+ dcu_철거예정 — apply_dcu_status.py 가 붙인다)

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
CACHE = ROOT / 'data/inbox_michochi/geocode-cache.json'
# 합동 철거계기 제외 축 — 지도 합동 파일 + 아카이브만(원시 FMPMTR 수집분은 넣지 않는다)
HAPDONG_FILES = ['data/hapdong-data.json', 'data/hapdong-data-archive.json']
HAPDONG_EXCL_OUT = ROOT / 'data/reference/michochi_exclude_hapdong_removed_20261108.json'
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
    arch = archived_meters('c')
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
    d1 = set(src_m) - set(out_m) - excl_m - set(arch or ())   # 일부러 뺀 것(합동 철거·아카이브)은 빠져도 된다
    d2 = set(out_m) - set(src_m) - add_m
    nulls = sum(1 for x in out if x.get('lat') is None)
    print(f'대조: 원본 {len(src_m):,} · 실효 추가 {len(sil_add)} · 합동 철거 제외 {len(excl_m)} · 출력 {len(out_m):,}'
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
    for x in out:                       # 빈 칸은 싣지 않는다(apply_to 는 판정 없음을 '' 로 넣는다)
        for k in [k for k, v in x.items() if (v == '' or v is None) and k not in ('lat', 'lng')]:
            del x[k]
        # 통신방식_출처 는 이 리스트에선 전부 '전체DCU(변대주명)' 다(원본에 통신방식 칸이 없다) — 7만 행 3.4MB 라 뺀다.
        if x.get('통신방식_출처') == '전체DCU(변대주명)' and x.get('출처') != '실효 잔여':
            del x['통신방식_출처']

    write_split(out)


def write_split(out):
    """지사별 파일로 쓰고 게이트를 돈다. 실패하면 이번에 쓴 파일을 전부 지운다.
    ★지사 판정 = 지도 jisaOf 와 같은 함수(scripts/jisa_split.py) — 지사를 고르면 그 파일만 받는다."""
    import jisa_split as JS
    parts, cross = JS.split_rows(out)
    bad = JS.key_diff(out, parts, '미조치')
    if bad:
        sys.exit(f'★상태키 게이트 실패 — 지사 파일 하나만 읽으면 키가 바뀌는 계기 {len(bad)} {bad[:5]}')
    print(f'지사 파일 {dict((j, len(v)) for j, v in parts.items())} · 두 지사에 걸친 주소 {cross}')
    outdir = ROOT / Path(OUT_TPL).parent
    outdir.mkdir(parents=True, exist_ok=True)
    files = []
    for j, slug in JS.JISA_SLUG.items():
        f = ROOT / OUT_TPL.replace('*', slug)
        if parts.get(j):
            f.write_text(dump(parts[j]), encoding='utf-8')
            files.append(f)
            print(f'저장 {f.relative_to(ROOT)} ({len(parts[j]):,}계기, {f.stat().st_size / 1e6:.1f}MB)')
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
