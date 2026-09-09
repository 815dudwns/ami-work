#!/usr/bin/env python3
"""build_site_data_from_boranggi.py — 한전 보강현황(계기교체) 엑셀 → data/site-data.json

왜 새로 쓰나 (2026-09-09): 옛 `build_new_site_data.py` 는 5/13 판 전용으로 열 번호가
  하드코딩(`r[16]`, `s1[26]`)돼 있어 판이 바뀌면 엉뚱한 열을 읽는다. 이번 9/8 판은 열 구성이
  달라졌다(교체 전/후가 `계기번호`·`계기번호.1` 로 갈리고 `26년시공앱`·`26년불가앱` 이 생겼다).
  그래서 **열 이름 기준**으로 다시 썼다.

★한전 엑셀은 자동필터가 걸려 온다 — 보이는 행만 우리 대상이다.
  9/8 판은 83,376행 중 80,280행이 숨김이고 보이는 행은 3,096행뿐이다.
  숨긴 조건은 `최초LP 수신일 = 빈칸` + `26년시공앱 = #N/A` + `26년불가앱 = #N/A`,
  즉 **LP 안 왔고 우리가 손도 안 댄 것**. 전 행을 그냥 세면 대상이 27배로 부푼다.

★교체 전/후 계기번호를 구별하라.
  `계기번호`   = 교체 **전**(철거) 계기 — 우리 데이터·모뎀작업리스트와 0.0% 밖에 안 맞는다.
  `계기번호.1` = 교체 **후**(신설) 계기 — 이쪽이 우리 키다(실측 50.6% 매칭).

★DCU 매칭은 변대주가 우선이다 (영준님 2026-09-09).
  DCU ID 로 찾은 것과 변대주명으로 찾은 것이 다르면 **변대주 쪽을 쓴다** —
  그 전주에 DCU 가 있는데 개소만 LTE 로 달았던 경우가 있어, DCU ID 는 옛 소속을 가리킬 수 있다.

사용법
  python3 scripts/build_site_data_from_boranggi.py "data/inbox_jdg_<날짜>/계기교체 보강현황_*.xlsx"
    → data/site-data-new.json  ·  data/coords-todo.json  (검토 후 site-data.json 로 교체)
"""

import argparse
import json
import re
import sqlite3
import sys
import zipfile
from collections import Counter
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent.parent
OLD_JSON = BASE / 'data/site-data.json'
DB = BASE / 'data/ami.db'


def log(m):
    print(m, flush=True)


def visible_rows(xlsx: Path) -> set:
    """자동필터로 숨겨지지 않은 행 번호(1-base, 헤더 포함)."""
    z = zipfile.ZipFile(xlsx)
    sheet = [n for n in z.namelist() if n.startswith('xl/worksheets/sheet')][0]
    xml = z.read(sheet).decode('utf-8', 'ignore')
    return {int(r[0]) for r in re.findall(r'<row r="(\d+)"([^>]*)>', xml)
            if 'hidden="1"' not in r[1]}


def norm_meter(v) -> str:
    """계기번호: 숫자만 남기고 11자리 zfill. 앞 0 을 잃지 않는다."""
    return re.sub(r'\D', '', str(v or '')).zfill(11)


def meter_type(meter_no: str) -> str:
    """★계기타입은 엑셀을 믿지 않고 계기번호 3~4번째 자리로 판정한다(CLAUDE.md 데이터규칙).
    17=E · 19=EA · 25/26/27·45/46/47=G · 53/55=Amigo"""
    c = meter_no[2:4]
    if c == '17':
        return 'E'
    if c == '19':
        return 'EA'
    if c in ('25', '26', '27', '45', '46', '47'):
        return 'G'
    if c in ('53', '55'):
        return 'Amigo'
    return '알수없음'


def txt(v) -> str:
    if v is None:
        return ''
    s = str(v).strip()
    return '' if s.lower() in ('nan', 'nat', 'none', '#n/a') else s


def ymd(v) -> str:
    t = pd.to_datetime(v, errors='coerce')
    return '' if pd.isna(t) else t.strftime('%Y-%m-%d')


def norm_mac(v) -> str:
    """모뎀맥 정규화. 콜론·하이픈·공백 제거 후 대문자.
    ★16·15자리 순수숫자는 맥이 아니라 한전 시스템의 인코딩 값이라 버린다
      (`3438303633373730` 를 풀면 ASCII '48063770' — 회선번호 계열)."""
    s = re.sub(r'[\s:\-*]', '', str(v or '')).upper()
    if not s or s in ('NAN', 'NONE'):
        return ''
    if re.fullmatch(r'012\d{8}', s):
        return s                          # LTE 숫자형 11자리
    if re.fullmatch(r'[0-9A-F]{12}', s):
        return s                          # hex 12자리
    return ''                             # 그 밖은 맥이 아니다


def load_dcu(con):
    """DCU 대장 → (DCU ID 색인, (지사,변대주명) 색인)."""
    d = pd.read_sql('SELECT * FROM dcu_status', con)
    by_id, by_bdju = {}, {}
    for r in d.to_dict('records'):
        did = txt(r.get('dcu_id'))
        if did:
            by_id.setdefault(did, r)
        nm, dept = txt(r.get('변대주명')), txt(r.get('지사'))
        if nm:
            by_bdju.setdefault((dept, nm), r)
            by_bdju.setdefault(('', nm), r)      # 지사 없이도 찾을 수 있게
    return by_id, by_bdju


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx')
    ap.add_argument('--out', default=str(BASE / 'data/site-data-new.json'))
    ap.add_argument('--todo', default=str(BASE / 'data/coords-todo.json'))
    a = ap.parse_args()

    xlsx = Path(a.xlsx)
    vis = visible_rows(xlsx)
    df = pd.read_excel(xlsx)
    df['_row'] = range(2, len(df) + 2)
    v = df[df['_row'].isin(vis)].copy()
    log(f"엑셀 {len(df):,}행 중 보이는 행 {len(v):,}행 — 이것만 대상이다")

    old = json.loads(OLD_JSON.read_text())
    old_by_meter = {norm_meter(o.get('계기번호')): o for o in old}
    old_by_addr = {}
    for o in old:
        addr = txt(o.get('주소'))
        if addr and o.get('lat') and addr not in old_by_addr:
            old_by_addr[addr] = o
    log(f"기존 site-data {len(old):,}건 (좌표 있는 주소 {len(old_by_addr):,}곳)")

    con = sqlite3.connect(DB)
    by_id, by_bdju = load_dcu(con)
    log(f"DCU 대장 {len(by_id):,}개 · 변대주명 색인 {len(by_bdju):,}")

    out, todo = [], []
    st = Counter()
    for r in v.to_dict('records'):
        meter = norm_meter(r.get('계기번호.1'))
        dept = txt(r.get('지사'))
        addr = txt(r.get('지번'))
        bdju = txt(r.get('변대주'))
        dcuid_x = txt(r.get('DCU ID'))          # Q열 — 교체 전 DCU

        # ── DCU 매칭: DCU ID / 변대주명 두 갈래로 찾고, 어긋나면 변대주를 쓴다 ──
        hit_id = by_id.get(dcuid_x)
        hit_bd = by_bdju.get((dept, bdju)) or by_bdju.get(('', bdju))
        if hit_bd and hit_id and txt(hit_bd.get('dcu_id')) != txt(hit_id.get('dcu_id')):
            hit, src = hit_bd, '변대주우선(불일치)'
        elif hit_bd:
            hit, src = hit_bd, '변대주'
        elif hit_id:
            hit, src = hit_id, 'DCUID'
        else:
            hit, src = None, '없음'
        st['dcu:' + src] += 1

        e = {
            '지사': dept,
            '주소': addr,
            '도로명주소': txt(r.get('도로명')),
            '계기번호': meter,
            '계기타입': meter_type(meter),
            '고객번호': re.sub(r'\D', '', txt(r.get('고객번호'))).zfill(10) if txt(r.get('고객번호')) else '',
            '계약종별': txt(r.get('계약종별')),
            '통신방식': txt(r.get('통신방식.1')),
            '공동주택명': txt(r.get('공동주택명')),
            '상호': txt(r.get('상호명')),
            '검기만료년월': txt(r.get('검기만료년월')),
            '계기타입_전': txt(r.get('계기타입')),
            '인입주': txt(r.get('인입주')),
            '변대주': bdju,
            'DCUID': txt(hit.get('dcu_id')) if hit else '',
            'DCU매칭': src,
            '모뎀MAC': norm_mac(r.get('모뎀 MAC.1')),          # ★Y열만 쓴다(기존 맥은 안 쓴다)
            'DCU장애여부': txt(r.get('DCU 장애여부')),
            'DCU회선상태': txt(hit.get('회선상태')) if hit else '',
            'dcu_철거예정': txt(hit.get('철거예정')) if hit else '',
            '교체사유': txt(r.get('교체사유')),
            '시스템등록일': ymd(r.get('시스템등록일(영배)')),
            '계기교체일': ymd(r.get('계기교체일(A)')),
            '연계수신일': ymd(r.get('연계 수신일(B)')),
            '최초LP수신일': ymd(r.get('최초LP 수신일(C)')),
            '사업차수_전': txt(r.get('사업차수')),
            '통신방식_전': txt(r.get('통신방식')),
            '검침방법_전': txt(r.get('검침방법')),
            '검침방법': txt(r.get('검침방법.1')),
        }

        # ── 좌표: 계기 → 주소 순으로 기존 것을 재활용한다(재추출 비용을 아낀다) ──
        o = old_by_meter.get(meter) or old_by_addr.get(addr)
        if o and o.get('lat'):
            e['lat'], e['lng'] = o['lat'], o['lng']
            e['좌표정확도'] = o.get('좌표정확도', 'exact')
            st['좌표:재활용' + ('(계기)' if old_by_meter.get(meter) else '(주소)')] += 1
        else:
            e['lat'] = e['lng'] = None
            e['좌표정확도'] = None
            todo.append({'계기번호': meter, '주소': addr, '도로명주소': e['도로명주소']})
            st['좌표:추출필요'] += 1

        # 지난 판에서 이어받을 현장 메모(디테일 표시용) — 있으면만
        if o:
            for k in ('불가', '이전상태', '이전사유'):
                if txt(o.get(k)):
                    e[k] = o[k]

        out.append(e)

    log("\n=== 결과 ===")
    for k, n in sorted(st.items()):
        log(f"  {k:22s} {n:,}")
    log(f"\n  계기 {len(out):,}개 · 지번 {len({e['주소'] for e in out}):,}곳")
    log(f"  좌표 추출 대기 {len(todo):,}건 (지번 {len({t['주소'] for t in todo}):,}곳)")
    log("\n[계기타입]  " + " · ".join(f"{k} {n}" for k, n in Counter(e['계기타입'] for e in out).most_common()))
    log("[통신방식]  " + " · ".join(f"{k or '(빈값)'} {n}" for k, n in Counter(e['통신방식'] for e in out).most_common(6)))
    log("[지사]      " + " · ".join(f"{k} {n}" for k, n in Counter(e['지사'] for e in out).most_common()))
    log(f"[모뎀MAC]   값 있음 {sum(1 for e in out if e['모뎀MAC']):,}건")

    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1))
    Path(a.todo).write_text(json.dumps(todo, ensure_ascii=False, indent=1))
    log(f"\n저장 {a.out}\n저장 {a.todo}")


if __name__ == '__main__':
    sys.exit(main())
