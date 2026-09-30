#!/usr/bin/env python3
"""지도 리스트에 LP 판독을 붙인다 — 미청구가 '왜 없어졌나' 를 현장에서 보게 (영준님 2026-09-30)

  python3 scripts/apply_lp_read.py data/michunggu-data.json
  python3 scripts/apply_lp_read.py data/michunggu-bulga-data.json
  python3 scripts/apply_lp_read.py --all          # 두 리스트 + 주소대기분까지

넣는 필드
  `LP판독`      — 코드(dead/alive/weak/zero/drop/cut/gone/none)
  `LP판독라벨`   — 화면에 쓰는 한글 라벨
  `LP판독사유`   — 한 줄 설명
  `LP판독색`     — good/warn/bad/gray (아미맵 디테일이 색으로 쓴다)
  `마지막시공`   — 그 계기의 **가장 나중 원장 행** 요약(일자 · 통신방식 · MAC · 시공자 · 비고)

★규칙 정본 = `scripts/lp_read.py`. 리포트(gen_addr_report.py)와 **같은 함수**를 쓴다 —
  화면과 지도가 다른 판독을 내면 현장이 혼란해진다.

★맥락 수집은 **주소 조건 없이 계기번호로** 한다. 구시공앱 기록은 주소가 비어 있어서
  주소로 훑으면 LTE 전환 행을 통째로 놓친다(2026-09-30 실측: 06190606718 의 3-09 전환 2행).

★빌더를 고치지 않고 후처리로 둔 이유 — 두 리스트에 같은 규칙을 걸어야 하고, 판독 규칙이
  바뀔 때 데이터 재생성(수십 분) 없이 이 스크립트만 다시 돌리면 되기 때문이다.
  리스트를 새로 만들면 이 스크립트도 다시 돌려라(CLAUDE.md 프로세스의 apply_dcu_status 와 같은 위치).
"""
import json
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from lp_read import read_lp, ctx_from_ledger_rows, LABELS   # noqa: E402

DB = ROOT / 'data/ami.db'
LEDGER = '20260227다운로드_2025_03_24에서2026_0'
BULGA = '25년_보강_불가__sheet1'
SNAP = '20260917-미청구2'
TARGETS = ['data/michunggu-data.json', 'data/michunggu-bulga-data.json',
           'data/michunggu-pending.json']


def nm(v):
    s = ''.join(str(v or '').split()).upper()
    return s.zfill(11) if s.isdigit() else s


def load_rows(cur, meters):
    """계기번호 -> 원장 행들(주소 빈 행 포함). 불가 원장도 함께 본다."""
    by = defaultdict(list)
    ms = list(meters)
    for i in range(0, len(ms), 900):          # SQLite 변수 한도
        chunk = ms[i:i + 900]
        ph = ','.join('?' * len(chunk))
        for t, extra, p in ((LEDGER, ' AND snapshot=?', (*chunk, SNAP)),
                            (BULGA, '', tuple(chunk))):
            try:
                q = (f'SELECT 계기번호_norm,시공일,통신방식,비고1,비고2,MAC,"M/S",시공자,'
                     f'"집/단",구분,col_15 FROM "{t}" WHERE 계기번호_norm IN ({ph}){extra}')
                for (m, sd, comm, b1, b2, mac, ms_, who, jip, gubun, st) in cur.execute(q, p):
                    by[m].append({'시공일': sd, '통신방식': comm, '비고1': b1, '비고2': b2,
                                  'MAC': mac, 'M/S': ms_, '시공자': who, '집/단': jip,
                                  '구분': gubun, '상태': st})
            except sqlite3.OperationalError as e:
                print(f'  [건너뜀] {t}: {e}')
    return by


def summarize_last(rows):
    if not rows:
        return ''
    import re
    best, bd = None, ''
    for r in rows:
        d = re.sub(r'\D', '', str(r.get('시공일') or ''))
        if d >= bd:
            bd, best = d, r
    if not best:
        return ''
    d = re.sub(r'\D', '', str(best.get('시공일') or ''))
    day = f'{d[:4]}-{d[4:6]}-{d[6:8]}' if len(d) >= 8 else ''
    bits = [x for x in (day, best.get('통신방식'), best.get('M/S'), best.get('구분'),
                        best.get('시공자'),
                        (best.get('비고2') or best.get('비고1') or '')) if x and str(x) != 'None']
    mac = best.get('MAC')
    if mac:
        bits.append(f'MAC {mac}')
    return ' · '.join(str(x).strip() for x in bits)


def apply_file(cur, path):
    p = ROOT / path
    if not p.exists():
        print(f'  없음: {path}')
        return
    rows = json.loads(p.read_text())
    if not isinstance(rows, list):
        print(f'  형식 아님(리스트가 아니다): {path}')
        return
    # ★LP 가 아예 없는 리스트는 건너뛴다 — 25년불가는 원천(불가 원장 53열)에 LP 열이 없다.
    #   모뎀을 못 달았으니 LP 가 있을 수 없고, 판독 필드를 붙이면 'LP 자료 없음' 만 4,373건
    #   쌓여 화면을 어지럽힌다(2026-09-30 실측).
    has_lp = sum(1 for r in rows if isinstance(r.get('LP'), dict) and r['LP'])
    if not has_lp:
        print(f'  {path} — LP 자료가 한 건도 없다, 건너뜀 ({len(rows):,}건)')
        return
    meters = {nm(r.get('계기번호')) for r in rows if r.get('계기번호')}
    led = load_rows(cur, meters)
    cnt, changed = Counter(), 0
    for r in rows:
        m = nm(r.get('계기번호'))
        ctx = ctx_from_ledger_rows(led.get(m))
        code, label, why = read_lp(r.get('LP'), ctx)
        before = r.get('LP판독')
        r['LP판독'] = code
        r['LP판독라벨'] = label
        r['LP판독사유'] = why
        r['LP판독색'] = LABELS[code][1]
        last = summarize_last(led.get(m))
        if last:
            r['마지막시공'] = last
        cnt[code] += 1
        if before != code:
            changed += 1
    p.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    tot = len(rows)
    print(f'  {path} — {tot:,}건 (판정 변경 {changed:,})')
    for code, _ in sorted(LABELS.items(), key=lambda x: -cnt[x[0]]):
        if cnt[code]:
            print(f'     {LABELS[code][0]:22s} {cnt[code]:>6,} ({cnt[code]*100//tot:>2}%)')


def main():
    args = sys.argv[1:]
    files = TARGETS if (not args or args[0] == '--all') else args
    con = sqlite3.connect(DB)
    cur = con.cursor()
    print('LP 판독 부착 — 규칙 정본 scripts/lp_read.py')
    for f in files:
        apply_file(cur, f)
    con.close()


if __name__ == '__main__':
    main()
