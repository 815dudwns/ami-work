#!/usr/bin/env python3
"""'선조치' list — KDN 보강공사 추가분 (주덕기 과장 2026-10-30 mail "보강공사 추가분 입니다").

What it is: sites that already have a modem (기시설). 한전 asked for a redo because LP failed, and
the field must file it in the app as 교체 (replacement), not 신규 (new install).

Source (main worktree inbox, gitignored):
  data/inbox_jdg_20261030/보강 대상 선조치 요청(261028)_복사본.xlsx  Sheet1
  columns: 순번 요청일 지사 계기번호 주소 비고 변대주명 LP1 LP2 완료여부 (unnamed: 'x.xx 요청완료')
  All rows go in — old requests (8/21~9/23) included. 영준님 decides later if those drop.

Output: data/seonjochi-data.json  (one record per meter; site key 주소 = 지번주소)
  js/datasets.js code 'p', category '선조치' -> status key '주소|선조치' (namespaced: these addresses
  carry old completions from other lists, a plain key would inherit them).

Enrichment — by meter number only, never guessed. A field is filled only if empty, first source wins:
  1. awms work record (ami.db modem_work_all, latest 작업일자): 모뎀MAC · 변대주번호 · DCUID · 통신방식
     and 이전시공일 · 이전작업자 · 이전작업구분 (shown in the detail so the worker knows what is there)
  2. our map lists (site-data · michunggu · michunggu-bulga · hapdong · hapdong archive):
     고객번호 · 변대주번호(/변대주전산화) · DCUID · 통신방식 · 모뎀MAC
  3. 보강현황 (ami.db boranggi, latest snapshot with a value): 고객번호 only.
     ★Its DCU/MAC columns shift between snapshots (MAC lands in 'DCU ID_2' in the 6/29 판) — not used.
  Shape gate: 고객번호 10 digits (zfill) · 변대주번호 8 · DCUID 10 · MAC 11/12 — anything else is dropped.

Gates: source vs output (meter set both ways, prefix counts, null coords) + scripts/validate_bdju.py.

    python3 scripts/build_seonjochi_data.py
"""
import json
import re
import sqlite3
import subprocess
import sys
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
MAIN = Path('/Users/woodelight/Projects/ami-work')
SRC = MAIN / 'data/inbox_jdg_20261030/보강 대상 선조치 요청(261028)_복사본.xlsx'
DB = MAIN / 'data/ami.db'
OUT = ROOT / 'data/seonjochi-data.json'
GEO_CACHE = ROOT / 'data/inbox_seonjochi/geocode-cache.json'

sys.path.insert(0, str(ROOT / 'scripts'))

TYPE_BY_CODE = {'17': 'E', '19': 'EA', '25': 'G', '26': 'G', '27': 'G',
                '45': 'G', '46': 'G', '47': 'G', '53': 'Amigo', '55': 'Amigo'}
JISA_FIX = {'직할': '서울본부직할'}
METER_RE = re.compile(r'^[0-9A-Z]{2}[0-9]{9}$')
OUR_LISTS = ['site-data', 'michunggu-data', 'michunggu-bulga-data', 'hapdong-data',
             'hapdong-data-archive']
DONG = r'(?P<dong>\S+?[동가리])'
NUM = r'(?P<num>(?:산\s*)?\d+(?:-\d+)?)(?:번지)?'


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
    if s.isdigit() and len(s) <= 10:
        return s.zfill(10)
    return ''


def shape(field, v):
    v = ws(v).replace(' ', '').upper()
    if not v or v in ('#N/A', 'NONE', '-'):
        return ''
    if field == '변대주번호':
        return v if len(v) == 8 else ''
    if field == 'DCUID':
        return v if len(v) == 10 else ''
    if field == '모뎀MAC':
        return v if len(v) in (11, 12) else ''
    if field == '고객번호':
        return norm_cust(v)
    return v


def parse_addr(raw):
    """'도봉구 도봉로162길 29-7 (도봉동 625-41 옥탑방)' -> (지번, 도로명, 동호수).

    지번 = '서울특별시 <구> <동> <번지>'. 도로명 = '서울특별시 <구> <도로명 건물번호>' (없으면 '').
    동호수 = 괄호 안 번지 뒤 + 괄호 밖 뒤쪽 글(층·상호·설비 설명). 못 읽으면 None.
    """
    a = ws(raw)
    gu = a.split(' ')[0]
    if not gu.endswith('구'):
        return None
    m = re.match(rf'^(?P<road>.+?)\s*\(\s*{DONG}\s+{NUM}\s*(?P<in>[^)]*)\)\s*(?P<out>.*)$', a)
    if m:
        jibun = f"서울특별시 {gu} {m.group('dong')} {re.sub(r'\s+', '', m.group('num'))}"
        road = f"서울특별시 {m.group('road')}"
        extra = ' '.join(x for x in (ws(m.group('in')), ws(m.group('out')).lstrip('/ ').strip()) if x)
        return jibun, road, extra
    m = re.match(rf'^\S+구\s+{DONG}\s+{NUM}\s*(?P<out>.*)$', a)
    if m:
        jibun = f"서울특별시 {gu} {m.group('dong')} {re.sub(r'\s+', '', m.group('num'))}"
        return jibun, '', ws(m.group('out')).lstrip('/ ').strip()
    return None


def load_source():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws_ = wb['Sheet1']
    rows = list(ws_.iter_rows(values_only=True))
    head = [ws(h) if h is not None else '' for h in rows[0]]
    out = []
    for r in rows[1:]:
        if all(v is None for v in r):
            continue
        d = dict(zip(head, r))
        d['_요청상태'] = clean(r[len(head) - 1]) if head[-1] == '' else ''
        out.append(d)
    return head, out


def enrich(out):
    by_m = {x['계기번호']: x for x in out}
    ms = list(by_m)
    ph = ','.join('?' * len(ms))
    hits = Counter()
    c = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)

    # 1. awms work record — latest 작업일자 per meter
    q = (f'select 계기번호_norm, 작업일자, 작업자1, 작업구분, 기술타입, mac_norm, 변대주번호, DCUID '
         f'from modem_work_all where 계기번호_norm in ({ph}) order by 작업일자')
    last = {}
    for row in c.execute(q, ms):
        last[row[0]] = row
    for m, (_, day, who, kind, tech, mac, bd, dcu) in last.items():
        x = by_m[m]
        x['이전시공일'] = ws(day)[:10]
        x['이전작업자'] = ws(who)
        x['이전작업구분'] = ws(kind)
        for f, v in (('모뎀MAC', mac), ('변대주번호', bd), ('DCUID', dcu), ('통신방식', tech)):
            v = shape(f, v)
            if v and not x.get(f):
                x[f] = v
                x['보강출처'].append(f'{f}:awms')
        hits['awms 시공기록'] += 1

    # 2. our map lists
    for name in OUR_LISTS:
        p = ROOT / f'data/{name}.json'
        if not p.exists():
            continue
        n = 0
        for r in json.loads(p.read_text(encoding='utf-8')):
            x = by_m.get(r.get('계기번호'))
            if not x:
                continue
            n += 1
            pairs = (('고객번호', r.get('고객번호')),
                     ('변대주번호', r.get('변대주번호') or r.get('변대주전산화')),
                     ('DCUID', r.get('DCUID')), ('통신방식', r.get('통신방식')),
                     ('모뎀MAC', r.get('모뎀MAC')))
            for f, v in pairs:
                v = shape(f, v)
                if v and not x.get(f):
                    x[f] = v
                    x['보강출처'].append(f'{f}:{name}')
        hits[name] = n

    # 3. 보강현황 — 고객번호 only (latest snapshot that has one)
    q = (f'select 계기번호_norm, 고객번호 from boranggi where 계기번호_norm in ({ph}) '
         f'and 고객번호 is not null order by snapshot')
    cust = {}
    for m, v in c.execute(q, ms):
        if shape('고객번호', v):
            cust[m] = shape('고객번호', v)
    for m, v in cust.items():
        x = by_m[m]
        if not x.get('고객번호'):
            x['고객번호'] = v
            x['보강출처'].append('고객번호:보강현황')
    hits['보강현황(고객번호)'] = len(cust)
    return hits


def main():
    head, src = load_source()
    out = []
    bad_addr = []
    for r in src:
        m = norm_meter(r.get('계기번호'))
        p = parse_addr(r.get('주소'))
        if not p:
            bad_addr.append((m, r.get('주소')))
            continue
        jibun, road, extra = p
        req = r.get('요청일')
        req = req.strftime('%Y-%m-%d') if hasattr(req, 'strftime') else ws(req)
        jisa = ws(r.get('지사'))
        out.append({
            '지사': JISA_FIX.get(jisa, jisa),
            '주소': jibun, '지번주소': jibun, '도로명주소': road, '동호수': extra,
            '주소_원문': ws(r.get('주소')),
            '계기번호': m, '계기타입': TYPE_BY_CODE.get(m[2:4], ''),
            '고객번호': '', '변대주': clean(r.get('변대주명')), '변대주번호': '', 'DCUID': '',
            '통신방식': '', '모뎀MAC': '',
            '순번': ws(r.get('순번')), '요청일': req, '요청상태': r['_요청상태'],
            '비고': ws(r.get('비고')), 'LP1': clean(r.get('LP1')), 'LP2': clean(r.get('LP2')),
            '완료여부': clean(r.get('완료여부')),
            '보강출처': [],
        })
    if bad_addr:
        sys.exit(f'★주소를 못 읽은 행 {bad_addr} — parse_addr 를 고치고 다시 돌려라(행을 버리지 않는다)')

    hits = enrich(out)

    # ── 좌표 ──
    from geocode_cascade import resolve
    GEO_CACHE.parent.mkdir(parents=True, exist_ok=True)
    cache = json.loads(GEO_CACHE.read_text(encoding='utf-8')) if GEO_CACHE.exists() else {}
    sites = {}
    for x in out:
        if not sites.get(x['주소']):
            sites[x['주소']] = x['도로명주소']
    for a, road in sites.items():
        if a in cache:
            continue
        h = resolve(jibun=a, road=road)
        cache[a] = {'acc': h.accuracy, 'lat': h.lat, 'lng': h.lng, 'method': h.method,
                    'road': h.road or '', 'jibun': h.jibun or ''}
    GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')
    for x in out:
        g = cache[x['주소']]
        x['lat'], x['lng'] = g['lat'], g['lng']
        x['좌표정확도'] = 'exact' if g['acc'] == 'exact' else 'approximate'
        x['보강출처'] = ' · '.join(x['보강출처'])

    # ── 원본 대조 ──
    src_m = [norm_meter(r.get('계기번호')) for r in src]
    out_m = [x['계기번호'] for x in out]
    pre = lambda S: Counter(m[:2] for m in S if not m.isdigit())
    print(f'대조: 원본 {len(src_m)} · 출력 {len(out_m)} · 원본-출력 {len(set(src_m) - set(out_m))}'
          f' · 출력-원본 {len(set(out_m) - set(src_m))} · 중복 {len(out_m) - len(set(out_m))}'
          f' · 접두 원본 {dict(pre(src_m))} 출력 {dict(pre(out_m))}'
          f' · 좌표 null {sum(1 for x in out if x["lat"] is None)}')
    if (set(src_m) != set(out_m) or len(out_m) != len(set(out_m)) or pre(src_m) != pre(out_m)
            or any(x['lat'] is None for x in out)):
        sys.exit('★원본 대조 실패 — 출력하지 않는다')

    bad_fmt = [m for m in out_m if not METER_RE.match(m)]
    print(f'계기번호 형식 위반 {len(bad_fmt)} {bad_fmt}')
    print(f'개소 {len(sites)} · 좌표(개소) {dict(Counter(cache[a]["acc"] for a in sites))}'
          f' · 계기 {dict(Counter(x["좌표정확도"] for x in out))}')
    print(f'방법(개소) {dict(Counter(cache[a]["method"] for a in sites).most_common())}')
    print(f'지사 {dict(Counter(x["지사"] for x in out).most_common())}')
    print(f'요청일 {dict(sorted(Counter(x["요청일"] for x in out).items()))}')
    print(f'계기타입 {dict(Counter(x["계기타입"] or "(빈값)" for x in out))}')
    print(f'보강 매칭(계기) {dict(hits)}')
    for f in ('고객번호', '변대주번호', 'DCUID', '통신방식', '모뎀MAC', '이전시공일'):
        print(f'  {f} 채움 {sum(1 for x in out if x.get(f))}/{len(out)}')

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'저장 {OUT} ({len(out)}계기)')
    r = subprocess.run([sys.executable, str(ROOT / 'scripts/validate_bdju.py'), str(OUT)])
    if r.returncode:
        OUT.unlink()
        sys.exit('★validate_bdju 실패 — 산출물을 지웠다')


if __name__ == '__main__':
    main()
