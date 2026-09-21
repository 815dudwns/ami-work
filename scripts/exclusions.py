#!/usr/bin/env python3
"""제외축 정의 + 제외 이력 누적 (영준님 2026-09-20 "제외된 사유 리스트 잘 관리해").

왜 만들었나
  하루 만에 축이 6개에서 8개로 늘었고 제외분 파일이 7개로 흩어졌다. 스키마가 제각각이라
  '이 계기가 왜 빠졌나' 를 되짚으려면 파일 7개를 열어 봐야 했다. 한 건이 두 축에 걸리는
  일도 실제로 나왔다(27450067009 — 26년신설 축과 계기번호오류 축 양쪽).

구조
  · 축 정의   = 이 파일의 RULES (정본). -> data/exclusion_rules.json + ami.db 테이블
  · 제외 이력 = data/exclusions.json (정본) + ami.db 테이블 exclusions (사본, SQL 조회용)
  · 빌더가 제외할 때마다 stage() 로 쌓고, 끝에 flush() 로 자기 리스트 몫만 갈아끼운다.
    ★축이 새로 생겨도 사람이 파일을 만들 필요가 없다 — 빌더가 스스로 기록한다.
  · 빌더 **밖**에서 걸러진 축(고압·Sheet2·26년보강시공 등)은
    scripts/build_exclusions_index.py 가 원장·DB 로 재현해 합친다.

★한 건이 여러 축에 걸리면 **행을 나눠 전부 남긴다.**
  빌더는 첫 축에서 멈추지만(총합이 어긋나지 않게), 기록은 전부 남아야 나중에 한 축을
  되살릴 때 '다른 축에도 걸려 있으니 되살리면 안 된다' 를 알 수 있다.

★기존 research/*제외*.json 은 지우지 않는다 — 감사 흔적이다. 인덱스가 그것을 흡수한다.
"""
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data/exclusions.json'
RULES_OUT = ROOT / 'data/exclusion_rules.json'
DB = ROOT / 'data/ami.db'
STAGE_DIR = ROOT / 'data/.exclusions-stage'      # 빌더가 자기 몫을 떨구는 곳

L_MICH = '25미청구'
L_BULGA = '25년불가'

# ─── 축 정의 (정본) ──────────────────────────────────────────────────────────
#   순서 = 실제 빌더 적용 순서. 한 건이 여러 축이면 **순서가 빠른 축**이 총합을 가져간다.
RULES = [
    # ---- 25미청구 ----
    dict(축코드='M1', 대상리스트=L_MICH, 축이름='고압',
         정의='한전 회신 고압 표기 — 건물 변압기 모자분리라 DCU 계통이 아니다',
         판정방법="원장 25년_ami_보강공사_미청구2__sheet1 에서 상태='미청구' 이고 공종='고압'",
         적용순서=1, 근거='영준님·주덕기 과장 판단 일치 2026-09-18',
         되살리는법='되살릴 일 없음 (고압은 별도 사업)', 공용함수명=''),
    dict(축코드='M2', 대상리스트=L_MICH, 축이름='Sheet2',
         정의='원본 2번 시트 — 그 계기에 신규·신설 시공행 자체가 없어 청구 근거가 없다',
         판정방법='25년_ami_보강공사_미청구2__sheet2 에 실린 계기',
         적용순서=2, 근거='필터역산 2026-09-17 (research/미청구-필터역산-보고-20260917.md)',
         되살리는법='과장과 판단 일치 — 되살릴 일 없음', 공용함수명=''),
    dict(축코드='M3', 대상리스트=L_MICH, 축이름='26년 보강 시공',
         정의='이미 26년 자재로 시공됐다 — 계기번호가 awms 시공기록에 직접 있다',
         판정방법='modem_work_all 에 계기번호_norm 직접 매칭, 작업일자 2026-06-08~2026-09-18',
         적용순서=3, 근거='PM 2026-09-18', 되살리는법='—', 공용함수명=''),
    dict(축코드='M4', 대상리스트=L_MICH, 축이름='미연계',
         정의="과장이 9/20 자료에서 '미연계' 시트로 분리해 보낸 개소",
         판정방법='DB 테이블 미연계 의 계기번호',
         적용순서=4, 근거='영준님 확정 2026-09-20 (뜻은 과장 회신 대기)',
         되살리는법='build_michunggu_dataset_20260918.py 의 EXCLUDE_MIYEONGYE=False'
                    ' · 제외분 research/미청구_미연계제외_20260920.json',
         공용함수명=''),
    dict(축코드='M5', 대상리스트=L_MICH, 축이름='계기번호 오타',
         정의='형태 법칙 위반 — MAC·고객번호로 역추적해도 정답을 특정 못 했다',
         판정방법='build_michunggu_dataset_20260918.py 의 METER_TYPO_EXCLUDE 목록',
         적용순서=5, 근거='PM 2026-09-20',
         되살리는법='METER_TYPO_EXCLUDE 에서 빼면 된다 · 3건은 과장 문의 중(METER_PENDING)',
         공용함수명=''),
    # ---- 공통 축 (두 리스트가 같은 함수를 쓴다) ----
    dict(축코드='C1', 대상리스트='공통', 축이름='계기번호 타입코드 오류',
         정의='계기번호 3~4번째 타입코드가 대장에 단 1건도 없다 = 오타',
         판정방법='boranggi 66만행에서 타입코드 집합을 뽑아 쓴다(하드코딩 X).'
                  ' 표본 5건 미만 코드는 로그로 찍어 사람이 본다',
         적용순서=6, 근거='영준님 2026-09-20 "계기번호 오류면 다 빼"',
         되살리는법='research/계기번호오류제외_20260920.json',
         공용함수명='meter_code_bad'),
    dict(축코드='C2', 대상리스트='공통', 축이름='S(표준형) 계기',
         정의='계기타입이 S(표준형)면 코드가 무엇이든 제외',
         판정방법='계기타입 문자열 정확일치(S/표준형/S타입/표준형계기, 대소문자·공백 무시).'
                  ' ★타입코드로 걸면 틀린다 — 35·15·34·14 에 흩어져 있다',
         적용순서=7, 근거='영준님 2026-09-20 "S타입 표준형이면 다 빼"',
         되살리는법='research/S표준형제외_20260920.json',
         공용함수명='standard_type_bad'),
    dict(축코드='C3', 대상리스트='공통', 축이름='계기번호 오류 계열',
         정의="불가사유·불가상세에 현장이 '번호가 틀렸다' 고 적은 건",
         판정방법="(불가사유+불가상세) 공백 제거 문자열. 우선순위 오계기 -> 계기번호오류"
                  " -> 각인번호오류 -> 계기번호불일치. ★'주소불일치' 는 빼지 않는다",
         적용순서=8, 근거='영준님 2026-09-20 "필터해"',
         되살리는법='research/계기번호오류계열제외_20260920.json (유형 칸 + 현장계기번호_추정)',
         공용함수명='meter_err_bad'),
    dict(축코드='C4', 대상리스트='공통', 축이름='26년 신설(고객번호 경유)',
         정의='계기번호로는 안 걸리는데 고객번호로 보강현황을 거치면 26년 시공 개소다',
         판정방법='고객번호 -> boranggi 의 (철거)계기번호 열 -> modem_work_all.'
                  ' ★신설만 뺀다. 기설은 우리가 갈아야 할 25년 모뎀에 계기가 추가된 것이라 남긴다',
         적용순서=9, 근거='영준님 2026-09-20',
         되살리는법='research/미청구_고객번호경유_26년신설제외_20260920.json (유지분도 함께)',
         공용함수명='via_cust_26_hits'),
    # ---- 25년불가 ----
    dict(축코드='B1', 대상리스트=L_BULGA, 축이름='고압',
         정의='불가 원장의 공종 열이 고압 — 미청구 M1 과 같은 성격',
         판정방법="25년_보강_불가__sheet1 에서 공종='고압'",
         적용순서=1, 근거='2026-09-18 확정', 되살리는법='—', 공용함수명=''),
    dict(축코드='B2', 대상리스트=L_BULGA, 축이름='불가사유 분류',
         정의='사유 조합을 대상/제외로 분류 — 다시 가거나 26년 자재로 해결되면 대상,'
              ' 물리적 불가·설비 파손·대상 소멸이면 제외',
         판정방법='research/불가사유_분류_확정_20260920.json 의 (b1,b2) 조합별 분류',
         적용순서=2, 근거='영준님 101종 직접 분류 + 5건 미만은 PM 2026-09-20',
         되살리는법='분류 정본의 해당 조합을 대상 으로 바꾸면 된다', 공용함수명=''),
    dict(축코드='B3', 대상리스트=L_BULGA, 축이름='중복',
         정의='awms 시공기록·실효·합동 아카이브·25미청구 대상과 겹치는 계기',
         판정방법='modem_work(20260908·20260920) · site-data · hapdong archive · michunggu',
         적용순서=3, 근거='발주 2026-09-20', 되살리는법='—', 공용함수명=''),
    dict(축코드='B4', 대상리스트=L_BULGA, 축이름='14·15년 노후계기',
         정의='불가상세에 14·15년 계기로 표기된 건 — 노후라 곧 교체되니 모뎀을 달아도 청구가 안 된다',
         판정방법='①14/15 뒤 년(도) + 계기|E타입 ②14계기/15계기 로 시작 ③14년도/15년도.'
                  " ★'1509 실효예정계기'(코드) 같은 다른 뜻 23건은 빼지 않는다",
         적용순서=4, 근거='영준님 2026-09-20',
         되살리는법='research/미청구불가_노후계기제외_20260920.json'
                    ' · 판정 정본의 사유조합 8종을 대상 으로 되돌리면 된다',
         공용함수명=''),
    dict(축코드='B5', 대상리스트=L_BULGA, 축이름='계기번호 오타',
         정의='형태 법칙 위반 — 정답이 이미 다른 번호로 처리돼 있다',
         판정방법='build_michunggu_bulga_20260920.py 의 METER_TYPO_EXCLUDE 목록',
         적용순서=5, 근거='PM 2026-09-20',
         되살리는법='METER_TYPO_EXCLUDE 에서 빼면 된다', 공용함수명=''),
    dict(축코드='B6', 대상리스트=L_BULGA, 축이름='25년 청구 겹침(고객번호 경유)',
         정의='같은 고객번호에 25년에 이미 청구된 다른 계기가 있고,'
              ' 현장도 불가상세에 교체·기설치라고 적은 건',
         판정방법='고객번호 -> 원장(20260227다운로드…)에서 col_15=청구 인 다른 계기 존재'
                  " **AND** 불가상세에 교체 표현(기설치|계기교체|계기변경|교체기설)."
                  ' ★둘 중 하나만으로는 안 뺀다 — 겹침만 있는 21건은 근거가 부족하다'
                  '(기계식 4 · 문잠김/주차 5 · 계기못찾음 8 · 기타 4)',
         적용순서=6, 근거='영준님 2026-09-21 "7건만 빼고 푸시해"',
         되살리는법='research/불가_25청구겹침_28건분석_20260921.txt 에 28건 전량 분석이 있다',
         공용함수명='billed_overlap_bad'),
    dict(축코드='B7', 대상리스트=L_BULGA, 축이름='기설(이미 설치됨)',
         정의='현장이 불가사유·불가상세에 "이미 설치돼 있다" 고 적은 건 — 우리가 또 갈 일이 없다',
         판정방법='(불가사유+불가상세) 공백 제거 문자열에 기설|기시설|기서치|긷설,'
                  " 또는 문자열이 정확히 '기타6차'(6차기설치 축약)."
                  " ★'기타cnu1차' 는 제외 대상이 아니다(씨앤유 계기 건, 실측 18건 0매칭)",
         적용순서=7, 근거='영준님 2026-09-21 "6차기설치도 다 제외해야하는것같아"'
                          ' + "비스무리한것도 다 서치해야해"',
         되살리는법='data/exclusions.json 에서 축코드 B7 로 조회', 공용함수명='gisul_bad'),
    dict(축코드='B8', 대상리스트=L_BULGA, 축이름='계기교체됨',
         정의='현장이 계기가 교체됐다고 적은 건',
         판정방법='(불가사유+불가상세) 공백 제거 문자열에 계기교체|교체계기|>>.'
                  ' ★B6 와 축을 가른다 — B6 는 원장 청구라는 외부 근거가 붙은 2조건 판정이고'
                  ' 여기는 현장 문구뿐이다. 근거 강도가 달라 되살릴 때 구분돼야 한다',
         적용순서=8, 근거='영준님 2026-09-21',
         되살리는법='data/exclusions.json 에서 축코드 B8 로 조회', 공용함수명='swapped_bad'),
    dict(축코드='M6', 대상리스트=L_MICH, 축이름='고객번호 경유 후속 청구',
         정의='같은 고객번호의 다른 계기가 **우리 시공 이후에** 작업되고 청구까지 갔다. 그 개소는 이미 정리돼 우리가 또 갈 일이 없다',
         판정방법='고객번호로 원장·보강현황에서 다른 계기를 찾고, **그 계기번호로 원장을 다시 조회해** 청구 여부를 판정한다(계기 단위). 날짜는 max(원장 시공일2, 보강 계기교체일). 우리 시공일보다 나중일 때만. ★작업만 되고 청구 안 된 건은 빼지 않는다. ★번호가 1~2자리만 다르면 의심 표식으로만 보고, 보강현황에 계기교체일·모뎀MAC 이 둘 다 있으면 실재하는 계기라 정상 제외 · 없으면 오타 의심으로 남긴다',
         적용순서=10, 근거='영준님 2026-09-21 계기교체건 청구된거 빼',
         되살리는법='research/고객번호경유_후속청구제외_20260921.json (간격일·상대계기·상대작업일 · 181일 초과는 장기간격 표식)',
         공용함수명='followup_billed_bad'),
    dict(축코드='B9', 대상리스트=L_BULGA, 축이름='고객번호 경유 후속 청구',
         정의='같은 고객번호의 다른 계기가 **우리 시공 이후에** 작업되고 청구까지 갔다. 그 개소는 이미 정리돼 우리가 또 갈 일이 없다',
         판정방법='고객번호로 원장·보강현황에서 다른 계기를 찾고, **그 계기번호로 원장을 다시 조회해** 청구 여부를 판정한다(계기 단위). 날짜는 max(원장 시공일2, 보강 계기교체일). 우리 시공일보다 나중일 때만. ★작업만 되고 청구 안 된 건은 빼지 않는다. ★번호가 1~2자리만 다르면 의심 표식으로만 보고, 보강현황에 계기교체일·모뎀MAC 이 둘 다 있으면 실재하는 계기라 정상 제외 · 없으면 오타 의심으로 남긴다',
         적용순서=10, 근거='영준님 2026-09-21 계기교체건 청구된거 빼',
         되살리는법='research/고객번호경유_후속청구제외_20260921.json (간격일·상대계기·상대작업일 · 181일 초과는 장기간격 표식)',
         공용함수명='followup_billed_bad'),
]
RULE_BY_CODE = {r['축코드']: r for r in RULES}


# ─── 빌더가 쓰는 기록 API ────────────────────────────────────────────────────
# ★원본 레코드를 **통째로** 담는다(영준님 2026-09-21 "제외한 정보와 이유는 다 표시해 저장해라").
#   예전엔 필드를 골라 담았는데, 고를 때 판단이 들어가고 나중에 필요해진 필드는 이미 없다.
#   `원본` = 제외 시점의 그 계기 레코드 전체 · `원장원본` = 원장 행 전체(우리 리스트에 없는
#   정보가 거기 있다 — 상태·공종·구분·비고). ★열 이름이 비어 col_15 로 들어간 것도 그대로 둔다.
BUILDER_VERSION = '2026-09-21'


def _norm(m):
    s = re.sub(r'[\s\-]', '', str(m if m is not None else '')).strip()
    if not s or s.upper() in ('NAN', 'NONE', '#N/A', '0'):
        return ''
    return s.upper() if re.search(r'[A-Za-z]', s) else s.zfill(11)


_LEDGER_CACHE = {}


def ledger_rows(table):
    """계기번호_norm -> 원장 행(dict) 전체. 한 계기에 여러 행이면 전부 담는다."""
    if table in _LEDGER_CACHE:
        return _LEDGER_CACHE[table]
    con = sqlite3.connect(DB)
    c = con.cursor()
    try:
        names = [r[1] for r in c.execute(f'PRAGMA table_info("{table}")')]
        if not names:
            raise ValueError
        out = {}
        for row in c.execute(f'SELECT * FROM "{table}"'):
            d = dict(zip(names, row))
            k = _norm(d.get('계기번호'))
            if k:
                out.setdefault(k, []).append(d)
    except Exception:
        out = {}
    con.close()
    _LEDGER_CACHE[table] = out
    return out


def row(list_name, rule_code, rec, 사유상세='', 근거값='', 원장원본=None, 제외시각=''):
    """제외 한 건. rec 는 데이터셋 레코드(dict) — **통째로** 담는다."""
    rule = RULE_BY_CODE.get(rule_code, {})
    m = str(rec.get('계기번호') or '').strip()
    return {
        # 조회용으로 펼쳐 두는 열
        '계기번호': m, '계기번호_norm': _norm(m),
        '고객번호': rec.get('고객번호') or '', '지사': rec.get('지사') or '',
        '주소': rec.get('주소') or '',
        '원본리스트': list_name, '축코드': rule_code, '축이름': rule.get('축이름', ''),
        # ★사람이 읽는 이유 — 축코드만으로는 나중에 못 읽는다
        '사유': 사유상세 or rule.get('정의', ''),
        '판정근거': 근거값,
        '판정방법': rule.get('판정방법', ''),
        '되살리기': rule.get('되살리는법', ''),
        '지시근거': rule.get('근거', ''),
        # ★언제 판정한 것이냐
        '제외일자': (제외시각 or BUILDER_VERSION)[:10],
        '제외시각': 제외시각 or BUILDER_VERSION,
        '빌더버전': BUILDER_VERSION,
        # ★원본 통째
        '원본': dict(rec),
        '원장원본': 원장원본 if 원장원본 is not None else [],
    }


def attach_ledger(rows, table):
    """소급 포함 — 각 행에 원장 원본을 붙인다. 없으면 빈 리스트."""
    idx = ledger_rows(table)
    miss = 0
    for r in rows:
        if not r.get('원장원본'):
            got = idx.get(r['계기번호_norm'], [])
            r['원장원본'] = got
            if not got:
                miss += 1
    return miss


def stage(list_name, rows):
    """빌더가 제외할 때마다 부른다. 누적만 하고 파일은 인덱스 빌드에서 합친다."""
    STAGE_DIR.mkdir(exist_ok=True)
    p = STAGE_DIR / f'{list_name}.json'
    prev = json.loads(p.read_text()) if p.exists() else []
    p.write_text(json.dumps(prev + rows, ensure_ascii=False, indent=1))


def stage_reset(list_name):
    """빌더 시작 때 자기 몫을 비운다 — 재실행이 멱등이어야 한다."""
    STAGE_DIR.mkdir(exist_ok=True)
    (STAGE_DIR / f'{list_name}.json').write_text('[]')


def stage_load(list_name):
    p = STAGE_DIR / f'{list_name}.json'
    return json.loads(p.read_text()) if p.exists() else []


# ─── 인덱스 저장 ─────────────────────────────────────────────────────────────
def write_rules():
    out = [dict(r, 현재건수=None) for r in RULES]
    RULES_OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    return out


def write_index(rows, counts=None):
    INDEX.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    con = sqlite3.connect(DB)
    c = con.cursor()
    c.execute('DROP TABLE IF EXISTS exclusions')
    # ★조회용 열은 펼쳐 두고, 전문은 원본_json·원장원본_json 에 통째로 넣는다
    c.execute('CREATE TABLE exclusions (계기번호 TEXT, 계기번호_norm TEXT, 고객번호 TEXT,'
              ' 지사 TEXT, 주소 TEXT, 원본리스트 TEXT, 축코드 TEXT, 축이름 TEXT,'
              ' 사유 TEXT, 판정근거 TEXT, 판정방법 TEXT, 되살리기 TEXT, 지시근거 TEXT,'
              ' 제외일자 TEXT, 제외시각 TEXT, 빌더버전 TEXT,'
              ' 원본_json TEXT, 원장원본_json TEXT)')
    c.executemany('INSERT INTO exclusions VALUES (' + ','.join('?' * 18) + ')',
                  [(r['계기번호'], r['계기번호_norm'], r['고객번호'], r['지사'], r['주소'],
                    r['원본리스트'], r['축코드'], r['축이름'], r['사유'], r['판정근거'],
                    r['판정방법'], r['되살리기'], r['지시근거'],
                    r['제외일자'], r['제외시각'], r['빌더버전'],
                    json.dumps(r['원본'], ensure_ascii=False),
                    json.dumps(r['원장원본'], ensure_ascii=False)) for r in rows])
    for col in ('계기번호_norm', '고객번호', '축코드', '원본리스트'):
        c.execute(f'CREATE INDEX idx_excl_{col} ON exclusions("{col}")')
    c.execute('DROP TABLE IF EXISTS exclusion_rules')
    cols = list(RULES[0].keys()) + ['현재건수']
    c.execute('CREATE TABLE exclusion_rules (' + ','.join(f'"{x}" TEXT' for x in cols) + ')')
    c.executemany('INSERT INTO exclusion_rules VALUES (' + ','.join('?' * len(cols)) + ')',
                  [[str(r.get(x) if r.get(x) is not None else
                        (counts or {}).get(r['축코드'], '')) for x in cols] for r in RULES])
    con.commit()
    con.close()
