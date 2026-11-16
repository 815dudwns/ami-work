#!/usr/bin/env python3
"""LP 판독 — 미청구가 '왜 없어졌나' 를 읽는 공용 규칙 (영준님 2026-09-30)

영준님 법칙 그대로:
  · LP 가 없어지거나 불안한 것 = **계기가 아직 남아 있다** (우리 작업 대상)
  · `#N/A` = **거의 교체됐다고 보면 된다** (옛 번호만 남은 유령)

★**LP 는 마지막 시공 이후의 값이다**(영준님 "재방문해서 LTE 로 교체됐으면 이 LP값도 LTE LP
  이자나"). 그래서 `#N/A` 를 곧 '교체' 로 읽으면 뒤집힌다 — 마지막 작업이 **LTE 교체이고 LP
  구간이 그 뒤**라면, N/A 는 계기가 없어진 게 아니라 **갈아놓은 LTE 모뎀이 통신을 못 하고
  있다**는 뜻이고 그건 우리가 손봐야 할 건이다.
  실측 06190606718(연희동 141-34): 2026-03-09 신호미약으로 HPGP -> LTE 교체, LP 구간
  06/10·09-05~09-13 전부 그 뒤인데 전 구간 N/A. 이 맥락을 넣기 전 판독은 이것을
  '교체 추정(헛걸음 주의)' 으로 **반대로** 안내했다.

★제외 판정축이 아니다 — 왜 없어졌는지 **분석하는 재료**다(HANDOFF §LP 는 대상 판정축이
  아니다). 확정은 현장·대장 대조로 한다.

쓰는 곳: scripts/gen_addr_report.py(주소 리포트) · scripts/apply_lp_read.py(지도 리스트 후처리)
"""
import re

# 코드 -> (화면 라벨, 색 계열)  ※색 계열은 소비자(아미맵 디테일·리포트)가 해석한다
LABELS = {
    'dead':  ('LTE 교체했는데 LP 없음', 'bad'),      # 통신불량 — 우리가 손볼 건
    'alive': ('살아있음', 'good'),                   # 확실한 작업 대상
    'weak':  ('LP 불안', 'warn'),                    # 남아있음
    'zero':  ('통신 안 됨', 'warn'),                 # 남아있음
    'drop':  ('최근 급락', 'warn'),                  # 교체 확인 필요
    'cut':   ('중간에 끊김', 'warn'),                # 교체 확인 필요
    'gone':  ('교체 추정', 'gray'),                  # 헛걸음 주의
    'none':  ('LP 자료 없음', 'gray'),
}


def read_lp(lp, ctx=None):
    """(코드, 라벨, 설명). lp = {'LP 06/10': '0.79', ...} (키 순서가 곧 시간순)"""
    if not isinstance(lp, dict) or not lp:
        return 'none', LABELS['none'][0], ''
    seq = []
    for k, v in lp.items():
        s = str(v).strip()
        try:
            seq.append((k, float(s)))
        except ValueError:
            seq.append((k, None))
    vals = [x for _, x in seq if x is not None]
    c = ctx or {}
    if not vals:
        if c.get('swapped') or str(c.get('comm') or '').upper().startswith('LTE'):
            when = re.sub(r'\D', '', str(c.get('last') or ''))
            when = f'{when[:4]}-{when[4:6]}-{when[6:8]}' if len(when) >= 8 else ''
            return ('dead', LABELS['dead'][0],
                    f'{when} 에 LTE 로 갈았는데 그 뒤 LP 가 전 구간 N/A — 계기는 있고 '
                    '통신이 안 붙는다. 교체가 아니라 통신 불량이다')
        return 'gone', LABELS['gone'][0], 'LP 전 구간 N/A — 계기가 갈려 옛 번호만 남은 것으로 본다'
    last = seq[-1][1]
    if last is None:
        return 'cut', LABELS['cut'][0], 'LP 가 있다가 N/A 로 끊겼다 — 교체됐을 가능성'
    if last <= 0.15 and max(vals) >= 0.5:
        return ('drop', LABELS['drop'][0],
                f'마지막 {last:.2f} (최고 {max(vals):.2f}) — 최근에 끊겼다, 교체 확인 필요')
    if last == 0:
        return 'zero', LABELS['zero'][0], 'LP 0 — 계기는 있고 통신이 안 붙는다'
    if last >= 0.5:
        return 'alive', LABELS['alive'][0], f'마지막 {last:.2f} — 계기가 그대로 있다, 확실한 작업 대상'
    return 'weak', LABELS['weak'][0], f'마지막 {last:.2f} — 계기는 있고 수신이 불안하다'


def ctx_from_ledger_rows(rows):
    """원장 행들 -> 판독 맥락.

    rows = [{'시공일':..., '통신방식':..., '비고1':..., '비고2':..., 'MAC':...}, ...]
    ★주소가 빈 행(구시공앱 기록)도 반드시 포함해야 한다 — 그 행에 LTE 전환이 들어 있다.
    """
    last, comm, swapped = '', '', False
    for r in rows or ():
        d = re.sub(r'\D', '', str(r.get('시공일') or ''))
        if d >= last:
            last, comm = d, str(r.get('통신방식') or '')
        memo = ' '.join(str(r.get(k) or '') for k in ('비고1', '비고2'))
        if 'LTE' in memo.upper() and ('교체' in memo or '전환' in memo):
            swapped = True
    return {'last': last, 'comm': comm, 'swapped': swapped}
