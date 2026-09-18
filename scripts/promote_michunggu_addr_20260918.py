#!/usr/bin/env python3
"""주 과장 주소 회신분 반영 — await_addr -> ready 승격 (PM 발주 2026-09-18)

쓰는 법
    python3 scripts/promote_michunggu_addr_20260918.py <회신엑셀> [--sheet 주소요청] [--dry]

회신 엑셀은 우리가 보낸 것(`research/미청구_주소요청_주덕기과장_20260918.xlsx`)에
주소만 채워서 돌아온 것을 전제한다. 열 이름을 보고 찾으므로 **열 순서가 바뀌어도 된다.**
주소 열은 이름에 '주소' 가 들어간 열을 전부 후보로 본다(과장이 열을 새로 추가해 올 수 있다).

★식별자 = 계기번호 + MAC.
  - 계기번호는 **재사용된다** — 단독으로 붙이면 남의 개소에 주소가 들어간다(오염 11~18% 실측).
  - 그래서 **계기번호 AND MAC 이 둘 다 일치할 때만** 승격한다(strict).
  - MAC 이 우리 쪽에 없는 행(3건)만 계기번호 단독으로 붙이되 `승격근거` 에 그 사실을 남겨
    나중에 걸러낼 수 있게 한다.
  - 계기번호가 같은데 MAC 이 다르면 **다른 개소다. 붙이지 않고 충돌로 보고**한다.
  - ★회신 MAC 칸에 값이 있는데 **형식이 깨져 못 읽으면** 그것도 보류한다.
    '못 읽음'을 '없음'으로 삼키면 계기번호 단독 매칭으로 조용히 강등되는데, 그게 오염 경로다
    (2026-09-18 자가시험에서 실제로 그렇게 새는 것을 잡아 고쳤다).

★계기번호 정규화는 접두 보존 규칙을 따른다 — 엑셀이 앞 0 을 날려 온 경우만 zfill(11).
★--dry 가 기본 안전장치가 아니다. 쓰기 전에 요약을 먼저 찍고, --dry 면 커밋하지 않는다.
"""
import argparse
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data/ami.db'
TABLE = 'michunggu_target_20260918'
OUT_READY = ROOT / 'research/미청구_대상_지도업로드_20260918.json'
OUT_WAIT = ROOT / 'research/미청구_대상_주소대기_20260918.json'
OUT_CONFLICT = ROOT / 'research/미청구_주소회신_MAC보류_20260918.json'


def norm_meter(v):
    s = re.sub(r'[\s\-]', '', str(v if v is not None else '')).strip()
    if not s or s.upper() in ('NAN', 'NONE', '#N/A', '0'):
        return ''
    return s.upper() if re.search(r'[A-Za-z]', s) else s.zfill(11)


def norm_mac(v):
    s = re.sub(r'[\s:\-*.]', '', str(v if v is not None else '')).upper()
    if re.fullmatch(r'012\d{8}', s) or re.fullmatch(r'[0-9A-F]{12}', s):
        return s
    return ''


def txt(v):
    s = str(v if v is not None else '').strip()
    return '' if s.lower() in ('', 'nan', 'none', '#n/a') else s


def is_road(a):
    return bool(re.search(r'[가-힣0-9]+(?:로|길)\d*[가-힣]*\s*\d', str(a or '')))


def read_reply(path, sheet=None):
    wb = load_workbook(path, data_only=True)
    ws = wb[sheet] if sheet else wb[wb.sheetnames[0]]
    head = [txt(ws.cell(1, c).value) for c in range(1, ws.max_column + 1)]
    idx = {h: i + 1 for i, h in enumerate(head) if h}

    def find(*names):
        for n in names:
            for h, i in idx.items():
                if n in h:
                    return i
        return None

    c_m, c_mac = find('계기번호'), find('모뎀MAC', 'MAC')
    addr_cols = [i for h, i in idx.items() if '주소' in h]
    if not c_m:
        raise SystemExit(f'★계기번호 열을 못 찾았다. 헤더: {head}')
    print(f'회신 시트 "{ws.title}" · 헤더 {head}')
    print(f'  계기번호={c_m} · MAC={c_mac} · 주소후보열={addr_cols}')

    out = []
    for r in range(2, ws.max_row + 1):
        m = norm_meter(ws.cell(r, c_m).value)
        if not m:
            continue
        addrs = [txt(ws.cell(r, i).value) for i in addr_cols]
        addrs = [a for a in addrs if a]
        raw_mac = txt(ws.cell(r, c_mac).value) if c_mac else ''
        out.append({
            'm': m,
            'mac': norm_mac(raw_mac),
            # ★칸이 빈 것과 '값이 있는데 못 읽은 것'을 구분해야 한다.
            #   못 읽은 MAC 을 '없음'으로 처리하면 계기번호 단독 매칭으로 조용히 강등된다
            #   — 그게 바로 오염 경로다(2026-09-18 자가시험에서 잡았다).
            'mac_raw': raw_mac,
            'jibun': next((a for a in addrs if not is_road(a)), ''),
            'road': next((a for a in addrs if is_road(a)), ''),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('reply')
    ap.add_argument('--sheet', default=None)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    rows = read_reply(a.reply, a.sheet)
    print(f'회신 {len(rows):,}행 · 주소 있는 행 {sum(1 for r in rows if r["jibun"] or r["road"]):,}')

    con = sqlite3.connect(DB)
    c = con.cursor()
    cur = {}
    for m, mac, st in c.execute(f'SELECT 계기번호, MAC, 상태 FROM "{TABLE}"'):
        cur[norm_meter(m)] = {'raw': m, 'mac': norm_mac(mac), '상태': st}
    print(f'DB {TABLE} {len(cur):,}행 · await_addr'
          f' {sum(1 for v in cur.values() if v["상태"] == "await_addr"):,}')

    st = Counter()
    updates, conflicts = [], []
    for r in rows:
        if not (r['jibun'] or r['road']):
            st['주소 공란(회신 안 됨)'] += 1
            continue
        t = cur.get(r['m'])
        if not t:
            st['대상에 없는 계기'] += 1
            continue
        if t['상태'] != 'await_addr':
            st['이미 ready'] += 1
            continue
        if r['mac_raw'] and not r['mac']:
            # 회신에 MAC 값이 있는데 형식이 깨졌다 — 못 읽은 것을 '없음' 으로 삼키지 않는다
            conflicts.append({'계기번호': t['raw'], 'DB_MAC': t['mac'],
                              '회신_MAC': r['mac_raw'], '사유': 'MAC 형식 불명',
                              '회신주소': r['jibun'] or r['road']})
            st['★MAC 형식 불명 — 보류'] += 1
            continue
        if t['mac'] and r['mac']:
            if t['mac'] != r['mac']:
                # ★계기번호는 같은데 MAC 이 다르다 = 다른 개소다. 붙이지 않는다.
                conflicts.append({'계기번호': t['raw'], 'DB_MAC': t['mac'],
                                  '회신_MAC': r['mac'], '사유': 'MAC 불일치',
                                  '회신주소': r['jibun'] or r['road']})
                st['★MAC 불일치 — 보류'] += 1
                continue
            why = '계기번호+MAC'
        elif not t['mac']:
            why = '계기번호단독(DB에 MAC 없음)'
        else:
            why = '계기번호단독(회신에 MAC 칸 비어 있음)'
        updates.append((r['jibun'], r['road'], why, t['raw']))
        st[f'승격 — {why}'] += 1

    print('\n=== 판정 ===')
    for k, v in st.most_common():
        print(f'  {k:32s} {v:6,}')
    if conflicts:
        print(f'\n★MAC 보류 {len(conflicts)}건 (승격하지 않음) — 상위 5')
        for x in conflicts[:5]:
            print(f'   {x["계기번호"]}  DB[{x["DB_MAC"]}] vs 회신[{x["회신_MAC"]}]'
                  f'  ({x["사유"]})  {x["회신주소"]}')
        OUT_CONFLICT.parent.mkdir(parents=True, exist_ok=True)
        OUT_CONFLICT.write_text(json.dumps(conflicts, ensure_ascii=False, indent=1))
        print(f'   저장 {OUT_CONFLICT}')

    if a.dry:
        print('\n--dry — DB 를 쓰지 않는다')
        return 0
    if not updates:
        print('\n승격할 건이 없다')
        return 0

    # 승격근거 열이 없으면 만든다(회신 이력을 남겨야 나중에 되짚을 수 있다)
    cols = {r[1] for r in c.execute(f'PRAGMA table_info("{TABLE}")')}
    if '승격근거' not in cols:
        c.execute(f'ALTER TABLE "{TABLE}" ADD COLUMN "승격근거" TEXT')
    c.executemany(
        f'UPDATE "{TABLE}" SET 지번주소=?, 도로명주소=?, 상태=\'ready\','
        f' 주소출처=\'한전회신/주덕기\', 신뢰등급=\'A_한전회신\', 승격근거=?'
        f' WHERE 계기번호=?', updates)
    con.commit()
    after = dict(c.execute(f'SELECT 상태, COUNT(*) FROM "{TABLE}" GROUP BY 1').fetchall())
    print(f'\nDB 갱신 {len(updates):,}건 · 상태 {after}')

    # JSON 2분할 재생성 — DB 가 정본이다
    colnames = [r[1] for r in c.execute(f'PRAGMA table_info("{TABLE}")')]
    def dump(state, path):
        recs = [dict(zip(colnames, row)) for row in
                c.execute(f'SELECT * FROM "{TABLE}" WHERE 상태=?', (state,))]
        path.write_text(json.dumps(recs, ensure_ascii=False, indent=1))
        print(f'  저장 {path}  {len(recs):,}건')
    dump('ready', OUT_READY)
    dump('await_addr', OUT_WAIT)
    con.close()
    print('\n★지도 업로드는 하지 않는다 — PM 판단 후 별도.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
