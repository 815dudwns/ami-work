#!/usr/bin/env python3
"""classify_jae.py — 재(再)/실효를 **계기 단위**로 다시 가른다.

왜 있나 (2026-09-08)
  workStatus 키가 '주소'라, 한 주소에 계기가 여럿이면 **한 계기 완료가 그 주소 전체에 붙는다.**
  그래서 손도 안 댄 계기가 '재작업'으로 뜬다.
  실측: 서대문구 연세로4길 51(창천동 5-49) 20계기가 전부 '재'인데, 근거는 주소키 하나
  (previousCompleteAt 2026-06-26 · previousCompleteByName 우희근)뿐이고 그 20계기는
  awms 모뎀작업리스트에 시공기록이 0건이다. 같은 시간대 그 작업자의 등록건은 전부 옆 건물이었다.
  영준님 "곧 리스트업할 때 이런 것 없게 하자".

판정축 = `data/ami.db` 의 `modem_work` (awms 모뎀작업리스트). **주소가 아니라 계기번호로 맞춘다.**
  계기번호_norm(숫자만 zfill 11) 로 대조한다.

  | 조건                                          | 판정            |
  |-----------------------------------------------|-----------------|
  | modem_work 에 시공기록 있음 + 리스트에 다시 나옴 | 재(再)          |
  | modem_work 에 기록 없음                        | 실효(미시공)     |

  ★주소 `previousComplete` 는 판정에 쓰지 않는다. 보조 표시로만 남긴다.
  ★modem_work 는 스냅샷이다. 스냅샷 이후에 시공된 건은 알 수 없다 — 리포트에 그 경계를 찍고,
    모르는 것을 조용히 '미시공'으로 몰지 않는다.

사용
  python3 scripts/classify_jae.py                # 드라이런(기본) — 리포트만, 파일 안 건드림
  python3 scripts/classify_jae.py --list <xlsx>  # 새 보강현황 기준으로 판정
  python3 scripts/classify_jae.py --apply        # 실제 재배치(백업 먼저)

★이번(2026-09-08) 산출물은 도구 + 드라이런 리포트까지다. 실제 재배치는 새 실효 리스트가
  올 때 리스트업과 **한 번에** 한다 — 마커가 두 번 움직이면 안 된다.
workStatus 는 읽지도 쓰지도 않는다.
"""
import argparse
import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data' / 'ami.db'
SITE = ROOT / 'data' / 'site-data.json'
REWORK = ROOT / 'data' / 'rework-data.json'
KST = ZoneInfo('Asia/Seoul')


def norm_meter(v):
    d = re.sub(r'\D', '', str(v or ''))
    return d.zfill(11) if d else None


def load_json(p):
    d = json.loads(Path(p).read_text(encoding='utf-8'))
    return d if isinstance(d, list) else (d.get('data') or [])


def load_modem_work(con):
    """계기번호_norm -> 시공기록 목록. 없으면 판정축이 비었다는 뜻이라 즉시 멈춘다."""
    rows = con.execute(
        'SELECT 계기번호_norm, 계기번호, "진행 상태", 상태, LP, 작업일자, 작업자1, '
        '작업구분, 개통여부, 지사 FROM modem_work WHERE 계기번호_norm IS NOT NULL').fetchall()
    if not rows:
        sys.exit('modem_work 가 비었다 — 먼저 python3 scripts/xlsx_to_db.py --all')
    out = defaultdict(list)
    for r in rows:
        out[r[0]].append({
            '계기번호': r[1], '진행상태': r[2], '상태': r[3], 'LP': r[4],
            '작업일자': r[5], '작업자': r[6], '작업구분': r[7], '개통': r[8], '지사': r[9]})
    return out


def snapshot_window(con):
    snap = con.execute('SELECT DISTINCT snapshot FROM modem_work').fetchall()
    lo, hi = con.execute('SELECT MIN(작업일자), MAX(작업일자) FROM modem_work').fetchone()
    return [s[0] for s in snap], lo, hi


def list_meters_from_xlsx(path):
    """새 보강현황 엑셀에서 계기번호 집합을 뽑는다."""
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hi = None
    for i, r in enumerate(rows[:12]):
        vals = [c for c in r if c not in (None, '')]
        if len(vals) >= max(2, ws.max_column * 0.5) and all(isinstance(c, str) for c in vals):
            hi = i
            break
    if hi is None:
        sys.exit(f'{path}: 헤더를 찾지 못했다')
    names = [str(c).strip() if c else '' for c in rows[hi]]
    if '계기번호' not in names:
        sys.exit(f'{path}: 계기번호 열이 없다 (열: {names[:8]}…)')
    ci = names.index('계기번호')
    out = {norm_meter(r[ci]) for r in rows[hi + 1:] if ci < len(r)}
    wb.close()
    out.discard(None)
    return out


def addr_of(r):
    return str(r.get('주소') or '').strip()


def classify(site, rework, mw, list_meters=None):
    """계기 단위 판정. 반환 (재→실효, 실효→재, 판정불가, 유지)."""
    down, up, unknown = [], [], []
    keep_jae, keep_sil = 0, 0

    for r in rework:
        k = norm_meter(r.get('계기번호'))
        if not k:
            unknown.append(('재방문', r, '계기번호 없음'))
            continue
        if k in mw and (list_meters is None or k in list_meters):
            keep_jae += 1
        else:
            down.append((r, k))

    for r in site:
        k = norm_meter(r.get('계기번호'))
        if not k:
            unknown.append(('실효', r, '계기번호 없음'))
            continue
        if k in mw and (list_meters is None or k in list_meters):
            up.append((r, k))
        else:
            keep_sil += 1

    return down, up, unknown, keep_jae, keep_sil


def group_by_addr(items):
    g = defaultdict(list)
    for r, k in items:
        g[addr_of(r)].append((r, k))
    return dict(sorted(g.items(), key=lambda kv: -len(kv[1])))


def report(site, rework, mw, snaps, lo, hi, down, up, unknown, keep_jae, keep_sil,
           list_meters, list_src):
    now = datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S %Z')
    ver = {}
    vf = ROOT / 'data' / 'site-data.version.json'
    if vf.exists():
        ver = json.loads(vf.read_text(encoding='utf-8'))

    print('=' * 72)
    print('재(再) 판정 — 계기 단위 (드라이런)' if list_src is None else f'재(再) 판정 — 기준 리스트 {list_src}')
    print('=' * 72)
    print(f'실행시각              {now}')
    print(f'판정축                data/ami.db · modem_work {sum(len(v) for v in mw.values()):,}행 '
          f'/ 고유계기 {len(mw):,}')
    print(f'  modem_work 스냅샷   {",".join(snaps)}')
    print(f'  시공기록 기간       {lo} ~ {hi}')
    print(f'현재 리스트           실효 {len(site):,} · 재방문 {len(rework):,}'
          + (f'  (생성 {ver.get("generated", "?")})' if ver else ''))
    if list_meters is not None:
        print(f'대조 리스트           {list_src} — 계기 {len(list_meters):,}')
    print()
    print('★스냅샷 경계 — 이 도구가 모르는 것')
    print(f'  modem_work 는 {hi} 까지의 기록이다. 그 뒤에 시공된 건은 여기 없다.')
    print('  아래 "재 -> 실효" 는 "스냅샷 시점까지 시공기록이 없다"는 뜻이지 "영원히 미시공"이 아니다.')
    print('  새 리스트로 재구성할 때는 modem_work 를 먼저 최신으로 적재하라.')
    print()

    print('-' * 72)
    print(f'[1] 재 -> 실효 (내려감) : {len(down):,}계기 / {len(group_by_addr(down)):,}주소')
    print('    사유 — 주소 완료기록은 있으나 그 계기에는 시공기록이 없다')
    print('-' * 72)
    for addr, items in group_by_addr(down).items():
        r0 = items[0][0]
        road = str(r0.get('도로명주소') or '')
        print(f'  {addr}  ({road})  {len(items)}계기')
        print('     ' + ', '.join(str(r.get('계기번호')) for r, _ in items[:12])
              + (f' … 외 {len(items) - 12}' if len(items) > 12 else ''))
    print()

    print('-' * 72)
    print(f'[2] 실효 -> 재 (올라감) : {len(up):,}계기 / {len(group_by_addr(up)):,}주소')
    print('    사유 — modem_work 에 시공기록이 있는데 리스트에 다시 나왔다')
    print('-' * 72)
    for addr, items in group_by_addr(up).items():
        print(f'  {addr}')
        for r, k in items:
            for w in mw[k]:
                print(f'     {r.get("계기번호")}  {w["작업일자"]}  {w["작업자"]}  '
                      f'{w["진행상태"]}/{w["상태"]}  LP {w["LP"]}  {w["작업구분"]}  개통 {w["개통"] or "-"}')
    print()

    print('-' * 72)
    print(f'[3] 판정 불가 : {len(unknown):,}건')
    print('-' * 72)
    for src, r, why in unknown[:20]:
        print(f'  [{src}] {r.get("계기번호")!r} {addr_of(r)[:40]} — {why}')
    if not unknown:
        print('  없음')
    print()

    print('-' * 72)
    print('[4] 판정 후 예상')
    print('-' * 72)
    print(f'  재방문  {len(rework):,} -> {keep_jae + len(up):,}   (유지 {keep_jae} + 올라옴 {len(up)})')
    print(f'  실효    {len(site):,} -> {keep_sil + len(down):,}   (유지 {keep_sil} + 내려옴 {len(down)})')
    print(f'  합계    {len(site) + len(rework):,} -> {keep_jae + len(up) + keep_sil + len(down):,}'
          '  (계기 총수는 변하지 않아야 한다)')
    print()
    print('이 리포트는 드라이런이다. 파일은 하나도 바뀌지 않았다.' if True else '')


def apply_changes(site, rework, down, up):
    ts = datetime.now(KST).strftime('%Y%m%d-%H%M%S')
    for p in (SITE, REWORK):
        bak = p.with_name(f'{p.stem}.backup-재판정전-{ts}.json')
        bak.write_text(p.read_text(encoding='utf-8'), encoding='utf-8')
        print(f'  백업 {bak.name}')
    down_ids = {id(r) for r, _ in down}
    up_ids = {id(r) for r, _ in up}
    new_site = [r for r in site if id(r) not in up_ids] + [r for r, _ in down]
    new_rew = [r for r in rework if id(r) not in down_ids] + [r for r, _ in up]
    SITE.write_text(json.dumps(new_site, ensure_ascii=False, indent=1), encoding='utf-8')
    REWORK.write_text(json.dumps(new_rew, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'  적용 — 실효 {len(new_site):,} · 재방문 {len(new_rew):,}')
    print('  ★site-data.version.json · stats 인덱스 재생성이 필요하다:')
    print('     python3 scripts/gen_site_version.py && python3 scripts/gen_stats_index.py')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='실제 재배치(기본은 드라이런)')
    ap.add_argument('--list', dest='xlsx', help='새 보강현황 엑셀 기준으로 판정')
    ap.add_argument('--db', default=str(DB))
    args = ap.parse_args()

    if not Path(args.db).exists():
        sys.exit(f'DB 없음: {args.db} — python3 scripts/xlsx_to_db.py --all')
    con = sqlite3.connect(f'file:{args.db}?mode=ro', uri=True)
    mw = load_modem_work(con)
    snaps, lo, hi = snapshot_window(con)

    site, rework = load_json(SITE), load_json(REWORK)
    list_meters = list_meters_from_xlsx(args.xlsx) if args.xlsx else None

    down, up, unknown, keep_jae, keep_sil = classify(site, rework, mw, list_meters)
    report(site, rework, mw, snaps, lo, hi, down, up, unknown,
           keep_jae, keep_sil, list_meters, args.xlsx)

    if args.apply:
        print('=' * 72)
        print('--apply — 실제로 재배치한다')
        print('=' * 72)
        apply_changes(site, rework, down, up)
    return 0


if __name__ == '__main__':
    sys.exit(main())
