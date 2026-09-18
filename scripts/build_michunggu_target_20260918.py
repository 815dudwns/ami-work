#!/usr/bin/env python3
"""25년 미청구 최종 대상 8,512계기 확정 + DB 적재 + 2분할 (PM 발주 2026-09-18)

대상 정의 (차집합, 순서 무관)
    원장 상태='미청구' 계기 13,182
  − 고압      : ★원장 **전체 287,860행** 중 그 계기에 공종='고압' 행이 하나라도 있으면 제외
                (미청구 행만 보면 635계기뿐이라 2건이 새어 8,514가 된다. 전체 기준이 8,512다)
  − 26년 시공 : modem_work snapshot 20260908 에 있는 계기
  − Sheet2    : 미청구2.xlsx Sheet2 계기 2,654
  − 우리리스트: site-data 계기번호 ∪ 합동아카이브 계기번호·**계기번호_전**
                (합동은 철거계기 열도 봐야 한다 — 재사용 계기가 그쪽에 남는다)
  = 8,512   ← PM 산출 목록과 양방향 차집합 0 으로 대조 확인

필드 값은 **보정판**(research/미청구_보강_보정_20260918.json)에서 가져온다.
보정판 = 계기번호 단독 매칭을 무효화한 판. 계기는 재사용되므로 계기키 매칭은 오염 11~18%다
(scripts/verify_michunggu_meterkey_20260918.py 실측).

산출
  data/ami.db  테이블 michunggu_target_20260918  (★심볼릭이라 main 정본에 쓰인다)
  research/미청구_대상_지도업로드_20260918.json   주소 보유 · 상태 ready
  research/미청구_대상_주소대기_20260918.json     주소 결손 · 상태 await_addr

★지도 업로드는 하지 않는다. PM 판단 후 별도 발주다.
"""
import importlib.util
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data/ami.db'
TABLE = 'michunggu_target_20260918'
BOOST = ROOT / 'research/미청구_보강_보정_20260918.json'
PM_LIST = Path('/Users/woodelight/Projects/ami-work/research/미청구_최종대상_8512_계기목록_20260918.txt')
OUT_READY = ROOT / 'research/미청구_대상_지도업로드_20260918.json'
OUT_WAIT = ROOT / 'research/미청구_대상_주소대기_20260918.json'

_s = importlib.util.spec_from_file_location('bld', str(ROOT / 'scripts/build_michunggu_boost_20260918.py'))
B = importlib.util.module_from_spec(_s)
_s.loader.exec_module(B)
_r = importlib.util.spec_from_file_location('rc', str(ROOT / 'scripts/미청구-필터역산-재현-20260917.py'))
R = importlib.util.module_from_spec(_r)
_r.loader.exec_module(R)

nm = B.norm_meter

COLUMNS = ['계기번호', '고객번호', '지사', '지번주소', '도로명주소', '변대주명', '변대주번호',
           '통신방식', 'DCU_ID', 'MAC', '공종', '구분', '계기타입', '최종시공일',
           '신뢰등급', '주소출처', '변대주출처', '상태']
INDEXES = ['계기번호', 'MAC', '고객번호', '지사', '상태']


def log(m):
    print(m, flush=True)


def build_target():
    targets, mc, L = B.load_targets()
    allm = [t['_m'] for t in targets]

    # ── 고압: 원장 전체 기준 ───────────────────────────────────────────────
    hv = {nm(m) for m, g in zip(L['계기번호'], L['공종'].astype(str)) if g == '고압'}
    hv.discard('')

    con = sqlite3.connect(DB)
    c = con.cursor()
    mw = {nm(r[0]) for r in c.execute(
        "SELECT 계기번호 FROM modem_work WHERE snapshot='20260908'")}
    mw.discard('')

    s2df = R.load_sheet(str(B.XL), 'xl/worksheets/sheet2.xml', {'N': '계기번호'}, 'Sheet2')
    s2 = {nm(x) for x in s2df['계기번호'] if nm(x)}

    ours = set()
    for x in json.loads((ROOT / 'data/site-data.json').read_text()):
        k = nm(x.get('계기번호'))
        if k:
            ours.add(k)
    for x in json.loads((ROOT / 'data/hapdong-data-archive.json').read_text()):
        for f in ('계기번호', '계기번호_전'):
            k = nm(x.get(f))
            if k:
                ours.add(k)

    log(f'\n제외 집합 — 고압 {len(hv):,} · 26년시공 {len(mw):,} · Sheet2 {len(s2):,} · 우리리스트 {len(ours):,}')
    keep = [m for m in allm if m not in hv and m not in mw and m not in s2 and m not in ours]
    log(f'최종 대상 {len(keep):,}계기')

    drop = Counter()
    for m in allm:
        if m in keep:
            continue
        drop['고압' if m in hv else '26년시공' if m in mw else
             'Sheet2' if m in s2 else '우리리스트' if m in ours else '?'] += 1
    log('  제외 내역(우선순위 순): ' + ' · '.join(f'{k} {v:,}' for k, v in drop.most_common()))
    return keep, targets


def verify_vs_pm(keep):
    if not PM_LIST.exists():
        log('★PM 목록 파일이 없다 — 대조를 건너뛴다')
        return True
    pm = {nm(x) for x in PM_LIST.read_text().split() if nm(x)}
    a, b = set(keep) - pm, pm - set(keep)
    log(f'\n=== PM 목록 대조 === PM {len(pm):,} · 내것 {len(keep):,} · 내것만 {len(a)} · PM만 {len(b)}')
    if a:
        log(f'   내것만 샘플 {sorted(a)[:5]}')
    if b:
        log(f'   PM만 샘플 {sorted(b)[:5]}')
    return not a and not b


def main():
    keep, targets = build_target()
    if not verify_vs_pm(keep):
        log('\n★PM 목록과 어긋난다 — 적재하지 않는다')
        return 1

    boost = {nm(r['계기번호']): r for r in json.loads(BOOST.read_text())}
    keepset = set(keep)

    recs = []
    for m in keep:
        r = boost.get(m)
        if not r:
            log(f'★보정판에 없는 계기 {m} — 중단')
            return 1
        has_addr = bool(r['지번주소'] or r['도로명주소'])
        recs.append({
            '계기번호': r['계기번호'],           # ★원문 보존 — 접두를 지우지 않는다
            '고객번호': r['고객번호'], '지사': r['지사'],
            '지번주소': r['지번주소'], '도로명주소': r['도로명주소'],
            '변대주명': r['변대주명'], '변대주번호': r['변대주번호'],
            '통신방식': r['통신방식'], 'DCU_ID': r['DCU_ID'], 'MAC': r['MAC'],
            '공종': r['공종'], '구분': r['구분'], '계기타입': r['계기타입'],
            '최종시공일': r['최종시공일'],
            '신뢰등급': r['신뢰등급']['주소'],
            '주소출처': r['주소출처'], '변대주출처': r['변대주출처'],
            '상태': 'ready' if has_addr else 'await_addr',
        })

    ready = [x for x in recs if x['상태'] == 'ready']
    wait = [x for x in recs if x['상태'] == 'await_addr']
    log(f'\n분할: ready(주소보유) {len(ready):,} · await_addr(주소결손) {len(wait):,}'
        f' · 합 {len(ready)+len(wait):,}')

    # ── DB 적재 ──────────────────────────────────────────────────────────────
    con = sqlite3.connect(DB)
    c = con.cursor()
    c.execute(f'DROP TABLE IF EXISTS "{TABLE}"')
    cols = ', '.join(f'"{x}" TEXT' for x in COLUMNS)
    c.execute(f'CREATE TABLE "{TABLE}" ({cols})')
    c.executemany(
        f'INSERT INTO "{TABLE}" ({", ".join(chr(34)+x+chr(34) for x in COLUMNS)}) '
        f'VALUES ({", ".join("?" * len(COLUMNS))})',
        [[x[k] for k in COLUMNS] for x in recs])
    for col in INDEXES:
        c.execute(f'CREATE INDEX IF NOT EXISTS "idx_{TABLE}_{col}" ON "{TABLE}"("{col}")')
    con.commit()
    n = c.execute(f'SELECT COUNT(*) FROM "{TABLE}"').fetchone()[0]
    st = dict(c.execute(f'SELECT 상태, COUNT(*) FROM "{TABLE}" GROUP BY 1').fetchall())
    log(f'\nDB 적재 {DB} :: {TABLE}  {n:,}행 · 상태 {st}')
    log(f'  인덱스: ' + ', '.join(f'idx_{TABLE}_{x}' for x in INDEXES))

    OUT_READY.write_text(json.dumps(ready, ensure_ascii=False, indent=1))
    OUT_WAIT.write_text(json.dumps(wait, ensure_ascii=False, indent=1))
    log(f'저장 {OUT_READY}  {len(ready):,}건')
    log(f'저장 {OUT_WAIT}  {len(wait):,}건')

    # ── 원본 대조 게이트 ─────────────────────────────────────────────────────
    out_ids = [x['계기번호'] for x in recs]
    norm_out = {nm(x) for x in out_ids}
    alpha_keep = sum(1 for x in keep if re.search(r'[A-Za-z]', x))
    alpha_out = sum(1 for x in out_ids if re.search(r'[A-Za-z]', str(x)))
    db_ids = {nm(r[0]) for r in c.execute(f'SELECT 계기번호 FROM "{TABLE}"')}
    log('\n=== 원본 대조 ===')
    log(f'  계기 집합   대상 {len(keepset):,} · 산출 {len(norm_out):,} · DB {len(db_ids):,}')
    log(f'  차집합      대상-산출 {len(keepset-norm_out)} · 산출-대상 {len(norm_out-keepset)}'
        f' · 대상-DB {len(keepset-db_ids)} · DB-대상 {len(db_ids-keepset)}')
    log(f'  접두 문자   대상 {alpha_keep} · 산출(원문) {alpha_out}')
    log(f'  ready+wait  {len(ready)+len(wait):,} == 대상 {len(keepset):,}')
    ok = (keepset == norm_out == db_ids and alpha_keep == alpha_out
          and len(ready) + len(wait) == len(keepset))
    log('  판정: ' + ('OK' if ok else '★불일치'))
    con.close()
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
