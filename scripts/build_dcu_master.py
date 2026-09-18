#!/usr/bin/env python3
"""DCU 마스터 테이블 적재 — ami.db :: dcu_master (+ dcu_master_history)

왜 (영준님 2026-09-18): "리뷰 반영한, 우리가 항상 쓸 것을 DB 로 만들어라"
  DCU 정보가 dcu_all·dcu_review·dcu_removal·dcu_removal_keep 넷으로 흩어져 있고,
  리스트(미청구·실효…)마다 상태값을 **복사해 박느라 낡았다.**
  ★리스트에는 DCUID 만 두고 상태는 **여기를 조회한다.** 복사해 넣지 마라.

원천과 우선순위
  dcu_all     19,007행 — DCU 대장 전수(지사·차수·장애여부·회선상태·IP·통신사·서버시간…)
  dcu_review     175행 — 간선망_해지_정지대상.xlsx **검토 시트**. 해지/유지 판정 + 보강대상 여부
                         + 전체 고객호수·LTE 전환호수·잔여
  dcu_removal    175 / dcu_removal_keep 11 — 위 175개를 해지/유지로 갈라 놓은 **같은 집합**이다
                         (실측: removal ⊂ review, keep ⊂ review, 합이 정확히 175).
                         따로 읽을 값이 없어 마스터에 넣지 않는다.

★철거판정 규칙
  1) dcu_review.검토 (해지|유지)            — 판정 정본
  2) 없으면 dcu_all.비고 가 해지|유지일 때   — 대장에 이미 찍혀 있는 판정
  3) 그 외                                  — '미판정'
  ※실측 2026-09-18: 1)과 2)는 175건에서 **100% 일치**하고(해지 164·유지 11),
    2)는 해지를 **119건 더** 갖고 있다. 그래서 2)까지 봐야 판정이 294건이 된다.
  ★빈값을 쓰지 않는다 — 빈값이면 '판정이 없는 것'인지 '아직 안 붙인 것'인지 구별이 안 된다.

갱신
  python3 scripts/build_dcu_master.py            # 최신 snapshot 으로 적재
  python3 scripts/build_dcu_master.py --snapshot 20260806
  같은 snapshot 재적재는 멱등(변경 0). 새 snapshot 은 값을 갱신하고 **이전 값을
  dcu_master_history 에 남긴다** — 무엇이 언제 어떻게 바뀌었는지 되짚을 수 있다.
"""
import argparse
import sqlite3
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data/ami.db'
KST = ZoneInfo('Asia/Seoul')

TABLE = 'dcu_master'
HIST = 'dcu_master_history'

COLUMNS = ['DCU_ID', '변대주번호', '변대주명', '지사', '차수', '인입망통신방식',
           '장애여부', '회선상태', 'DCU_IP', '통신사', '전체호수', 'LTE전환호수',
           '잔여호수', '성공전체계기', '철거판정', '보강대상여부', '서버시간',
           'DCU등록시간', '비고', 'src_snapshot', 'updated_at']
# 값이 바뀌었는지 볼 때 제외하는 열(메타)
META = {'src_snapshot', 'updated_at'}


def txt(v):
    s = str(v if v is not None else '').strip()
    return '' if s.lower() in ('', 'nan', 'none', '#n/a', 'nat') else s


def log(m):
    print(m, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--snapshot', default=None, help='없으면 dcu_all 최신')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    con = sqlite3.connect(DB)
    c = con.cursor()

    snaps = [r[0] for r in c.execute(
        'SELECT DISTINCT snapshot FROM dcu_all ORDER BY snapshot DESC')]
    if not snaps:
        log('★dcu_all 이 비었다')
        return 1
    snap = a.snapshot or snaps[0]
    if snap not in snaps:
        log(f'★snapshot {snap} 이 dcu_all 에 없다. 가능: {snaps}')
        return 1
    log(f'dcu_all snapshot {snap} (가능 {snaps})')

    # ── 판정 색인 ───────────────────────────────────────────────────────────
    review = {}
    rsnap = None
    for did, bno, geomto, bogang, tot, lte, rest, rs in c.execute(
            'SELECT "DCU ID",변대주번호,검토,"보강대상 여부","전체 고객호수",'
            '"LTE 전환호수",잔여,snapshot FROM dcu_review'):
        rsnap = rsnap or rs
        k = txt(did).upper()
        if k:
            review[k] = {'철거판정': txt(geomto), '보강대상여부': txt(bogang),
                         '전체호수': txt(tot), 'LTE전환호수': txt(lte), '잔여호수': txt(rest)}
    log(f'dcu_review {len(review):,}건 (snapshot {rsnap}) — '
        f'{dict(Counter(v["철거판정"] for v in review.values()))}')

    rows = c.execute(
        'SELECT "DCU ID",변대주번호,변대주명,지사,차수,"인입망 통신방식",장애여부,회선상태,'
        '"DCU IP",통신사,"성공/전체계기",서버시간,"DCU 등록시간",비고 '
        'FROM dcu_all WHERE snapshot=?', (snap,)).fetchall()
    now = datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')

    recs, seen, dup = [], set(), 0
    stat = Counter()
    for (did, bno, nmz, dept, cha, comm, fault, line, ip, telco,
         succ, stime, rtime, bigo) in rows:
        k = txt(did).upper()
        if not k:
            stat['DCU_ID 없음'] += 1
            continue
        if k in seen:
            dup += 1
            continue
        seen.add(k)
        rv = review.get(k, {})
        # ★철거판정 — review 우선, 없으면 대장 비고, 그래도 없으면 '미판정'(빈값 금지)
        verdict = rv.get('철거판정') or ''
        src = 'dcu_review'
        if not verdict:
            b = txt(bigo)
            if b in ('해지', '유지'):
                verdict, src = b, 'dcu_all.비고'
            else:
                verdict, src = '미판정', ''
        stat['철거판정:' + verdict + (f'({src})' if src else '')] += 1
        recs.append({
            'DCU_ID': k, '변대주번호': txt(bno).upper(), '변대주명': txt(nmz),
            '지사': txt(dept), '차수': txt(cha), '인입망통신방식': txt(comm),
            '장애여부': txt(fault), '회선상태': txt(line), 'DCU_IP': txt(ip),
            '통신사': txt(telco), '전체호수': rv.get('전체호수', ''),
            'LTE전환호수': rv.get('LTE전환호수', ''), '잔여호수': rv.get('잔여호수', ''),
            '성공전체계기': txt(succ), '철거판정': verdict,
            '보강대상여부': rv.get('보강대상여부', ''), '서버시간': txt(stime),
            'DCU등록시간': txt(rtime), '비고': txt(bigo),
            'src_snapshot': snap, 'updated_at': now,
        })
    if dup:
        log(f'  ★DCU_ID 중복 {dup}건 — 먼저 나온 행을 남겼다')

    # ── 기존 값 읽어 변경분 뽑기 ────────────────────────────────────────────
    exists = c.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (TABLE,)).fetchone()
    old = {}
    if exists:
        cols = [r[1] for r in c.execute(f'PRAGMA table_info("{TABLE}")')]
        for r in c.execute(f'SELECT * FROM "{TABLE}"'):
            d = dict(zip(cols, r))
            old[d['DCU_ID']] = d

    changes, added = [], 0
    for r in recs:
        o = old.get(r['DCU_ID'])
        if not o:
            added += 1
            continue
        for f in COLUMNS:
            if f in META:
                continue
            if txt(o.get(f)) != txt(r[f]):
                changes.append((r['DCU_ID'], f, txt(o.get(f)), txt(r[f]),
                                o.get('src_snapshot', ''), snap, now))
    removed = [k for k in old if k not in seen]
    log(f'\n적재 대상 {len(recs):,} · 신규 {added:,} · 값 변경 {len(changes):,}'
        f' · 사라진 DCU {len(removed):,}')
    if a.dry:
        log('--dry — 쓰지 않는다')
        for x in changes[:10]:
            log(f'   {x[0]} {x[1]}: [{x[2]}] -> [{x[3]}]')
        return 0

    # ── 쓰기 ────────────────────────────────────────────────────────────────
    c.execute(f'CREATE TABLE IF NOT EXISTS "{HIST}" ('
              'DCU_ID TEXT, 필드 TEXT, 이전값 TEXT, 새값 TEXT, '
              'snapshot_before TEXT, snapshot_after TEXT, 기록시각 TEXT)')
    if changes:
        c.executemany(f'INSERT INTO "{HIST}" VALUES (?,?,?,?,?,?,?)', changes)
        c.execute(f'CREATE INDEX IF NOT EXISTS "idx_{HIST}_dcu" ON "{HIST}"(DCU_ID)')

    c.execute(f'DROP TABLE IF EXISTS "{TABLE}"')
    c.execute(f'CREATE TABLE "{TABLE}" ({", ".join(f_(x) for x in COLUMNS)})')
    c.executemany(f'INSERT INTO "{TABLE}" VALUES ({",".join("?" * len(COLUMNS))})',
                  [[r[x] for x in COLUMNS] for r in recs])
    # ★키는 DCU_ID, 변대주번호로도 찾을 수 있게 인덱스를 따로 건다
    c.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS "idx_{TABLE}_id" ON "{TABLE}"(DCU_ID)')
    for col in ('변대주번호', '변대주명', '지사', '철거판정', '회선상태'):
        c.execute(f'CREATE INDEX IF NOT EXISTS "idx_{TABLE}_{col}" ON "{TABLE}"("{col}")')
    con.commit()

    n = c.execute(f'SELECT COUNT(*) FROM "{TABLE}"').fetchone()[0]
    hn = c.execute(f'SELECT COUNT(*) FROM "{HIST}"').fetchone()[0]
    log(f'\n{TABLE} {n:,}행 · {HIST} 누적 {hn:,}행')
    log('  철거판정: ' + str(dict(c.execute(
        f'SELECT 철거판정,COUNT(*) FROM "{TABLE}" GROUP BY 1 ORDER BY 2 DESC').fetchall())))
    log('  보강대상여부: ' + str(dict(c.execute(
        f'SELECT CASE WHEN 보강대상여부=\'\' THEN \'(없음)\' ELSE 보강대상여부 END,'
        f'COUNT(*) FROM "{TABLE}" GROUP BY 1').fetchall())))
    log('  회선상태: ' + str(dict(c.execute(
        f'SELECT 회선상태,COUNT(*) FROM "{TABLE}" GROUP BY 1 ORDER BY 2 DESC').fetchall())))
    log('  변대주번호 색인 가능: ' + str(c.execute(
        f'SELECT COUNT(DISTINCT 변대주번호) FROM "{TABLE}" WHERE 변대주번호<>\'\'').fetchone()[0]))
    con.close()
    return 0


def f_(name):
    return f'"{name}" TEXT'


if __name__ == '__main__':
    sys.exit(main())
