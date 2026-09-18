#!/usr/bin/env python3
"""25년 미청구 대상 8,994 -> 아미맵 데이터셋 (PM 발주 2026-09-18)

발주서: research/발주_미청구_리스트업_20260918.md

산출
  data/michunggu-data.json     주소 보유 7,366 — 지도용(좌표 있음)
  data/michunggu-pending.json  주소 결손 1,628 — 주 과장 회신 오면 승격

값 출처 = research/미청구_보강_보정_20260918.json (계기키 오염 무효화한 보정판)
  ★awms 회수분(917건)은 **쓰지 않는다** — 발주서가 보정판을 출처로 못박았고
    주소 보유 7,366 / 결손 1,628 도 awms 를 뺀 기준선 수치다.
    awms 를 얹으면 7,366 -> 8,283 이 되므로, 쓸지 말지는 PM 판단이다.

★변대주 필드는 **의미로** 매핑한다 [[bdju_field_meaning_flipped]] —
  아미맵의 `변대주` 는 **전주 이름**('서강간 5')이고 `DCUID` 가 ID 다.
  보정판의 `변대주명` -> `변대주`, `DCU_ID` -> `DCUID`.
  `변대주번호`(8자 코드)는 아미맵에 대응 칸이 없지만 **버리지 않고** 별도 칸으로 남긴다.
★계기번호는 원문 보존 [[meter_no_prefix_preserve]].
★좌표가 실패해도 레코드를 버리지 않는다 — 동 중심(approximate)으로 넣는다.
"""
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))

BOOST = ROOT / 'research/미청구_보강_보정_20260918.json'
PM_LIST = Path('/Users/woodelight/Projects/ami-work/research/미청구_최종대상_계기목록_20260918.txt')
OUT_MAP = ROOT / 'data/michunggu-data.json'
OUT_PEND = ROOT / 'data/michunggu-pending.json'

_s = importlib.util.spec_from_file_location(
    'bld', str(ROOT / 'scripts/build_michunggu_boost_20260918.py'))
B = importlib.util.module_from_spec(_s)
_s.loader.exec_module(B)
nm = B.norm_meter

# 합동 빌더의 좌표 파이프라인을 그대로 쓴다(같은 캐시를 공유해 재조회를 아낀다)
_h = importlib.util.spec_from_file_location(
    'hap', str(ROOT / 'scripts/build_hapdong_data.py'))
H = importlib.util.module_from_spec(_h)
_h.loader.exec_module(H)

_r2 = importlib.util.spec_from_file_location(
    'rc2', str(ROOT / 'scripts/미청구-필터역산-재현-20260917.py'))
_R2 = importlib.util.module_from_spec(_r2)
_r2.loader.exec_module(_R2)
H_LOAD = _R2.load_sheet


# ─── 주소 정리 ───────────────────────────────────────────────────────────────
# ★원장 주소에는 '우선_0611_' 같은 **작업 태그**가 앞에 붙어 온다. 주소의 일부가 아니다.
#   떼지 않으면 지오코더가 통째로 못 읽어 좌표가 실패한다(실측 9건 중 8건이 이것이었다).
#   뗀 값은 `주소` 에 넣고, 원문은 `주소_원문` 에 남겨 버리지 않는다.
TAG_RE = re.compile(r'^[가-힣]*_?\d{3,}_\s*')


def clean_addr(a):
    return TAG_RE.sub('', str(a or '')).strip()


GU_RE = re.compile(r'(서울특별시\s*[가-힣]+구)')


def gu_of(a):
    m = GU_RE.search(str(a or ''))
    return m.group(1) if m else ''


# ─── 현장 필드 보강 (PM 발주 2026-09-18) ────────────────────────────────────
# ★매칭키는 **고객번호 · 모뎀MAC** 만 쓴다. 계기번호 단독 교차매칭은 금지다 —
#   계기가 재사용돼 같은 번호가 딴 개소에 살아 있어 오염이 17~51% 다(실측).
# ★원장 필드는 예외다. '그 계기의 미청구 원장 행'에서 가져오므로 **교차매칭이 아니라
#   같은 레코드의 다른 칸**을 읽는 것이다(우리 8,994 가 바로 그 행들에서 나왔다).
# ★modem_work 는 쓰지 않는다 — 26년 시공분이고, 그 계기들은 애초에 대상에서 뺐다.
# ★못 채운 것은 빈칸으로 둔다. 추정으로 메우지 않는다.
LEDGER_EXTRA = {
    'N': '계기번호', 'O': '상태', 'R': 'MAC', 'AS': '고객번호',
    'S': '시설형태', 'T': 'M/S', 'U': '집단', 'V': '485타입', 'W': '케이블',
    'X': '커넥터', 'Y': '신호레벨', 'AF': '시공자', 'AG': '추가계기',
    'AI': '비고1', 'AJ': '비고2', 'AK': '앱변대주', 'D': '시공일',
}
# ★AH(지도구분)은 넣지 않는다 — 원장 287,860행 전체에서 **값이 0건**인 빈 열이다(실측).
#   Y(신호레벨)는 요청 항목이라 칸은 두되, 원장 전체에 6건뿐이고 미청구에는 0건이다.
LEDGER_FIELDS = ['시설형태', 'M/S', '집단', '485타입', '케이블', '커넥터', '신호레벨',
                 '시공자', '추가계기', '비고1', '비고2', '앱변대주']
# boranggi 에서 고객번호(또는 MAC)로 끌어오는 것. 값마다 <필드>출처 를 따로 남긴다.
BORANGGI_FIELDS = ['인입주', '공동주택명', '상호', '계약종별', 'DCU장애여부', '검침방법']
DCU_FIELDS = ['DCU회선상태', 'DCU장애여부_대장']


def blank(v):
    s = str(v if v is not None else '').strip()
    return '' if s.upper() in ('', '0', 'NAN', 'NONE', '#N/A', 'NAT') else s


def build_ledger_extra():
    """계기 -> 원장 미청구 행에서 뽑은 현장 필드. 최신 시공일 행의 값을 우선한다."""
    L = H_LOAD(str(B.XL), 'xl/worksheets/sheet1.xml', LEDGER_EXTRA, '원장(현장필드)')
    mc = L[L['상태'] == '미청구']
    per = {}
    for r in sorted(mc.to_dict('records'), key=lambda x: str(x.get('시공일') or ''), reverse=True):
        m = nm(r.get('계기번호'))
        if not m:
            continue
        d = per.setdefault(m, {})
        for f in LEDGER_FIELDS:
            if not d.get(f):
                v = blank(r.get(f))
                if v:
                    d[f] = v
    return per


def build_boranggi_index():
    """고객번호 -> boranggi 현장 필드. 신선한 판부터 넣어 먼저 넣은 값이 이긴다.
    MAC 색인도 같이 만든다(고객번호가 없는 건의 보조키)."""
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    c = con.cursor()
    by_cust, by_mac = {}, {}
    snaps = [r[0] for r in c.execute(
        'SELECT DISTINCT snapshot FROM boranggi ORDER BY snapshot DESC')]
    for sn in snaps:
        for (cust, ipju, apt, sangho, cls, dcufault, chim, chim2, mac, mac2) in c.execute(
                'SELECT 고객번호,인입주,공동주택명,상호명,계약종별,"DCU 장애여부",'
                '검침방법,검침방법_2,"모뎀 MAC","모뎀 MAC_2" FROM boranggi WHERE snapshot=?', (sn,)):
            rec = {'인입주': blank(ipju), '공동주택명': blank(apt), '상호': blank(sangho),
                   '계약종별': blank(cls), 'DCU장애여부': blank(dcufault),
                   '검침방법': blank(chim2) or blank(chim)}
            rec = {k: v for k, v in rec.items() if v}
            if not rec:
                continue
            src = f'boranggi:{sn}'
            cu = B.norm_cust(cust)
            if cu and cu not in by_cust:
                by_cust[cu] = (rec, src)
            for mm in (B.norm_mac(mac2), B.norm_mac(mac)):
                if mm and mm not in by_mac:
                    by_mac[mm] = (rec, src)
    dcu_no, dcu_id = {}, {}
    for did, no, line, fault in c.execute(
            'SELECT "DCU ID",변대주번호,회선상태,장애여부 FROM dcu_all'):
        rec = {'DCU회선상태': blank(line), 'DCU장애여부_대장': blank(fault)}
        n8 = B.norm_bdju_no(no)
        d10 = B.norm_dcuid(did)
        if n8 and n8 not in dcu_no:
            dcu_no[n8] = rec
        if d10 and d10 not in dcu_id:
            dcu_id[d10] = rec
    con.close()
    log(f'boranggi 색인 고객번호 {len(by_cust):,} · MAC {len(by_mac):,}'
        f' · dcu_all 변대주 {len(dcu_no):,}')
    return by_cust, by_mac, dcu_no, dcu_id


# ─── 전수 재보강 (PM 발주 2026-09-18) ────────────────────────────────────────
# 왜: 1차 보강은 boranggi 를 **고객번호가 있는 건에만** 걸었고, 필드도 빈 칸 위주로만 봤다.
#     그래서 원장 주소를 가진 5,899건이 오히려 부실했다(인입주 55% vs 고객번호로 찾아온
#     824건은 93%). **주소가 있다고 다른 리스트를 안 본 것**이 원인이다.
# 규칙(영준님)
#   ① 키는 고객번호 우선 -> 모뎀MAC 보조. **계기번호 단독 금지**(재사용 오염 17~51%)
#   ② 빈 칸만 채운다. 값이 있으면 덮지 않는다(원장 값 우선)
#   ③ 값이 있는데 소스가 **다른 값**을 주면 덮지 말고 <필드>_대안 에 따로 남긴다
#   ④ 보강현황은 판이 여럿이라 최신판부터 훑고 출처에 판 날짜를 남긴다
RESWEEP_FIELDS = ['인입주', '공동주택명', '상호', '계약종별', 'DCUID', '변대주',
                  '변대주번호', 'DCU장애여부', 'DCU회선상태', '검침방법', '도로명주소']


ROAD_RE = re.compile(r'[가-힣0-9]+(?:로|길)\d*[가-힣]*\s*\d')


def _norm_cmp(v):
    return re.sub(r'\s+', '', str(v or '')).upper()


def build_resweep_index():
    """[(출처명, by_cust, by_mac)] — 우선순위 순(먼저 온 것이 이긴다)."""
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    c = con.cursor()
    out = []

    snaps = [r[0] for r in c.execute(
        'SELECT DISTINCT snapshot FROM boranggi ORDER BY snapshot DESC')]
    for sn in snaps:
        bc, bm = {}, {}
        for (cust, ipju, apt, sangho, cls, fault, chim, chim2,
             did, did2, bdju, road, mac, mac2) in c.execute(
                'SELECT 고객번호,인입주,공동주택명,상호명,계약종별,"DCU 장애여부",'
                '검침방법,검침방법_2,"DCU ID","DCU ID_2",변대주,도로명,'
                '"모뎀 MAC","모뎀 MAC_2" FROM boranggi WHERE snapshot=?', (sn,)):
            d10 = B.norm_dcuid(did2) or B.norm_dcuid(did)
            rec = {'인입주': blank(ipju), '공동주택명': blank(apt), '상호': blank(sangho),
                   '계약종별': blank(cls), 'DCU장애여부': blank(fault),
                   '검침방법': blank(chim2) or blank(chim),
                   'DCUID': d10, '변대주': blank(bdju),
                   '변대주번호': d10[:8] if d10 else '', '도로명주소': blank(road)}
            rec = {k: v for k, v in rec.items() if v}
            if not rec:
                continue
            cu = B.norm_cust(cust)
            if cu:
                bc.setdefault(cu, rec)
            for mm in (B.norm_mac(mac2), B.norm_mac(mac)):
                if mm:
                    bm.setdefault(mm, rec)
        out.append((f'boranggi:{sn}', bc, bm))

    # site-data(실효) — 같은 스키마 계열이라 필드가 그대로 맞는다
    sc, sm = {}, {}
    sd = ROOT / 'data/site-data.json'
    if sd.exists():
        for x in json.loads(sd.read_text()):
            rec = {'인입주': blank(x.get('인입주')), '공동주택명': blank(x.get('공동주택명')),
                   '상호': blank(x.get('상호')), '계약종별': blank(x.get('계약종별')),
                   'DCUID': B.norm_dcuid(x.get('DCUID')), '변대주': blank(x.get('변대주')),
                   'DCU장애여부': blank(x.get('DCU장애여부')),
                   'DCU회선상태': blank(x.get('DCU회선상태')),
                   '검침방법': blank(x.get('검침방법')),
                   '도로명주소': blank(x.get('도로명주소'))}
            if rec['DCUID']:
                rec['변대주번호'] = rec['DCUID'][:8]
            rec = {k: v for k, v in rec.items() if v}
            if not rec:
                continue
            cu = B.norm_cust(x.get('고객번호'))
            if cu:
                sc.setdefault(cu, rec)
            mm = B.norm_mac(x.get('모뎀MAC'))
            if mm:
                sm.setdefault(mm, rec)
        out.append(('site-data', sc, sm))

    # jongno_jungong — 계약번호=고객번호. 주소만 있고 MAC 은 없다
    jc = {}
    for cust, addr in c.execute('SELECT 계약번호,주소 FROM jongno_jungong'):
        cu = B.norm_cust(cust)
        a = blank(addr)
        if cu and a:
            jc.setdefault(cu, {'도로명주소': a} if ROAD_RE.search(a) else {})
    jc = {k: v for k, v in jc.items() if v}
    out.append(('jongno_jungong', jc, {}))

    con.close()
    log('재보강 색인: ' + ' · '.join(
        f'{n}(고객 {len(a):,}/MAC {len(b):,})' for n, a, b in out))
    return out


def build_dcu_index():
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    by_no, by_id = {}, {}
    for did, no, nmz, line, fault in con.execute(
            'SELECT "DCU ID",변대주번호,변대주명,회선상태,장애여부 FROM dcu_all'):
        d10, n8 = B.norm_dcuid(did), B.norm_bdju_no(no)
        rec = {'DCUID': d10, '변대주번호': n8, '변대주': blank(nmz),
               'DCU회선상태': blank(line), 'DCU장애여부': blank(fault)}
        rec = {k: v for k, v in rec.items() if v}
        if n8:
            by_no.setdefault(n8, rec)
        if d10:
            by_id.setdefault(d10, rec)
    con.close()
    return by_no, by_id


def resweep(rows, idx, dcu_no, dcu_id):
    """전수 재보강. 반환 = (채운 건수 Counter, 대안 건수 Counter)"""
    filled, alt = Counter(), Counter()
    for x in rows:
        cu, mac = B.norm_cust(x.get('고객번호')), B.norm_mac(x.get('모뎀MAC'))
        for src, by_cust, by_mac in idx:
            rec, how = None, ''
            if cu and cu in by_cust:
                rec, how = by_cust[cu], '고객번호'
            elif mac and mac in by_mac:
                rec, how = by_mac[mac], 'MAC'
            if not rec:
                continue
            for f in RESWEEP_FIELDS:
                v = rec.get(f)
                if not v:
                    continue
                cur = x.get(f) or ''
                if not cur:
                    x[f] = v
                    x[f + '출처'] = f'{src}/{how}'
                    filled[f] += 1
                elif _norm_cmp(cur) != _norm_cmp(v) and not x.get(f + '_대안'):
                    # ★덮지 않는다. 다른 값이 있다는 사실만 남긴다(판정은 나중에)
                    x[f + '_대안'] = v
                    x[f + '_대안출처'] = f'{src}/{how}'
                    alt[f] += 1
        # dcu_all — 변대주번호/DCUID 로 (계기번호 안 쓴다)
        d = dcu_no.get(x.get('변대주번호') or '') or dcu_id.get(x.get('DCUID') or '')
        dsrc = ('dcu_all/변대주번호' if dcu_no.get(x.get('변대주번호') or '')
                else ('dcu_all/DCUID' if dcu_id.get(x.get('DCUID') or '') else ''))
        if d:
            for f in ('DCUID', '변대주번호', '변대주', 'DCU회선상태', 'DCU장애여부'):
                v = d.get(f)
                if not v:
                    continue
                cur = x.get(f) or ''
                if not cur:
                    x[f] = v
                    x[f + '출처'] = dsrc
                    filled[f] += 1
                elif _norm_cmp(cur) != _norm_cmp(v) and not x.get(f + '_대안'):
                    x[f + '_대안'] = v
                    x[f + '_대안출처'] = dsrc
                    alt[f] += 1
    return filled, alt


def multi_box_stats(map_rows):
    """한 주소 함체 2개 이상 — 무엇으로 갈라지나."""
    import collections as _c
    by = _c.defaultdict(list)
    for x in map_rows:
        by[x['주소']].append(x)
    multi = {a: v for a, v in by.items() if len({y['모뎀MAC'] for y in v if y['모뎀MAC']}) > 1}
    tot = sum(len(v) for v in multi.values())
    per = {}
    for f in ('공동주택명', '상호', '비고1', '비고2', '인입주'):
        per[f] = sum(len(v) for v in multi.values()
                     if len({y.get(f, '') for y in v if y.get(f)}) > 1)
    combo = sum(len(v) for v in multi.values()
                if len({(y.get('공동주택명', ''), y.get('상호', ''), y.get('비고1', ''),
                         y.get('인입주', '')) for y in v}) > 1)
    return len(multi), tot, per, combo


def log(m):
    print(m, flush=True)


def main():
    pm = [nm(x) for x in PM_LIST.read_text().split() if nm(x)]
    boost = {nm(r['계기번호']): r for r in json.loads(BOOST.read_text())}
    log(f'PM 목록 {len(pm):,} · 고유 {len(set(pm)):,}')

    tgt = []
    for m in pm:
        r = boost.get(m)
        if not r:
            log(f'★보정판에 없는 계기 {m} — 중단')
            return 1
        tgt.append(r)

    # 작업 태그를 떼고 원문을 따로 보관한다
    tagged = 0
    for r in tgt:
        for f in ('지번주소', '도로명주소'):
            c = clean_addr(r[f])
            if c != (r[f] or ''):
                r.setdefault('_원문', {})[f] = r[f]
                r[f] = c
                tagged += 1
    log(f'주소 작업태그 제거 {tagged:,}건')

    has = [r for r in tgt if r['지번주소'] or r['도로명주소']]
    pend = [r for r in tgt if not (r['지번주소'] or r['도로명주소'])]
    log(f'주소 보유 {len(has):,} · 결손 {len(pend):,}')

    # ── 현장 필드 보강 ──────────────────────────────────────────────────────
    led_extra = build_ledger_extra()
    bo_cust, bo_mac, dcu_no, dcu_id = build_boranggi_index()
    fill = Counter()

    # ── 좌표 ────────────────────────────────────────────────────────────────
    pairs = sorted({(r['지번주소'], r['도로명주소']) for r in has})
    log(f'좌표 대상 (지번,도로명) 쌍 {len(pairs):,}')
    cache = H.load_geo_cache()
    cache = H.geocode_all(pairs, cache)

    # ── 폴백: 그래도 실패한 주소는 **구 중심**으로 넣는다 ─────────────────────
    #   ★행을 버리지 않는다(발주서). 좌표정확도에 approximate 로 표시해 구분 가능하게 둔다.
    from geocode_cascade import resolve as geo_resolve
    gu_cache = {}
    fixed = 0
    for jib, road in pairs:
        k = f'{jib} {road}'
        v = cache.get(k)
        if v and v[2] and v[3]:
            continue
        gu = gu_of(jib) or gu_of(road)
        if not gu:
            continue
        if gu not in gu_cache:
            gu_cache[gu] = geo_resolve(jibun=gu, road='')
        hit = gu_cache[gu]
        if hit and hit.lat:
            cache[k] = ['approximate', gu, hit.lat, hit.lng, '구중심폴백', '', '']
            fixed += 1
    if fixed:
        log(f'구 중심 폴백 {fixed:,}건 (좌표정확도=approximate)')
    H.GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')

    def rec(r, with_coord):
        out = {
            '지사': r['지사'],
            # ★'주소' 는 아미맵의 지번 칸이다(site-data 와 같은 계열)
            '주소': r['지번주소'],
            '도로명주소': r['도로명주소'],
            '계기번호': r['계기번호'],          # 원문 보존
            '계기타입': r['계기타입'],
            '고객번호': r['고객번호'],
            '통신방식': r['통신방식'],
            # ★의미로 매핑 — 변대주=전주 '이름', DCUID=ID
            '변대주': r['변대주명'],
            '변대주번호': r['변대주번호'],
            'DCUID': r['DCU_ID'],
            '모뎀MAC': r['MAC'],
            'dcu_철거예정': '',
            '주소_원문': (r.get('_원문') or {}).get('지번주소', ''),
            '신뢰등급': r['신뢰등급']['주소'],
            '주소출처': r['주소출처'],
            '변대주출처': r['변대주출처'],
            '최종시공일': r['최종시공일'],
            '구분': r['구분'],
            '공종': r['공종'],
        }

        m = nm(r['계기번호'])
        # ① 원장 현장 필드 — 그 계기의 미청구 행에서 온다(교차매칭 아님)
        for f, v in (led_extra.get(m) or {}).items():
            out[f] = v
            fill[f] += 1
        for f in LEDGER_FIELDS:
            out.setdefault(f, '')

        # ② boranggi — 고객번호 우선, 없으면 MAC. ★계기번호로는 붙이지 않는다
        hit, src = None, ''
        if r['고객번호'] and r['고객번호'] in bo_cust:
            hit, src = bo_cust[r['고객번호']][0], bo_cust[r['고객번호']][1] + '/고객번호'
        elif r['MAC'] and r['MAC'] in bo_mac:
            hit, src = bo_mac[r['MAC']][0], bo_mac[r['MAC']][1] + '/MAC'
        for f in BORANGGI_FIELDS:
            v = (hit or {}).get(f, '')
            out[f] = v
            out[f + '출처'] = src if v else ''
            if v:
                fill[f] += 1

        # ③ dcu_all — 변대주번호 우선, 없으면 DCU ID
        dh = dcu_no.get(r['변대주번호']) or dcu_id.get(r['DCU_ID'])
        dsrc = ('dcu_all/변대주번호' if dcu_no.get(r['변대주번호'])
                else ('dcu_all/DCUID' if dcu_id.get(r['DCU_ID']) else ''))
        for f in DCU_FIELDS:
            v = (dh or {}).get(f, '')
            out[f] = v
            out[f + '출처'] = dsrc if v else ''
            if v:
                fill[f] += 1
        if with_coord:
            key = f"{r['지번주소']} {r['도로명주소']}"
            v = cache.get(key)
            if v and v[2] and v[3]:
                out['lat'], out['lng'] = v[2], v[3]
                out['좌표정확도'] = v[0]
                if v[5]:
                    out['도로명주소'] = out['도로명주소'] or v[5]
                if v[6]:
                    out['주소'] = out['주소'] or v[6]
            else:
                # ★행을 버리지 않는다. 좌표만 비우고 표시한다(지도에서 걸러 보게)
                out['lat'] = out['lng'] = None
                out['좌표정확도'] = 'fail'
        return out

    map_rows = [rec(r, True) for r in has]
    pend_rows = [rec(r, False) for r in pend]

    acc = Counter(x['좌표정확도'] for x in map_rows)
    log(f'좌표: {dict(acc)}')

    allrows = map_rows + pend_rows
    n_all = len(allrows)

    # ── 전수 재보강 ─────────────────────────────────────────────────────────
    MEASURE = LEDGER_FIELDS + BORANGGI_FIELDS + ['DCU회선상태', 'DCUID', '변대주', '변대주번호',
                                                '도로명주소']
    before = {f: sum(1 for x in allrows if x.get(f)) for f in MEASURE}
    b_multi, b_tot, b_per, b_combo = multi_box_stats(map_rows)

    idx = build_resweep_index()
    dcu_no, dcu_id = build_dcu_index()
    filled, alt = resweep(allrows, idx, dcu_no, dcu_id)
    after = {f: sum(1 for x in allrows if x.get(f)) for f in MEASURE}
    a_multi, a_tot, a_per, a_combo = multi_box_stats(map_rows)

    log(f'\n=== 필드 채움률 before/after (전체 {n_all:,}) ===')
    log(f'{"필드":14s} {"before":>8s} {"after":>8s} {"증가":>7s}   after%   대안')
    for f in MEASURE:
        d = after[f] - before[f]
        log(f'{f:14s} {before[f]:8,} {after[f]:8,} {d:+7,}   {after[f]/n_all*100:5.1f}%'
            f'   {alt.get(f, 0):,}')
    log(f'\n재보강으로 채운 값 {sum(filled.values()):,}개 · '
        f'원장과 다른 값 발견 {sum(alt.values()):,}개(덮지 않고 <필드>_대안 에 남겼다)')

    log(f'\n=== 한 주소 함체 2개 이상 — 주소 {a_multi:,} · 계기 {a_tot:,} ===')
    log(f'{"필드":12s} {"before":>8s} {"after":>8s}')
    for f in b_per:
        log(f'{f:12s} {b_per[f]:8,} {a_per[f]:8,}')
    log(f'{"네 필드 조합":12s} {b_combo:8,} {a_combo:8,}')
    log(f'★못 가르는 계기 {b_tot - b_combo:,} -> {a_tot - a_combo:,}'
        f' ({(b_tot-b_combo)-(a_tot-a_combo):+,})')

    OUT_MAP.write_text(json.dumps(map_rows, ensure_ascii=False, indent=1))
    OUT_PEND.write_text(json.dumps(pend_rows, ensure_ascii=False, indent=1))
    log(f'저장 {OUT_MAP}  {len(map_rows):,}건')
    log(f'저장 {OUT_PEND}  {len(pend_rows):,}건')

    # ── 검증 게이트 ─────────────────────────────────────────────────────────
    log('\n=== 검증 게이트 ===')
    src = set(pm)
    got = {nm(x['계기번호']) for x in map_rows} | {nm(x['계기번호']) for x in pend_rows}
    alpha_src = sum(1 for x in src if re.search(r'[A-Za-z]', x))
    alpha_out = sum(1 for x in map_rows + pend_rows
                    if re.search(r'[A-Za-z]', str(x['계기번호'])))
    dup = len(map_rows) + len(pend_rows) - len(got)
    nullc = sum(1 for x in map_rows if x['lat'] is None or x['lng'] is None)
    checks = [
        (f'지도 {len(map_rows):,} + 대기 {len(pend_rows):,} = {len(map_rows)+len(pend_rows):,}'
         f' (기대 {len(pm):,})', len(map_rows) + len(pend_rows) == len(pm)),
        (f'계기 차집합 — 목록에만 {len(src-got)} · 산출에만 {len(got-src)}', src == got),
        (f'영문자 접두 목록 {alpha_src} · 산출 {alpha_out}', alpha_src == alpha_out),
        (f'lat/lng null {nullc}건', nullc == 0),
        (f'중복 계기번호 {dup}건', dup == 0),
    ]
    ok = True
    for msg, good in checks:
        log(f'  [{"OK" if good else "실패"}] {msg}')
        ok &= good
    log('  판정: ' + ('OK' if ok else '★게이트 불통과'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
