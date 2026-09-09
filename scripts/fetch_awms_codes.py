#!/usr/bin/env python3
"""awms 공통코드(getCommonCode) 전체를 받아 data/ami.db 의 awms_code 테이블에 적재한다.

왜 필요한가
  awms 원본(FMPMTR 연간대상 목록 등)은 계약종별·작업구분·시설형태를 **코드로만** 준다.
  코드표가 없으면 매번 우리 데이터에서 역추정해야 한다(2026-09-09 에 계약종별 610 을
  가리는 데 그렇게 했다 — 종로 원장이 '610 가로등(을)' 형태로 코드+명칭을 함께 담고 있어
  겨우 확정했다). 이 스크립트로 원천을 통째 받아 두면 추정이 필요 없다.

세션
  ~/.awms-tokens/fmpmtr.json 의 JSESSIONID 를 쓴다(아미큐 맥세션 이식분도 동일).
  만료 시 scripts/hapdong/pull_session.py 또는 아미큐 백엔드 session.json 에서 이식.

사용
  python3 scripts/fetch_awms_codes.py            # 3개 앱 전부 받아 적재
  python3 scripts/fetch_awms_codes.py --show CI007   # 적재된 코드군 조회

★앱마다 코드 집합이 다르다 — 통신팀(mob/cst)과 계기팀(mob/mtr)은 별개 프로그램이다.
  계약종별(CI007)은 mob/mtr 쪽에만 있다.
"""
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

KST = ZoneInfo('Asia/Seoul')
ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data' / 'ami.db'
TOKEN = Path.home() / '.awms-tokens' / 'fmpmtr.json'

SOURCES = [
    ('mobMtr1000', 'https://awms.kdn.com/ami/mob/mtr/mobMtr1000/getCommonCode', 'MOBMTR'),
    ('mobCst1000', 'https://awms.kdn.com/ami/mob/cst/mobCst1000/getCommonCode', 'MOBCST'),
    ('mobCst3000', 'https://awms.kdn.com/ami/mob/cst/mobCst3000/getCommonCode', 'MOBCST'),
]


def _num(v):
    """CODE_NO 는 빈 문자열로 오는 행이 있다(정렬용 값이라 없어도 무해)."""
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def fetch(url, app, sid):
    req = urllib.request.Request(url, headers={
        'Accept': 'application/json, text/plain, */*',
        'Referer': f'https://awms.kdn.com/html/main/index.html?app={app}&menu=01010000',
        'User-Agent': ('Mozilla/5.0 (Linux; Android 16; SM-A336N) AppleWebKit/537.36 '
                       '(KHTML, like Gecko) Chrome/150 Mobile Safari/537.36'),
        'Cookie': f'JSESSIONID={sid}',
    })
    with urllib.request.urlopen(req, timeout=90) as r:
        body = r.read().decode('utf-8')
    data = json.loads(body)
    if not isinstance(data, list):
        raise RuntimeError(f'배열이 아님 (세션 만료 의심): {body[:200]}')
    return data


def main():
    if '--show' in sys.argv:
        pc = sys.argv[sys.argv.index('--show') + 1]
        c = sqlite3.connect(DB)
        for r in c.execute('select src, p_code_nm, c_code, c_code_nm from awms_code '
                           'where p_code=? order by code_no', (pc,)):
            print(' ', r[0], r[1], r[2], r[3])
        return

    if not TOKEN.exists():
        sys.exit(f'세션 파일 없음: {TOKEN}')
    sid = json.loads(TOKEN.read_text())['JSESSIONID']

    rows = []
    for src, url, app in SOURCES:
        try:
            got = fetch(url, app, sid)
        except urllib.error.HTTPError as e:
            sys.exit(f'{src} HTTP {e.code} — 세션 만료 의심. pull_session.py 먼저 실행')
        print(f'  {src}: {len(got)}행')
        for x in got:
            rows.append((src, x.get('P_CODE'), x.get('P_CODE_NM'), x.get('C_CODE'),
                         x.get('C_CODE_NM'), x.get('CODE_DIV'),
                         _num(x.get('CODE_NO')),
                         x.get('USE_YN')))

    now = datetime.now(KST).isoformat()
    c = sqlite3.connect(DB)
    c.execute('''create table if not exists awms_code (
        src text, p_code text, p_code_nm text, c_code text, c_code_nm text,
        code_div text, code_no integer, use_yn text, fetched_at text,
        primary key (src, p_code, c_code))''')
    c.execute('create index if not exists idx_awms_code_p on awms_code(p_code)')
    c.execute('create index if not exists idx_awms_code_c on awms_code(c_code)')
    c.executemany('insert or replace into awms_code values (?,?,?,?,?,?,?,?,"' + now + '")', rows)
    c.commit()
    n = c.execute('select count(*) from awms_code').fetchone()[0]
    g = c.execute('select count(distinct p_code) from awms_code').fetchone()[0]
    print(f'적재 완료: {n}행 / 코드군 {g}개 -> {DB}')


if __name__ == '__main__':
    main()
