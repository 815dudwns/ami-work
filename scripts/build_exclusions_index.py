#!/usr/bin/env python3
"""제외 이력 통합 인덱스 생성 (영준님 2026-09-20 "제외된 사유 리스트 잘 관리해").

  data/exclusions.json       계기 단위 통일 스키마 (정본)
  data/exclusion_rules.json  축 정의
  ami.db :: exclusions · exclusion_rules   (사본 — SQL 로 물어볼 수 있게)

두 갈래를 합친다
  ① 빌더가 스스로 남긴 것  = data/.exclusions-stage/*.json
     (빌더를 돌릴 때마다 갱신된다. 축이 새로 생겨도 사람이 파일을 만들 필요가 없다)
  ② 빌더 **밖**에서 걸러진 축 = 여기서 원장·DB 로 재현한다
     미청구: 고압 · Sheet2 · 26년 보강시공 · 미연계 · 계기번호 오타
     불가  : 고압 · 불가사유 분류 · 중복

★한 건이 여러 축에 걸리면 **행을 나눠 전부 남긴다**(빌더는 첫 축에서 멈추지만 기록은 전부).
★검증: 축별 고유계기 + 현재 리스트 = 모집단 인가. 어긋나면 그 차이가 곧 기록이 빠진 축이다.

실행: python3 scripts/build_exclusions_index.py
"""
import importlib.util
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import exclusions as EX                                            # noqa: E402

DB = ROOT / 'data/ami.db'
# ★원장은 이 테이블이다. `25년_ami_보강공사_미청구2__sheet1`(258,394)은 **작업중 시트**라
#   상태 열이 없다 — 거기서 찾다가 모집단이 0 으로 나왔다(2026-09-20 실측).
#   상태 열은 엑셀 O열인데 헤더가 비어 있어 `col_15` 로 적재됐다.
#   상태='미청구' 고유계기 13,182 = PM 기준 모집단과 정확히 일치.
LEDGER = '20260227다운로드_2025_03_24에서2026_0'
LEDGER_STATE = 'col_15'
SHEET2 = '25년_ami_보강공사_미청구2__sheet2'
BULGA = '25년_보강_불가__sheet1'

_s = importlib.util.spec_from_file_location(
    'bld', str(ROOT / 'scripts/build_michunggu_boost_20260918.py'))
B = importlib.util.module_from_spec(_s)
_s.loader.exec_module(B)
nm = B.norm_meter


def log(m=''):
    print(m, flush=True)


def cols(c, t):
    return [r[1] for r in c.execute(f'PRAGMA table_info("{t}")')]


def fetch(c, t, want):
    """원장 한 번만 읽어 필요한 열만 dict 로. 열 이름이 판마다 달라 유연하게 찾는다."""
    have = cols(c, t)
    sel = {k: v for k, v in want.items() if v in have}
    q = 'SELECT ' + ','.join(f'"{v}"' for v in sel.values()) + f' FROM "{t}"'
    keys = list(sel)
    for row in c.execute(q):
        yield dict(zip(keys, row))


# ─────────────────────────────────────────────────────────────────────────────
def michunggu_outside(c):
    """빌더 밖 미청구 축 — 고압 · Sheet2 · 26년보강시공 · 미연계 · 계기번호오타"""
    want = {'계기번호': '계기번호', '상태': '상태', '공종': '공종', '고객번호': '고객번호',
            '지사': '2차사업소', '주소': '주소', '계기타입': '계기타입', '시공일': '시공일'}
    want['상태'] = LEDGER_STATE
    per, hv_all = {}, set()
    for r in fetch(c, LEDGER, want):
        m = nm(r.get('계기번호'))
        if not m:
            continue
        # ★고압 판정은 **계기 단위**다 — 그 계기의 **어느 행에든** 공종=고압이 있으면 고압이다.
        #   미청구 행만 보면 놓친다: 한 계기가 고압(불가) 행 + 미청구 행을 함께 갖는 경우가 있다
        #   (실측 2건 — 29450242649 봉익동 · 74450062896 중곡동. 원장에 4행씩 있다).
        #   이 2건 때문에 재현이 635 로 나와 PM 표 637 과 어긋났다.
        if str(r.get('공종') or '').strip() == '고압':
            hv_all.add(m)
        if str(r.get('상태') or '').strip() != '미청구':
            continue
        if m in per:
            continue
        per[m] = {'계기번호': str(r.get('계기번호') or '').strip(),
                  '고객번호': B.norm_cust(r.get('고객번호')) or '',
                  '지사': r.get('지사') or '', '주소': r.get('주소') or '',
                  '계기타입': r.get('계기타입') or '', '최종시공일': r.get('시공일') or ''}
    log(f'모집단 — 원장 상태=미청구 고유계기 {len(per):,}')

    out = []
    # M1 고압
    hv = [m for m in per if m in hv_all]
    out += [EX.row(EX.L_MICH, 'M1', per[m], '원장 공종=고압', '공종=고압') for m in hv]
    # M2 Sheet2
    s2 = set()
    for r in fetch(c, SHEET2, {'계기번호': '계기번호'}):
        v = nm(r.get('계기번호'))
        if v:
            s2.add(v)
    hit = [m for m in per if m in s2]
    out += [EX.row(EX.L_MICH, 'M2', per[m], 'Sheet2 에 실림 = 신규·신설 시공행 없음',
                   'sheet2') for m in hit]
    # M3 26년 보강시공 (계기번호 직접)
    aw = {}
    for m, day in c.execute('SELECT 계기번호_norm,작업일자 FROM modem_work_all'):
        if m and m not in aw:
            aw[m] = str(day or '')
    lo, hi = '2026-06-08', '2026-09-18'
    def in_win(d):
        d = d.replace('/', '-')[:10]
        return bool(d) and lo <= d <= hi
    hit3 = [m for m in per if m in aw and in_win(aw[m])]
    out += [EX.row(EX.L_MICH, 'M3', per[m], '26년 자재로 이미 시공',
                   f'awms 작업일 {aw[m][:10]}') for m in hit3]
    # M4 미연계
    mi = set()
    for r in fetch(c, '미연계', {'계기번호': '계기번호'}):
        v = nm(r.get('계기번호'))
        if v:
            mi.add(v)
    hit4 = [m for m in per if m in mi]
    out += [EX.row(EX.L_MICH, 'M4', per[m], '과장 9/20 미연계 시트', '미연계') for m in hit4]
    # M5 계기번호 오타
    _d = importlib.util.spec_from_file_location(
        'ds', str(ROOT / 'scripts/build_michunggu_dataset_20260918.py'))
    D = importlib.util.module_from_spec(_d)
    _d.loader.exec_module(D)
    for k, why in D.METER_TYPO_EXCLUDE.items():
        m = nm(k)
        rec = per.get(m) or {'계기번호': k}
        out.append(EX.row(EX.L_MICH, 'M5', rec, why, k))
    log(f'  M1 고압 {len(hv):,} · M2 Sheet2 {len(hit):,} · M3 26년시공 {len(hit3):,}'
        f' · M4 미연계 {len(hit4):,} · M5 오타 {len(D.METER_TYPO_EXCLUDE)}')
    return per, out


def bulga_outside(c):
    """빌더 밖 불가 축 — 고압 · 불가사유 분류 · 중복"""
    want = {'계기번호': '계기번호', '공종': '공종', '고객번호': '고객번호',
            '지사': '2차사업소', '주소': '주소', '계기타입': '계기타입',
            '시공일': '시공일', '비고1': '비고1', '비고2': '비고2'}
    rows = list(fetch(c, BULGA, want))
    per, hv = {}, set()
    for r in rows:
        m = nm(r.get('계기번호'))
        if not m:
            continue
        if str(r.get('공종') or '').strip() == '고압':
            hv.add(m)
        if m in per:
            continue
        per[m] = {'계기번호': str(r.get('계기번호') or '').strip(),
                  '고객번호': B.norm_cust(r.get('고객번호')) or '',
                  '지사': r.get('지사') or '', '주소': r.get('주소') or '',
                  '계기타입': r.get('계기타입') or '', '최종시공일': r.get('시공일') or '',
                  '불가사유': str(r.get('비고1') or '').strip(),
                  '불가상세': str(r.get('비고2') or '').strip()}
    log(f'모집단 — 불가 원장 {len(rows):,}행 -> 고유계기 {len(per):,}')

    out = [EX.row(EX.L_BULGA, 'B1', per[m], '불가 원장 공종=고압', '공종=고압')
           for m in sorted(hv) if m in per]
    # B2 사유 분류
    cls = json.loads((ROOT / 'research/불가사유_분류_확정_20260920.json').read_text())
    keep = {(x['b1'], x['b2']) for x in cls if x.get('분류') == '대상'}
    drop_reason = {(x['b1'], x['b2']): x.get('제외사유', '') for x in cls}
    hit2 = [m for m, v in per.items()
            if m not in hv and (v['불가사유'], v['불가상세']) not in keep]
    out += [EX.row(EX.L_BULGA, 'B2', per[m], drop_reason.get(
        (per[m]['불가사유'], per[m]['불가상세'])) or '사유조합이 제외 분류',
        f"{per[m]['불가사유']} / {per[m]['불가상세']}") for m in hit2]
    # B3 중복
    claimed = set(hv) | set(hit2)
    dedup = {}
    for lab, q in (('awms 20260908', "SELECT 계기번호 FROM modem_work WHERE snapshot='20260908'"),
                   ('awms 20260920', "SELECT 계기번호 FROM modem_work WHERE snapshot='20260920'")):
        dedup[lab] = {nm(x[0]) for x in c.execute(q)} - {''}
    for lab, f in (('site-data', 'data/site-data.json'),
                   ('합동 아카이브', 'data/hapdong-data-archive.json')):
        p = ROOT / f
        s = set()
        if p.exists():
            for x in json.loads(p.read_text()):
                for k in ('계기번호', '계기번호_전'):
                    v = nm(x.get(k))
                    if v:
                        s.add(v)
        dedup[lab] = s
    mich = set()
    for f in ('data/michunggu-data.json', 'data/michunggu-pending.json'):
        p = ROOT / f
        if p.exists():
            mich |= {nm(x['계기번호']) for x in json.loads(p.read_text())}
    dedup['25미청구 대상'] = mich
    seen, n3 = set(claimed), Counter()
    for lab, s in dedup.items():
        hit = (set(per) & s) - seen
        seen |= hit
        n3[lab] = len(hit)
        out += [EX.row(EX.L_BULGA, 'B3', per[m], f'{lab} 와 겹침', lab) for m in hit]
    # B5 계기번호 오타 — 불가 빌더도 METER_TYPO_EXCLUDE 로 뺀다
    _b = importlib.util.spec_from_file_location(
        'bl', str(ROOT / 'scripts/build_michunggu_bulga_20260920.py'))
    BL = importlib.util.module_from_spec(_b)
    _b.loader.exec_module(BL)
    n5 = 0
    for k, why in BL.METER_TYPO_EXCLUDE.items():
        m = nm(k)
        if m in per:
            out.append(EX.row(EX.L_BULGA, 'B5', per[m], why, k))
            n5 += 1
    log(f'  B5 계기번호 오타 {n5}')
    log(f'  B1 고압 {len(hv):,} · B2 사유분류 {len(hit2):,} · B3 중복 {sum(n3.values()):,} {dict(n3)}')
    return per, out


# ─────────────────────────────────────────────────────────────────────────────
def main():
    con = sqlite3.connect(DB)
    c = con.cursor()
    log('=== 빌더 밖 축 재현 ===')
    m_pop, m_out = michunggu_outside(c)
    b_pop, b_out = bulga_outside(c)

    log('\n=== 빌더가 남긴 것 ===')
    staged = []
    for lab in (EX.L_MICH, EX.L_BULGA):
        s = EX.stage_load(lab)
        log(f'  {lab}: {len(s):,}건 · {dict(Counter(x["축코드"] for x in s).most_common())}')
        staged += s

    rows = m_out + b_out + staged
    # 같은 (계기, 축, 리스트) 중복 제거 — 재실행해도 늘지 않아야 한다
    uniq = {}
    for r in rows:
        uniq.setdefault((r['원본리스트'], r['축코드'], r['계기번호_norm']), r)
    rows = list(uniq.values())

    counts = Counter(r['축코드'] for r in rows)
    EX.write_rules()
    EX.write_index(rows, {k: f'{v:,}' for k, v in counts.items()})
    log(f'\n저장 {EX.INDEX} — {len(rows):,}행')
    log(f'저장 {EX.RULES_OUT} — 축 {len(EX.RULES)}개')

    # ── 검증 ────────────────────────────────────────────────────────────────
    log('\n=== 검증: 축별 고유계기 + 현재 리스트 = 모집단 ===')
    # ★번호 교정분 — 제외가 아니라 **번호가 바뀐 것**이다.
    #   모집단에는 오타본, 리스트에는 교정본이 있어 그냥 대조하면 양쪽에서 어긋난다
    #   (실측 2건: 3919048106A -> 39190481064 · 4719B160548 -> 47198160548).
    #   제외 인덱스에 넣으면 '빠졌다' 는 오해를 주므로, 대조할 때만 키를 맞춰 준다.
    _d2 = importlib.util.spec_from_file_location(
        'ds2', str(ROOT / 'scripts/build_michunggu_dataset_20260918.py'))
    D2 = importlib.util.module_from_spec(_d2)
    _d2.loader.exec_module(D2)
    FIX = {nm(k): nm(v[0]) for k, v in D2.METER_TYPO_FIX.items()}
    if FIX:
        log(f'번호 교정 {len(FIX)}건 — 대조 시 오타본 키를 교정본으로 맞춘다 {FIX}')

    cur = {}
    for lab, files in ((EX.L_MICH, ('data/michunggu-data.json', 'data/michunggu-pending.json')),
                       (EX.L_BULGA, ('data/michunggu-bulga-data.json',
                                     'data/michunggu-bulga-pending.json'))):
        s = set()
        for f in files:
            p = ROOT / f
            if p.exists():
                s |= {nm(x['계기번호']) for x in json.loads(p.read_text())}
        cur[lab] = s

    by_rule = defaultdict(set)
    for r in rows:
        by_rule[(r['원본리스트'], r['축코드'])].add(r['계기번호_norm'])

    ok = True
    for lab, pop in ((EX.L_MICH, set(m_pop)), (EX.L_BULGA, set(b_pop))):
        exc = set()
        log(f'\n[{lab}] 모집단 {len(pop):,}')
        for code in [r['축코드'] for r in EX.RULES]:
            s = by_rule.get((lab, code), set())
            if not s:
                continue
            fresh = s - exc
            exc |= s
            log(f'   {code} {EX.RULE_BY_CODE[code]["축이름"]:22s}'
                f' {len(s):6,}  (새로 빠진 것 {len(fresh):,})')
        if lab == EX.L_MICH and FIX:
            pop = {FIX.get(m, m) for m in pop}
        inpop = exc & pop
        log(f'   제외 고유계기 {len(exc):,} (모집단 안 {len(inpop):,} · 밖 {len(exc-pop):,})')
        log(f'   현재 리스트 {len(cur[lab]):,}')
        total = len(inpop) + len(cur[lab])
        mark = 'OK' if total == len(pop) else f'★차 {total - len(pop):+,}'
        log(f'   제외(모집단 안) + 현재 = {total:,} vs 모집단 {len(pop):,}  -> {mark}')
        if total != len(pop):
            ok = False
            miss = pop - exc - cur[lab]
            extra = cur[lab] - pop
            log(f'   ★기록이 빠진 계기 {len(miss):,}' + (f' 예 {sorted(miss)[:5]}' if miss else ''))
            log(f'   ★모집단에 없는데 리스트에 있는 계기 {len(extra):,}'
                + (f' 예 {sorted(extra)[:5]}' if extra else ''))

    dup = Counter()
    for r in rows:
        dup[(r['원본리스트'], r['계기번호_norm'])] += 1
    multi = {k: v for k, v in dup.items() if v > 1}
    log(f'\n★두 축 이상에 걸린 계기 {len(multi):,}건')
    for (lab, m), n in list(multi.items())[:8]:
        axes = [r['축코드'] for r in rows if r['원본리스트'] == lab and r['계기번호_norm'] == m]
        log(f'   {lab} {m} — {n}축 {axes}')
    con.close()
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
