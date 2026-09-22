#!/usr/bin/env python3
"""25년 미청구불가 리스트업 (PM 발주 2026-09-20)

대상: 25년 불가(고압 제외) 중 사유조합이 '대상' 으로 판정된 계기에서 중복 제외.
  판정 정본 = research/불가사유_분류_확정_20260920.json (사유조합 945종, 분류 대상/제외)
  중복 제외축 = modem_work(20260908·20260920) · site-data · 합동 아카이브 · 미청구 대상

★리스트 데이터에 **판정 메타를 넣지 않는다**(영준님 2026-09-20).
  분류 정본의 `판정`(영준님/PM추정/PM판정)·`분류` 는 작업 이력이라 research/ 에만 둔다.
  지도 데이터셋에는 **결과만** — 대상으로 판정된 것만 싣고, 디테일에는 불가사유·불가상세만.
★모뎀 MAC 은 넣지 않는다 — 불가 건은 MAC 칸에 계기번호가 들어가 있다(11,009/11,015).
★변대주는 3축 교정 + dcu_master 조회를 거친다. 원장이 이름 칸에 전산화번호를 실어 보낸다
  (대상 5,856 중 8자리가 5,168 · 한글 이름은 21건뿐).
"""
import importlib.util
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import exclusions as EX   # 제외 이력 자동 누적(영준님 2026-09-20)
DB = ROOT / 'data/ami.db'
CLASS = ROOT / 'research/불가사유_분류_확정_20260920.json'
OUT = ROOT / 'data/michunggu-bulga-data.json'
OUT_PEND = ROOT / 'data/michunggu-bulga-pending.json'

_d = importlib.util.spec_from_file_location(
    'ds', str(ROOT / 'scripts/build_michunggu_dataset_20260918.py'))
D = importlib.util.module_from_spec(_d)
_d.loader.exec_module(D)          # log·blank·fix_bdju·load_dcu_master·gu_of 재사용
_h = D.H                           # 합동 빌더(좌표 파이프라인)
nm, log, blank = D.nm, D.log, D.blank


# ─── 계기번호 오타 제외 (PM 2026-09-20) ─────────────────────────────────────
# 형태 법칙 위반 6건을 MAC·고객번호로 역추적한 결과 4건은 **제대로 된 번호가 이미 처리돼
# 있었다.** 오타본을 그대로 두면 없는 계기를 현장에 보내게 된다.
# ★자동 교정은 하지 않는다 — 정답을 확인한 것만 이름으로 빼고 사유를 남긴다.
METER_TYPO_EXCLUDE = {
    '0753G186525': '정답 07530186525 — 원장 상태 청구완료',
    '071909442S1': '정답 02190944829 — awms 에 신설 2행·2026-09-08 개통',
    '2450090698': '정답 02450090698 — 원장 상태 청구완료',
    '9419007057': '정답 94199007057 — 같은 주소(중구 신당동 304-488)에 정상 번호가 이미 대상',
}


SEAL_EMPTY = {'9999999', '0000000', '000000', '9999999999'}


def seal(v):
    """봉인 — '9999999|' 처럼 구분자로 이어 붙어 온다. 실값만 남긴다.

    원본 5,695행 중 함체봉인1 이 구분자 '|' 뿐인 것이 5,626건이고,
    남은 69건도 9999999(64)·0000000(5) 로 **미입력 표기**다.
    그대로 그리면 전 건에 의미 없는 숫자가 붙는다(영준님 2026-09-20 판단 승인).
    """
    parts = [p.strip() for p in str(v if v is not None else '').split('|')]
    parts = [p for p in parts if p and p not in SEAL_EMPTY]
    return ' / '.join(dict.fromkeys(parts))


def boost_from_boranggi(recs):
    """보강현황에서 계기 부가정보를 채운다 (PM 발주 2026-09-20).

    ★불가는 보강 단계를 아예 안 돌렸었다 — 인입주·공동주택명·상호·계약종별·검침방법이
      통째로 0건이었다. 미청구에 쓴 로직을 그대로 태운다.
    ★매칭키는 **고객번호 전용**이다. 불가는 MAC 칸에 계기번호가 들어 있어 MAC 을 안 싣는다
      (=보조키가 없다). 대신 고객번호가 5,670/5,694 = 99.6% 라 미청구(87%)보다 키가 좋다.
      ★계기번호 단독 매칭은 금지 — 계기가 재사용돼 딴 개소에 살아 있어 오염이 17~51% 다.
    ★빈 칸만 채운다. 값이 있는데 다르면 덮지 않고 `<필드>_대안` 에 남긴다(판정은 나중에).
    ★변대주·DCU 계열은 건드리지 않는다 — 그건 대장이 원천이고 이미 들어가 있다.
    ★485타입은 못 채운다 — boranggi 에 그 열이 **없다**(미청구의 485타입은 원장 V열 유래).
    """
    FILL = ['인입주', '공동주택명', '상호', '계약종별', '검침방법']
    by_cust, _by_mac, _dn, _di = D.build_boranggi_index()

    # 도로명 — build_boranggi_index 의 rec 에는 없어 따로 색인한다(최신 판이 이긴다)
    road = {}
    c2 = sqlite3.connect(DB).cursor()
    for sn in [r[0] for r in c2.execute(
            'SELECT DISTINCT snapshot FROM boranggi ORDER BY snapshot DESC')]:
        for cust, rd in c2.execute(
                'SELECT 고객번호,도로명 FROM boranggi WHERE snapshot=?', (sn,)):
            cu, v = D.B.norm_cust(cust), blank(rd)
            if cu and v and cu not in road:
                road[cu] = (v, f'boranggi:{sn}')

    before = {f: sum(1 for x in recs if str(x.get(f) or '').strip())
              for f in FILL + ['도로명주소']}
    filled, alt, nokey, nohit = Counter(), Counter(), 0, 0
    for x in recs:
        cu = D.B.norm_cust(x.get('고객번호'))
        if not cu:
            nokey += 1
            continue
        hit = by_cust.get(cu)
        if not hit and cu not in road:
            nohit += 1
            continue
        if hit:
            rec, src = hit
            for f in FILL:
                v = rec.get(f)
                if not v:
                    continue
                cur = str(x.get(f) or '').strip()
                if not cur:
                    x[f] = v
                    x[f + '출처'] = f'{src}/고객번호'
                    filled[f] += 1
                elif D._norm_cmp(cur) != D._norm_cmp(v) and not x.get(f + '_대안'):
                    x[f + '_대안'] = v
                    x[f + '_대안출처'] = f'{src}/고객번호'
                    alt[f] += 1
        if cu in road and not str(x.get('도로명주소') or '').strip():
            x['도로명주소'], s = road[cu][0], road[cu][1]
            x['도로명주소출처'] = f'{s}/고객번호'
            filled['도로명주소'] += 1
    after = {f: sum(1 for x in recs if str(x.get(f) or '').strip())
             for f in FILL + ['도로명주소']}
    log(f'보강현황 보강 — 고객번호 없음 {nokey:,} · 매칭 실패 {nohit:,}')
    for f in FILL + ['도로명주소']:
        log(f'  {f:8s} {before[f]:5,} -> {after[f]:5,}  (+{filled[f]:,}'
            + (f' · 대안 {alt[f]:,}' if alt[f] else '') + ')')
    return before, after


def main():
    EX.stage_reset(EX.L_BULGA)   # 재실행이 멱등이어야 한다
    con = sqlite3.connect(DB)
    c = con.cursor()

    # ── 대상 사유조합 ────────────────────────────────────────────────────────
    cls = json.loads(CLASS.read_text())
    keep_pairs = {(x['b1'], x['b2']) for x in cls if x.get('분류') == '대상'}
    log(f'사유조합 {len(cls):,}종 중 대상 {len(keep_pairs):,}종')

    rows = [dict(zip([d[0] for d in c.description], r)) for r in c.execute(
        'SELECT * FROM "25년_보강_불가__sheet1"')]
    log(f'25년 불가 원장 {len(rows):,}행')

    # 고압 제외 — 불가 행의 공종열 기준(9/18 에 확정한 정의)
    hv = {nm(r['계기번호']) for r in rows if str(r.get('공종') or '').strip() == '고압'}
    hv.discard('')

    per = {}
    st = Counter()
    for r in rows:
        m = nm(r.get('계기번호'))
        if not m or m in hv:
            st['고압/무효' if m else '계기번호 없음'] += 1
            continue
        # ★사유는 비고1·비고2 다(발주서 표기 그대로). 불가개소 테이블의
        #   '불가,철거사유' 와 열 이름이 다르니 헷갈리지 마라 — 여기는 25년 불가 원장이다.
        b1 = str(r.get('비고1') or '').strip()
        b2 = str(r.get('비고2') or '').strip()
        if (b1, b2) not in keep_pairs:
            st['사유조합이 제외'] += 1
            continue
        if m in {nm(k) for k in METER_TYPO_EXCLUDE}:
            st['계기번호 오타(정답 이미 처리)'] += 1
            continue
        if m in per:
            st['같은 계기 중복행'] += 1
            continue
        per[m] = {'_m': m, 'r': r, 'b1': b1, 'b2': b2}
    log(f'고압 제외 후 대상 사유 계기 {len(per):,}  ({dict(st.most_common())})')

    # ── 중복 제외축 ─────────────────────────────────────────────────────────
    dedup = {}
    for lab, q in (('modem_work 20260908', "SELECT 계기번호 FROM modem_work WHERE snapshot='20260908'"),
                   ('modem_work 20260920', "SELECT 계기번호 FROM modem_work WHERE snapshot='20260920'")):
        dedup[lab] = {nm(x[0]) for x in c.execute(q)} - {''}
    for lab, f in (('site-data', 'data/site-data.json'),
                   ('합동 아카이브', 'data/hapdong-data-archive.json')):
        p = ROOT / f
        s = set()
        if p.exists():
            for x in json.loads(p.read_text()):
                for k in ('계기번호', '계기번호_전'):
                    v = nm(x.get(k))
                    if v:
                        s.add(v)
        dedup[lab] = s
    mich = set()
    for f in ('data/michunggu-data.json', 'data/michunggu-pending.json'):
        p = ROOT / f
        if p.exists():
            mich |= {nm(x['계기번호']) for x in json.loads(p.read_text())}
    dedup['미청구 대상'] = mich

    claimed, drop = set(), Counter()
    for lab, s in dedup.items():
        hit = (set(per) & s) - claimed
        claimed |= hit
        drop[lab] = len(hit)
    keep = [v for k, v in per.items() if k not in claimed]
    log(f'중복 제외 {len(claimed):,} ({dict(drop)}) -> 최종 {len(keep):,}계기')

    # ── 레코드 ──────────────────────────────────────────────────────────────
    recs = []
    for v in keep:
        r = v['r']
        bd = str(r.get('기존변대주') or '').strip()
        recs.append({
            # ★주소 앞에 '우선_0611_' 같은 **작업 태그**가 붙어 온다 — 주소의 일부가 아니다.
            #   미청구 빌더와 같은 TAG_RE 를 쓴다(실측 4건).
            '지사': blank(r.get('2차사업소')),
            '주소': D.clean_addr(blank(r.get('주소'))), '도로명주소': '',
            '계기번호': str(r.get('계기번호') or '').strip(),
            '계기타입': blank(r.get('계기타입')), '고객번호': D.B.norm_cust(r.get('고객번호')) or '',
            '통신방식': blank(r.get('통신방식')),
            '변대주': bd if bd != '0' else '', '변대주번호': '', 'DCUID': blank(r.get('DCU')),
            # ★불가 리스트에는 모뎀 MAC 을 넣지 않는다(MAC 칸에 계기번호가 들어 있다)
            '불가사유': v['b1'], '불가상세': v['b2'],
            '시설형태': blank(r.get('시설형태')), 'M/S': blank(r.get('M/S')),
            '집단': blank(r.get('집/단')), '485타입': blank(r.get('485타입')),
            '케이블': blank(r.get('케이블')),
            # 원본에 값이 있는 업무 열은 전부 싣는다(영준님 2026-09-20 '내가 빼란 것 빼고').
            #   커넥터·신호레벨·앱변대주는 이 원본에 **0건**이라 열 자체를 만들지 않는다.
            '추가계기': blank(r.get('추가계기')),
            '인입주': '', '계약종별': '', '검침방법': '',
            '공동주택명': '', '상호': '',
            '최종시공일': blank(r.get('시공일')), '구분': blank(r.get('구분')),
            '공종': blank(r.get('공종')), 'dcu_철거예정': '',
            # ── 계기에 딸린 원장 열 전부 (영준님 2026-09-20 '불가에 들어갈 디테일도 다 넣어')
            #   PM 승인(2026-09-20)으로 뺀 것:
            #     고유키·현장구분·현장구분코드·1차사업소·col_15 — 전 건 같은 값이라 정보량 0
            #     시공일2 — 시공일과 **전 건 동일**(다른 행 0)
            #     변경변대주 — 변대주 계열은 대장이 원천이라 건드리지 않는다
            #     MAC — 5,691/5,695 가 계기번호와 같다(원본이 MAC 칸에 계기번호를 넣었다)
            #     시공자·철거작업자·작업자맥 — 작업자 정보 / 기성완료 — 청구 관리용
            '앱넘버': blank(r.get('앱넘버')), '순번': blank(r.get('순번')),
            '우선일자': blank(r.get('우선일자')),
            # ★봉인은 원본이 '9999999|' 처럼 **구분자 '|' 로 이어 붙은** 형태다.
            #   구분자만 남은 칸이 5,626건이고, 9999999·0000000 은 미입력 표기다 —
            #   그대로 그리면 5,694건 전부에 의미 없는 숫자가 붙는다. 실값만 남긴다(69+5건).
            '함체봉인1': seal(r.get('함체봉인1')), '함체봉인2': seal(r.get('함체봉인2')),
            '계기봉인1': seal(r.get('계기봉인1')), '계기봉인2': seal(r.get('계기봉인2')),
            '외부봉인1': seal(r.get('외부봉인1')), '외부봉인2': seal(r.get('외부봉인2')),
            # 원본 0건이지만 칸은 둔다 — 다음 판에 값이 오면 코드를 안 고치고 그대로 나온다
            '커넥터': blank(r.get('커넥터')), '신호레벨': blank(r.get('신호레벨')),
            '앱변대주': blank(r.get('앱변대주')), '지도구분': blank(r.get('지도구분')),
            '철거구분': blank(r.get('철거구분')), '철거날짜': blank(r.get('철거날짜')),
        })

    # ── 변대주 3축 교정 + 대장 조회 ─────────────────────────────────────────
    by_id, by_no, by_name = D.load_dcu_master()
    D.fix_bdju(recs, by_id, by_no, by_name)

    # ── 보강현황 보강 — 좌표 **전**에 돌린다(도로명이 지오코딩 입력이다) ──────
    boost_from_boranggi(recs)

    # ── 제외축: 계기번호 타입코드 오류 (영준님 2026-09-20) ───────────────────
    #   판정은 미청구 빌더와 **같은 함수**를 쓴다. 두 리스트에 다른 잣대를 대지 않는다.
    _bad = D.meter_code_bad(recs)
    if _bad:
        _bset = {nm(r['계기번호']) for r, _ in _bad}
        log(f'계기번호 타입코드 오류 {len(_bad)}건 제외:')
        for r, ev in _bad:
            log(f"   {r['계기번호']} 코드={ev['타입코드']} 타입={r.get('계기타입')}"
                f" — {ev['판정근거']}")
        D.meter_code_write('25년 미청구불가', _bad)
        EX.stage(EX.L_BULGA, [EX.row(EX.L_BULGA, 'C1', r,
            f"계기번호 3~4번째 타입코드가 '{ev['타입코드']}' 인데 대장(boranggi 66만행)에"
            f" 단 1건도 없다 = 계기번호 오타다. {ev['판정근거']}",
            f"타입코드 {ev['타입코드']} · 대장 0건") for r, ev in _bad])
        recs = [x for x in recs if nm(x['계기번호']) not in _bset]
        keep = [v for v in keep if v['_m'] not in _bset]   # 게이트 기대치도 같이 줄인다

    # ── 제외축: 25년 청구 겹침(고객번호 경유) — 영준님 2026-09-21 ────────────
    #   ★겹침 **AND** 교체표현 둘 다일 때만 뺀다. 겹침만 있는 21건은 근거가 부족하다.
    _bo = D.billed_overlap_bad(recs)
    if _bo:
        _boset = {nm(r['계기번호']) for r, _ in _bo}
        log(f'25년 청구 겹침(고객번호 경유) {len(_bo)}건 제외')
        for r, ev in _bo:
            log(f"   {r['계기번호']} cust={r.get('고객번호')}"
                f" 청구계기={','.join(ev['청구계기'])} | {r.get('불가상세')}")
        EX.stage(EX.L_BULGA, [EX.row(
            EX.L_BULGA, 'B6', r,
            사유상세=(f"고객번호 {r.get('고객번호')} 로 원장을 보면 같은 개소 계기"
                      f" {', '.join(ev['청구계기'])} 이(가) 이미 상태=청구 다."
                      f" 불가상세 \"{r.get('불가상세')}\" 의 '{ev['표현']}' 가 교체 표현에 해당한다"),
            근거값=f"청구계기 {','.join(ev['청구계기'])} · 표현 '{ev['표현']}'")
            for r, ev in _bo])
        recs = [x for x in recs if nm(x['계기번호']) not in _boset]
        keep = [v for v in keep if v['_m'] not in _boset]

    # ── 제외축: 기설(이미 설치됨) · 계기교체됨 — 영준님 2026-09-21 ──────────
    for code, fn, label in (('B7', D.gisul_bad, '기설(이미 설치됨)'),
                            ('B8', D.swapped_bad, '계기교체됨')):
        hits = fn(recs)
        if not hits:
            log(f'{label} 0건')
            continue
        hset = {nm(r['계기번호']) for r, _ in hits}
        log(f'{label} {len(hits):,}건 제외'
            f' — 걸린 문구 {dict(Counter(k for _, k in hits).most_common(5))}')
        EX.stage(EX.L_BULGA, [EX.row(
            EX.L_BULGA, code, r,
            사유상세=(f'현장이 적은 "{r.get("불가사유")} / {r.get("불가상세")}" 에서'
                      f' \'{k}\' 에 걸렸다.'
                      + (' 이미 설치된 개소라 우리가 또 갈 일이 없다.' if code == 'B7'
                         else ' 계기가 이미 교체된 개소다.')),
            근거값=f'문구 \'{k}\' · 원문 {r.get("불가상세")}') for r, k in hits])
        recs = [x for x in recs if nm(x['계기번호']) not in hset]
        keep = [v for v in keep if v['_m'] not in hset]

    # ── 제외축: S(표준형) 계기 (영준님 2026-09-20) ──────────────────────────
    #   판정은 미청구 빌더와 **같은 함수**를 쓴다.
    _std = D.standard_type_bad(recs)
    if _std:
        _sset = {nm(r['계기번호']) for r, _ in _std}
        log(f'S(표준형) 계기 {len(_std)}건 제외'
            f' — 타입코드 {dict(Counter(str(r["계기번호"])[2:4] for r, _ in _std).most_common())}')
        D.standard_type_write('25년 미청구불가', _std)
        EX.stage(EX.L_BULGA, [EX.row(EX.L_BULGA, 'C2', r,
            f"계기타입이 '{v}'(표준형)다. 코드가 무엇이든 표준형이면 제외하라는 지시다"
            f" — 이 리스트에서는 타입코드 35·15·34·14 에 흩어져 있다.",
            f'계기타입={v}') for r, v in _std])
        recs = [x for x in recs if nm(x['계기번호']) not in _sset]
        keep = [v for v in keep if v['_m'] not in _sset]
    else:
        log('S(표준형) 계기 0건')

    # ── 제외축: 계기번호 오류 계열 (영준님 2026-09-20) ──────────────────────
    #   판정은 미청구 빌더와 **같은 함수**를 쓴다.
    _err = D.meter_err_bad(recs)
    if _err:
        _eset = {nm(r['계기번호']) for r, _ in _err}
        log(f'계기번호 오류 계열 {len(_err)}건 제외'
            f' — {dict(Counter(k for _, k in _err).most_common())}')
        D.meter_err_write('25년 미청구불가', _err)
        EX.stage(EX.L_BULGA, [EX.row(EX.L_BULGA, 'C3', r,
            f"현장이 불가상세에 번호가 틀렸다고 적었다(유형 {k})."
            f" 원문: \"{r.get('불가사유')} / {r.get('불가상세')}\"",
            f"유형 {k} · 원문 {r.get('불가상세')}") for r, k in _err])
        recs = [x for x in recs if nm(x['계기번호']) not in _eset]
        keep = [v for v in keep if v['_m'] not in _eset]
    else:
        log('계기번호 오류 계열 0건')
    _hint = 0
    for x in recs:
        mv, kv = D.field_meter_hint(x)
        if mv:
            x['현장계기번호_추정'] = mv
        if kv:
            x['현장모뎀MAC_추정'] = kv
        if mv or kv:
            _hint += 1
    if _hint:
        log(f'  현장계기번호_추정 담은 건 {_hint}(리스트에 남는 건 기준)')

    # ── 제외축: 고객번호 경유 26년 신설 (영준님 2026-09-20) ──────────────────
    #   판정은 미청구 빌더와 **같은 함수**를 쓴다. 두 리스트에 다른 잣대를 대지 않는다.
    #   ★신설만 뺀다. 기설은 우리가 갈아야 할 25년 모뎀에 계기가 추가된 것이라 남긴다.
    _drop, _keep = D.via_cust_26_hits(recs)
    if _drop or _keep:
        _dset = {nm(r['계기번호']) for r, _ in _drop}
        log(f'고객번호경유 26년시공 — 신설 {len(_drop)}건 **제외**'
            f' · 기설 {len(_keep)}건 **유지**')
        D.via_cust_write('25년 미청구불가', _drop, _keep)
        EX.stage(EX.L_BULGA, [EX.row(EX.L_BULGA, 'C4', r,
            f"고객번호 {r.get('고객번호')} 로 보강현황을 거쳐 같은 개소의 계기"
            f" {ev['awms계기']} 를 찾았고, 그 계기가 awms 에 '{ev['작업구분']}' 으로"
            f" {str(ev['작업일'])[:10]} 에 시공돼 있다. 계기가 교체돼 번호가 바뀐 개소다.",
            f"awms계기 {ev['awms계기']} · {str(ev['작업일'])[:10]} · {ev['작업구분']}")
                              for r, ev in _drop])
        recs = [x for x in recs if nm(x['계기번호']) not in _dset]
        keep = [v for v in keep if v['_m'] not in _dset]     # 게이트 기대치도 같이 줄인다

    # ── 제외축: 마스터만 미청구 · 함체 슬레이브 전부 청구 (영준님 2026-09-22) ────
    #   미청구 빌더와 **같은 함수**를 쓴다. 두 리스트에 다른 잣대를 대지 않는다.
    _mo = D.master_only_unbilled(recs)
    if _mo:
        _mset = {nm(r['계기번호']) for r, _ in _mo}
        log(f"마스터단독 미청구 — {len(_mo)}건 **제외**(함체 슬레이브가 전부 청구)")
        (ROOT / 'research/마스터만미청구_제외_불가_20260922.json').write_text(json.dumps(
            [dict({k: r.get(k) for k in ('계기번호', '지사', '주소', '고객번호')}, **ev)
             for r, ev in _mo], ensure_ascii=False, indent=1))
        EX.stage(EX.L_BULGA, [EX.row(EX.L_BULGA, 'C5', r,
            f"이 계기가 마스터인 함체({' · '.join(ev['함체'])})의 슬레이브가 **전부 청구**다."
            " 청구는 모뎀 단위로 움직이므로, 남은 마스터 한 건은 모뎀을 새로 시설해도"
            " 청구에 올라오지 않는다 — 청구 불가로 마무리한 건이다.",
            f"함체 {' · '.join(ev['함체'])}") for r, ev in _mo])
        recs = [x for x in recs if nm(x['계기번호']) not in _mset]
        keep = [v for v in keep if v['_m'] not in _mset]

    # ── 좌표 ────────────────────────────────────────────────────────────────
    has = [x for x in recs if x['주소']]
    pend = [x for x in recs if not x['주소']]
    log(f'주소 보유 {len(has):,} · 결손 {len(pend):,}')
    pairs = sorted({(x['주소'], x['도로명주소']) for x in has})
    cache = _h.load_geo_cache()
    cache = _h.geocode_all(pairs, cache)
    from geocode_cascade import resolve as geo_resolve
    fixed = 0
    for jib, road in pairs:
        k = f'{jib} {road}'
        v = cache.get(k)
        if v and v[2] and v[3]:
            continue
        gu = D.gu_of(jib) or D.gu_of(road)
        if gu:
            hit = geo_resolve(jibun=gu, road='')
            if hit and hit.lat:
                cache[k] = ['approximate', gu, hit.lat, hit.lng, '구중심폴백', '', '']
                fixed += 1
    if fixed:
        log(f'구 중심 폴백 {fixed}')
    _h.GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')
    for x in has:
        v = cache.get(f"{x['주소']} {x['도로명주소']}")
        if v and v[2] and v[3]:
            x['lat'], x['lng'], x['좌표정확도'] = v[2], v[3], v[0]
            x['도로명주소'] = x['도로명주소'] or (v[5] or '')
        else:
            x['lat'] = x['lng'] = None
            x['좌표정확도'] = 'fail'
    bad = [x for x in has if x['lat'] is None]
    has = [x for x in has if x['lat'] is not None]
    pend += bad
    log(f'좌표: {dict(Counter(x["좌표정확도"] for x in has))} · 좌표실패로 대기 {len(bad)}')

    # ── DCU 철거예정 ────────────────────────────────────────────────────────
    _dc = importlib.util.spec_from_file_location('dcu', str(ROOT / 'scripts/apply_dcu_status.py'))
    DC = importlib.util.module_from_spec(_dc)
    _dc.loader.exec_module(DC)
    removal, comm = DC.load_reference()
    for rows_, lab in ((has, '지도'), (pend, '대기')):
        DC.apply_to(rows_, removal, comm)
        log(f'  [{lab} {len(rows_):,}] '
            + ' · '.join(f'{k} {v:,}' for k, v in
                         Counter(x.get('dcu_철거예정') or '(없음)' for x in rows_).most_common()))
    for x in has + pend:
        for k in ('DCU장애여부', 'DCU장애여부출처', 'DCU회선상태출처'):
            x.pop(k, None)

    # ── 제외축 M6/B9(고객번호 경유 후속 청구) — **폐기했다** (영준님 2026-09-21) ──
    #   시간 순서를 판정축으로 삼았으나 근거가 무너졌다:
    #     (1) 원장 시공일은 **앱 작성 시각**이지 실제 시공 시각이 아니다
    #         (불가 22,030건도 시공일 보유 100% — 시공을 못 했는데 날짜가 있다)
    #     (2) 계기가 **먼저** 교체되어 우리가 옛 번호를 못 찾는 구조가 있다
    #         -> '상대가 먼저' 가 오히려 우리 건이 유령이 된 원인이라 선후로는 판정할 수 없다
    #     (3) 뽑힌 98건 중 93건이 '미청구 + MAC 보유' 였다.
    #         ★미청구는 **시공했는데 청구가 안 된 것**이다(영준님) — 26년 자재로 갈아야 청구된다.
    #         즉 빼면 안 되는 것을 뺐다.
    #   ★같은 축을 다시 만들지 마라. 판정은 시간이 아니라 **실재 여부**로 한다.
    #     규명 문서: research/날짜축_정의_20260921.md §5
    # ── 주소 접두 정규화 + 같은 지번 좌표 통합 (영준님 2026-09-21) ──────────
    #   미청구 빌더와 **같은 함수**를 쓴다.
    _ust = D.unify_addr_coords(has + pend, '25년불가')
    if _ust['보류목록']:
        _bp = ROOT / 'research/좌표통합_보류_20260921.json'
        _prev = json.loads(_bp.read_text()) if _bp.exists() else {}
        _prev['25년불가'] = _ust['보류목록']
        _bp.write_text(json.dumps(_prev, ensure_ascii=False, indent=1))

    OUT.write_text(json.dumps(has, ensure_ascii=False, indent=1))
    OUT_PEND.write_text(json.dumps(pend, ensure_ascii=False, indent=1))
    log(f'저장 {OUT} {len(has):,} · {OUT_PEND} {len(pend):,}')

    # ── 게이트 ──────────────────────────────────────────────────────────────
    log('\n=== 검증 게이트 ===')
    src = {v['_m'] for v in keep}
    got = {nm(x['계기번호']) for x in has + pend}
    alpha_s = sum(1 for x in src if re.search(r'[A-Za-z]', x))
    alpha_o = sum(1 for x in has + pend if re.search(r'[A-Za-z]', str(x['계기번호'])))
    dup = len(has) + len(pend) - len(got)
    nullc = sum(1 for x in has if x['lat'] is None)
    checks = [(f'지도 {len(has):,} + 대기 {len(pend):,} = {len(has)+len(pend):,} (기대 {len(src):,})',
               len(has) + len(pend) == len(src)),
              (f'계기 차집합 — 대상에만 {len(src-got)} · 산출에만 {len(got-src)}', src == got),
              (f'영문자 접두 {alpha_s} · 산출 {alpha_o}', alpha_s == alpha_o),
              (f'lat/lng null {nullc}', nullc == 0),
              (f'중복 계기번호 {dup}', dup == 0)]
    ok = True
    for msg, good in checks:
        log(f'  [{"OK" if good else "실패"}] {msg}')
        ok &= good
    _vs = importlib.util.spec_from_file_location('vb', str(ROOT / 'scripts/validate_bdju.py'))
    VB = importlib.util.module_from_spec(_vs)
    _vs.loader.exec_module(VB)
    err = 0
    for rows_, lab in ((has, 'bulga-data'), (pend, 'bulga-pending')):
        n_, msgs = VB.check_records(rows_, lab)
        err += n_
        for m_ in msgs:
            log('  ' + m_)
    log(f'  [{"OK" if err == 0 else "실패"}] 변대주 3축 게이트 — 어긋난 값 {err:,}')
    ok &= err == 0
    log('  판정: ' + ('OK' if ok else '★게이트 불통과'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
