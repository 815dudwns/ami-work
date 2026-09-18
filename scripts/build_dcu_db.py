#!/usr/bin/env python3
"""DCU 대장 -> data/dcu-db.json  ★현재 보류(2026-09-18) — 돌리지 마라

보류 사유(PM/영준님 2026-09-18): "지금 급한 게 아니다." 조회 UI 도 안 붙인다.
  미청구 리스트에는 `DCUID` 만 두고, 상태가 필요하면 그때 dcu_all 을 직접 조회한다.
  되살릴 필요가 생기면 이 스크립트를 그대로 돌리면 된다(산출 6.0MB, DCU 19,007개).
  ※실행해도 리스트나 지도에는 아무 영향이 없다 — data/dcu-db.json 을 새로 쓸 뿐이다.

왜 (영준님 2026-09-18): "회선여부나 장애 같은 것은 DCU DB 에 반영해라"
  ★DCU 상태값(회선상태·장애여부)을 리스트마다 복사해 박지 않는다.
    복사해 두면 대장이 갱신돼도 리스트는 옛 값을 들고 있게 되고, 리스트 수만큼 진실이 갈린다.
    리스트에는 `DCUID` 만 두고 상태는 여기서 **조인해서 읽는다**(js/dcu-db.js).

출처: ami.db `dcu_all` 최신 snapshot (= data/reference/간선망_해지_정지대상.xlsx)
  ★파일 맨 위에 snapshot 날짜를 박는다 — 언제 기준인지 화면에서 보여야 한다.
"""
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data/ami.db'
OUT = ROOT / 'data/dcu-db.json'

FIELDS = [('장애여부', '장애여부'), ('회선상태', '회선상태'), ('통신사', '통신사'),
          ('인입망 통신방식', '인입망통신방식'), ('성공/전체계기', '성공전체계기'),
          ('변대주명', '변대주명'), ('변대주번호', '변대주번호'),
          ('지사', '지사'), ('차수', '차수'), ('서버시간', '서버시간')]


def txt(v):
    s = str(v if v is not None else '').strip()
    return '' if s.lower() in ('', 'nan', 'none', '#n/a') else s


def main():
    con = sqlite3.connect(DB)
    c = con.cursor()
    snaps = [r[0] for r in c.execute(
        'SELECT DISTINCT snapshot FROM dcu_all ORDER BY snapshot DESC')]
    if not snaps:
        print('★dcu_all 이 비었다')
        return 1
    snap = snaps[0]
    src = c.execute('SELECT DISTINCT src_file FROM dcu_all WHERE snapshot=?',
                    (snap,)).fetchone()
    cols = ', '.join(f'"{a}"' for a, _ in FIELDS)
    rows = c.execute(f'SELECT "DCU ID", {cols} FROM dcu_all WHERE snapshot=?', (snap,)).fetchall()

    dcu, dup = {}, 0
    for r in rows:
        did = txt(r[0]).upper()
        if not did:
            continue
        if did in dcu:
            dup += 1
            continue
        dcu[did] = {out: txt(v) for (_, out), v in zip(FIELDS, r[1:])}
    # 변대주번호로도 찾을 수 있게 색인을 하나 더 둔다(DCUID 가 없는 개소용)
    by_bdju = {}
    for did, v in dcu.items():
        n8 = v.get('변대주번호', '')
        if n8 and n8 not in by_bdju:
            by_bdju[n8] = did

    payload = {
        'snapshot': snap,
        'snapshot_표시': f'{snap[:4]}-{snap[4:6]}-{snap[6:8]}',
        '출처': src[0] if src else '',
        '서버시간_최신': max((v['서버시간'] for v in dcu.values() if v['서버시간']), default=''),
        '건수': len(dcu),
        '설명': ('DCU 상태 단일 출처. 리스트에는 DCUID 만 두고 여기서 조인해 읽는다. '
               '리스트마다 상태값을 복사해 박지 마라.'),
        'dcu': dcu,
        '변대주번호색인': by_bdju,
    }
    # ★들여쓰기 없이 쓴다 — 19,007개라 indent 하나로 7.2MB -> 3MB 차이가 난다.
    #   지도에서 받아 가는 파일이라 크기가 곧 로딩이다. diff 가 필요하면 jq 로 펴 보면 된다.
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    size = OUT.stat().st_size / 1e6
    print(f'저장 {OUT}  DCU {len(dcu):,}개 · {size:.1f}MB · snapshot {snap}'
          f' (중복 DCUID {dup})')
    print(f'  출처 {payload["출처"]} · 서버시간 최신 {payload["서버시간_최신"]}')
    print(f'  회선상태 {dict(Counter(v["회선상태"] for v in dcu.values()).most_common(5))}')
    print(f'  장애여부 {dict(Counter(v["장애여부"] for v in dcu.values()).most_common(5))}')
    print(f'  변대주번호 색인 {len(by_bdju):,}')

    # ── 미청구 데이터셋과 조인이 되는지 확인 ────────────────────────────────
    mp = ROOT / 'data/michunggu-data.json'
    if mp.exists():
        d = json.loads(mp.read_text())
        hit_id = sum(1 for x in d if x.get('DCUID') and x['DCUID'].upper() in dcu)
        hit_bd = sum(1 for x in d if not (x.get('DCUID') or '').upper() in dcu
                     and x.get('변대주번호') and x['변대주번호'] in by_bdju)
        has_id = sum(1 for x in d if x.get('DCUID'))
        print(f'\n미청구 지도 {len(d):,} — DCUID 보유 {has_id:,}'
              f' · 대장 적중 {hit_id:,} · 변대주번호로 추가 적중 {hit_bd:,}'
              f' · 합 {hit_id+hit_bd:,} ({(hit_id+hit_bd)/len(d)*100:.1f}%)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
