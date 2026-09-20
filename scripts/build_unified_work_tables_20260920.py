#!/usr/bin/env python3
"""26년 시공·불가 스냅샷 통합 (PM 발주 2026-09-20)

왜: 주덕기 과장이 보내주는 판마다 **기간이 겹친다.**
  modem_work  20260828(51,779) · 20260908(58,618) · 20260920(13,873)
    -> 0828∩0908 51,650쌍 · 0908∩0920 5,940쌍 겹침. 그냥 세면 같은 시공을 두 번 센다.
  모뎀설치불가개소 20260908(769) · 20260917(290) · 20260920(278)
    -> 0908∩0920 97쌍 겹침.

키 = **계기번호 + 작업일자**. 같은 건이 여러 판에 있으면 **최신 스냅샷 값을 채택**하고
     어디서 왔는지 `src_snapshot` · 어느 판들에 있었는지 `seen_snapshots` 를 남긴다.
  ★스냅샷을 지우지 않는다 — 원본 테이블은 그대로 두고 통합본을 따로 만든다.
    판 간 변화를 되짚어야 할 때가 있고(값이 바뀐 건), 재적재도 원본 기준이다.

산출: ami.db :: modem_work_all · bulga_work_all
"""
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data/ami.db'

SPECS = [
    {'src': 'modem_work', 'dst': 'modem_work_all',
     'idx': ('계기번호_norm', '작업일자', 'snapshot_src', '지사', '작업구분')},
    {'src': '모뎀설치불가개소', 'dst': 'bulga_work_all',
     'idx': ('계기번호_norm', '작업일자', 'snapshot_src', '지사', '불가,철거사유')},
]


def nm(v):
    s = re.sub(r'[\s\-]', '', str(v if v is not None else '')).strip()
    if not s or s.upper() in ('NAN', 'NONE', '#N/A', '0'):
        return ''
    return s.upper() if re.search(r'[A-Za-z]', s) else s.zfill(11)


def log(m=''):
    print(m, flush=True)


def unify(con, spec):
    src, dst = spec['src'], spec['dst']
    c = con.cursor()
    cols = [r[1] for r in c.execute(f'PRAGMA table_info("{src}")')]
    keep = [x for x in cols if x not in ('snapshot', 'visible', 'xl_row')]
    snaps = sorted({r[0] for r in c.execute(f'SELECT DISTINCT snapshot FROM "{src}"')})
    log(f'\n=== {src} -> {dst} · 스냅샷 {snaps}')

    # 최신 스냅샷이 이기도록 **오래된 것부터** 덮어쓴다
    merged, seen = {}, defaultdict(set)
    per_snap = Counter()
    for sn in snaps:
        rows = list(c.execute(
            f'SELECT {", ".join(chr(34)+x+chr(34) for x in keep)} FROM "{src}" WHERE snapshot=?',
            (sn,)))
        per_snap[sn] = len(rows)
        for r in rows:
            d = dict(zip(keep, r))
            k = (nm(d.get('계기번호')), str(d.get('작업일자') or '').strip())
            if not k[0]:
                continue
            d['계기번호_norm'] = k[0]
            d['snapshot_src'] = sn
            merged[k] = d
            seen[k].add(sn)
    for k, d in merged.items():
        d['seen_snapshots'] = ','.join(sorted(seen[k]))
        d['seen_count'] = str(len(seen[k]))

    out_cols = keep + ['snapshot_src', 'seen_snapshots', 'seen_count']
    out_cols = list(dict.fromkeys(out_cols))          # 중복 제거(계기번호_norm 이 keep 에 이미 있다)
    c.execute(f'DROP TABLE IF EXISTS "{dst}"')
    c.execute(f'CREATE TABLE "{dst}" ({", ".join(f_(x) for x in out_cols)})')
    c.executemany(f'INSERT INTO "{dst}" VALUES ({",".join("?" * len(out_cols))})',
                  [[d.get(x) for x in out_cols] for d in merged.values()])
    for col in spec['idx']:
        if col in out_cols:
            c.execute(f'CREATE INDEX IF NOT EXISTS "idx_{dst}_{col}"'
                      f' ON "{dst}"("{col}")')
    con.commit()

    raw = sum(per_snap.values())
    meters = {k[0] for k in merged}
    log(f'  원본 행 {raw:,} (' + ' · '.join(f'{k} {v:,}' for k, v in sorted(per_snap.items())) + ')')
    log(f'  통합 행 {len(merged):,}  (중복 제거 {raw-len(merged):,})')
    log(f'  고유 (계기,작업일) {len(merged):,} · **고유 계기 {len(meters):,}**')
    log(f'  채택 스냅샷: {dict(Counter(d["snapshot_src"] for d in merged.values()).most_common())}')
    log(f'  여러 판에 있던 건: {dict(Counter(d["seen_count"] for d in merged.values()).most_common())}')
    return meters


def f_(name):
    return f'"{name}" TEXT'


def main():
    con = sqlite3.connect(DB)
    res = {}
    for spec in SPECS:
        res[spec['dst']] = unify(con, spec)

    # 통합 전후 고유 계기수 대조
    c = con.cursor()
    log('\n=== 통합 전/후 고유 계기수 ===')
    for spec in SPECS:
        before = len({nm(r[0]) for r in c.execute(f'SELECT 계기번호 FROM "{spec["src"]}"')} - {''})
        after = len(res[spec['dst']])
        log(f'  {spec["src"]:16s} 원본 고유계기 {before:,} -> 통합 {after:,}'
            + ('  (같아야 정상)' if before == after else '  ★다르다'))
    con.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
