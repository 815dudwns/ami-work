#!/usr/bin/env python3
"""변대주 3축 게이트 — 리스트업 산출물은 반드시 이걸 통과해야 한다.

★왜 있나: 영준님이 리스트업할 때마다 같은 지적을 반복하셨다(2026-09-18·09-20).
  메모리([[dcu_match_axis_separation]]·[[bdju_field_meaning_flipped]])에 적어둬도
  코드에 게이트가 없으면 산출물 단계에서 안 걸린다. 그래서 검사를 파일로 박는다.

세 축은 형태부터 다르고 **끼리끼리만** 매칭한다:
    변대주명        한글 포함      '갈현간 48R2R3'
    변대주 전산화번호  8자리 영숫자    '9628E291'
    DCU ID        10자리 영숫자   '9628E2916S'  (= 전산화번호 + 2자리)

쓰는 법:
    python3 scripts/validate_bdju.py data/michunggu-data.json [...]
    # 또는  from validate_bdju import check_records; check_records(rows, '이름')
종료코드 1 이면 산출물을 내지 마라.
"""
import json
import re
import sys

NAME = re.compile(r'[가-힣]')
NUM8 = re.compile(r'^[0-9A-Z]{8}$')
DCU10 = re.compile(r'^[0-9A-Z]{10}$')

# ─── 계기번호 형태 ──────────────────────────────────────────────────────────
# 법칙: 11자리 · 1~2번째만 영문 가능 · 3~4번째는 타입코드(숫자) · 나머지 숫자.
#   예) 07530186525 · A0530188699 · LA530151258
# ★자동 교정은 하지 않는다. 추정으로 고치면 **없는 계기를 만든다** —
#   오타 6건을 MAC·고객번호로 역추적하니 4건은 제대로 된 번호가 이미 처리돼 있었고
#   2건은 원장·awms 어디에도 없었다(2026-09-20). 건수와 값만 찍고 사람이 판단한다.
METER_RE = re.compile(r'^[0-9A-Z]{2}[0-9]{9}$')
F_METER = ('계기번호',)
# ★판단 보류분 — 원장·awms 어디에도 없어 정답을 못 찾은 것들(PM 2026-09-20).
#   지도에는 남기고 주 과장에게 '계기번호 확인 요망' 으로 물었다. 게이트 실패로 세지 않는다.
#   답이 오면 이 목록에서 빼라. 새 위반은 여전히 실패로 잡힌다.
METER_PENDING = {
    # ※'4719B160548'·'3919048106A' 는 2026-09-20 재판정으로 **번호를 교정해 대상에 남겼다**
    #   (정답 47198160548 · 39190481064). 더 이상 위반이 아니라 여기서 뺐다.
    # 통신팀이 **대기분에서 새로 찾은 3건**(2026-09-20). 전부 주소 결손이라 어차피 요청 대상이다.
    #   같은 MAC 으로 원장을 훑어도 정답을 특정할 수 없어 고치지 않았다(추정 금지).
    '2519B153734': 'MAC 01254353542 · 같은 MAC 에 정상번호 3건(25199153340 등) 있으나 정답 특정 불가',
    '255300B3580': 'MAC 01249849755 · 원장에도 이 오타 그대로 1행뿐 — 대조할 정상번호가 없다',
    '45530L93990': 'MAC 01249850270 · 같은 MAC 에 정상번호 3건(45530193985 등), L↔1 혼동 의심이나 뒷자리도 달라 특정 불가',
}

F_NAME = ('변대주', '변대주명')
F_NUM = ('변대주번호', '변대주전산화번호')
F_DCU = ('DCUID', 'DCU_ID', 'DCU ID')


def norm_name(v):
    """이름 비교용 — 공백만 지운다(저장은 원문 그대로).
    대장 18,993개 고유값을 공백 제거해도 충돌 0건이라 안전하다(실측 2026-09-20)."""
    return re.sub(r'\s+', '', str(v or '')).upper()


def kind(v):
    v = str(v or '').strip()
    if not v:
        return None
    if NAME.search(v):
        return '이름'
    if NUM8.match(v):
        return '번호'
    if DCU10.match(v):
        return 'DCUID'
    return '기타'


def pick(rec, cands):
    for c in cands:
        if c in rec:
            return c
    return None


def check_records(rows, label='산출물'):
    """형태가 어긋난 값을 세어 (에러수, 메시지목록) 을 돌려준다."""
    if not rows:
        return 0, [f'{label}: 레코드 없음']
    r0 = rows[0]
    cn, cnum, cd = pick(r0, F_NAME), pick(r0, F_NUM), pick(r0, F_DCU)
    bad, msg = 0, []

    # ── 계기번호 형태 검사 ──────────────────────────────────────────────────
    cm = pick(r0, F_METER)
    if cm:
        allbad = [str(r.get(cm) or '').strip() for r in rows
                  if str(r.get(cm) or '').strip()
                  and not METER_RE.match(str(r.get(cm) or '').strip().upper())]
        held = [x for x in allbad if x in METER_PENDING]
        wrongm = [x for x in allbad if x not in METER_PENDING]
        bad += len(wrongm)
        if held:
            msg.append(f'  보류 {cm:<8}(형태) 확인 요청 중 {len(held):,}  {held}')
        mark = 'OK ' if not wrongm else '★NG'
        msg.append(f'  {mark} {cm:<8}(형태) 법칙 위반 {len(wrongm):,}'
                   + (f'  {wrongm[:8]}' if wrongm else ''))
        if wrongm:
            msg.append('       ^ 11자리·1~2번째만 영문·나머지 숫자.'
                       ' **자동 교정 금지** — MAC·고객번호로 역추적해 사람이 판단한다')

    for col, want in ((cn, '이름'), (cnum, '번호'), (cd, 'DCUID')):
        if not col:
            continue
        wrong = {}
        for r in rows:
            k = kind(r.get(col))
            if k and k != want:
                wrong[k] = wrong.get(k, 0) + 1
        n = sum(wrong.values())
        bad += n
        mark = 'OK ' if n == 0 else '★NG'
        msg.append(f'  {mark} {col:<8}(={want}) 어긋남 {n:,}'
                   + (f'  {wrong}' if wrong else ''))
    # DCUID 앞 8자리 = 전산화번호 (대장 19,007건 예외 0 — 계산이지 조회가 아니다)
    if cnum and cd:
        both = [r for r in rows if str(r.get(cnum) or '').strip() and str(r.get(cd) or '').strip()]
        ng = [r for r in both if str(r[cd]).strip()[:8] != str(r[cnum]).strip()]
        if both:
            msg.append(f'  {"OK " if not ng else "주의"} DCUID 앞8 == 번호 : '
                       f'{len(both)-len(ng):,}/{len(both):,} 일치'
                       + (f' (불일치 {len(ng):,} — 교체 전/후 DCU 차이일 수 있다)' if ng else ''))
    return bad, msg


def main(paths):
    fail = 0
    for p in paths:
        rows = json.load(open(p, encoding='utf-8'))
        if isinstance(rows, dict):
            rows = next(v for v in rows.values() if isinstance(v, list))
        bad, msg = check_records(rows, p)
        print(f'{p}  ({len(rows):,}건)')
        print('\n'.join(msg))
        fail += bad
    if fail:
        print(f'\n★게이트 실패 — 형태가 어긋난 값 {fail:,}건. 산출물을 내지 마라.')
        print('  한글=이름칸 / 8자리=번호칸 / 10자리=DCUID칸. 그 외는 버린다.')
        return 1
    print('\n게이트 통과.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:] or ['data/michunggu-data.json']))
