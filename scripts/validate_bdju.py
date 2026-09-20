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
