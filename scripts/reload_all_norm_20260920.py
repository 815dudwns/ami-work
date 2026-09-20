#!/usr/bin/env python3
"""정규화 규칙 수정에 맞춰 ami.db 전면 재적재 (PM 발주 2026-09-20)

왜: `xlsx_to_db.py` 의 옛 `norm_meter` 가 계기번호 영문 접두를 뭉갰고
    (`LA530149603` -> `00530149603`), `고객번호_norm` 은 `#N/A` 를 그대로 실었다.
    그 규칙으로 적재된 테이블이 전부 오염돼 있어 원본에서 다시 넣는다.

★행수가 줄면 그 테이블은 **실패로 보고하고 멈춘다.** 조용한 누락이 가장 위험하다.
★원본(src_file)이 남아 있는 테이블만 손댄다. 파생 테이블(dcu_master 등)은 건드리지 않는다.
★재적재 전 DB 백업은 호출자가 먼저 해 둔다(1.6GB 라 이 스크립트는 복사하지 않는다).

사용:
    python3 scripts/reload_all_norm_20260920.py --plan     # 대상만 보여준다
    python3 scripts/reload_all_norm_20260920.py            # 작은 파일부터 재적재
    python3 scripts/reload_all_norm_20260920.py --max-mb 50
"""
import argparse
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path('/Users/woodelight/Projects/ami-work')
DB = ROOT / 'data/ami.db'
LOADER = Path(__file__).resolve().parent / 'xlsx_to_db.py'
STATE = Path('/tmp/reload_norm_20260920.json')


def metrics(con):
    c = con.cursor()
    out = {}
    for t in [r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]:
        cols = [r[1] for r in c.execute(f'PRAGMA table_info("{t}")')]
        if 'src_file' not in cols:
            continue
        n = c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        pre = c.execute(
            f'SELECT COUNT(*) FROM "{t}" WHERE 계기번호_norm GLOB \'*[A-Za-z]*\''
        ).fetchone()[0] if '계기번호_norm' in cols else None
        cu = c.execute(
            f'SELECT COUNT(*) FROM "{t}" WHERE 고객번호_norm IS NOT NULL'
            f' AND LENGTH(고객번호_norm)=10').fetchone()[0] if '고객번호_norm' in cols else None
        bad = c.execute(
            f'SELECT COUNT(*) FROM "{t}" WHERE 고객번호_norm IS NOT NULL'
            f' AND LENGTH(고객번호_norm)<>10').fetchone()[0] if '고객번호_norm' in cols else None
        out[t] = {'행': n, '접두': pre, '고객번호': cu, '고객번호_비정상': bad}
    return out


def sources(con):
    c = con.cursor()
    files = {}
    for t in [r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")]:
        cols = [r[1] for r in c.execute(f'PRAGMA table_info("{t}")')]
        if 'src_file' not in cols:
            continue
        for s in [r[0] for r in c.execute(
                f'SELECT DISTINCT src_file FROM "{t}" WHERE src_file IS NOT NULL')]:
            files.setdefault(s, set()).add(t)
    ok, missing = {}, {}
    for s, ts in files.items():
        p = Path(s) if Path(s).is_absolute() else ROOT / s
        (ok if p.exists() else missing)[s] = (p, ts)
    return ok, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', action='store_true')
    ap.add_argument('--max-mb', type=float, default=None)
    a = ap.parse_args()

    con = sqlite3.connect(DB)
    before = metrics(con)
    ok, missing = sources(con)
    con.close()

    order = sorted(ok.items(), key=lambda kv: kv[1][0].stat().st_size)
    if a.max_mb:
        order = [x for x in order if x[1][0].stat().st_size <= a.max_mb * 1e6]

    print(f'재적재 대상 파일 {len(order)} / 전체 {len(ok)} · 원본 없음 {len(missing)}')
    if missing:
        for s, (p, ts) in missing.items():
            print(f'  ★원본 없음(건드리지 않음): {s} -> {sorted(ts)}')
    if a.plan:
        for s, (p, ts) in order:
            print(f'  {p.stat().st_size/1e6:8.1f}MB  {s}')
        return 0

    STATE.write_text(json.dumps(before, ensure_ascii=False, indent=1))
    failed = []
    for i, (s, (p, ts)) in enumerate(order, 1):
        mb = p.stat().st_size / 1e6
        print(f'\n[{i}/{len(order)}] {mb:.1f}MB {s}', flush=True)
        r = subprocess.run([sys.executable, str(LOADER), str(p)],
                           capture_output=True, text=True)
        tail = [x for x in r.stdout.splitlines()
                if any(k in x for k in ('적재 확인', '실패', '불일치', '정규화:'))]
        for x in tail[-6:]:
            print('   ', x.strip(), flush=True)
        if r.returncode != 0:
            print(f'   ★실패(exit {r.returncode}) — 멈춘다')
            print(r.stdout[-800:])
            print(r.stderr[-800:])
            failed.append(s)
            break

    # ── 전/후 대조 ──────────────────────────────────────────────────────────
    con = sqlite3.connect(DB)
    after = metrics(con)
    con.close()
    print('\n=== 전/후 대조 ===')
    print(f'{"테이블":34s} {"행 전→후":>20s} {"접두 전→후":>16s} {"고객번호 전→후":>18s}')
    shrunk = []
    for t in sorted(set(before) | set(after)):
        b, f = before.get(t, {}), after.get(t, {})
        bn, fn = b.get('행', 0), f.get('행', 0)
        mark = ''
        if fn < bn:
            mark = '  ★행 줄어듦'
            shrunk.append((t, bn, fn))
        pre = f'{b.get("접두")}→{f.get("접두")}' if b.get('접두') is not None else '-'
        cu = f'{b.get("고객번호")}→{f.get("고객번호")}' if b.get('고객번호') is not None else '-'
        if bn != fn or b.get('접두') != f.get('접두') or b.get('고객번호') != f.get('고객번호'):
            print(f'{t:34s} {bn:9,}→{fn:9,} {pre:>16s} {cu:>18s}{mark}')
    print()
    tot_pre_b = sum(v['접두'] or 0 for v in before.values())
    tot_pre_a = sum(v['접두'] or 0 for v in after.values())
    tot_cu_b = sum(v['고객번호'] or 0 for v in before.values())
    tot_cu_a = sum(v['고객번호'] or 0 for v in after.values())
    tot_bad_a = sum(v['고객번호_비정상'] or 0 for v in after.values())
    print(f'합계 — 계기 접두 보존 {tot_pre_b:,} -> {tot_pre_a:,} ({tot_pre_a-tot_pre_b:+,})')
    print(f'      고객번호_norm 유효 {tot_cu_b:,} -> {tot_cu_a:,} ({tot_cu_a-tot_cu_b:+,})'
          f' · 비정상 잔여 {tot_bad_a:,}')
    if shrunk:
        print('\n★행이 줄어든 테이블 — 재적재를 멈추고 보고한다')
        for t, bn, fn in shrunk:
            print(f'   {t}: {bn:,} -> {fn:,}')
        return 1
    if failed:
        print(f'\n★적재 실패 파일: {failed}')
        return 1
    print('\n판정: OK (행 감소 없음)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
