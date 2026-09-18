#!/usr/bin/env python3
"""계기번호 단독 매칭의 오염률 실측 (PM 추가검증 발주 2026-09-18)

가설(PM): 계기는 재사용된다 — 철거한 계기가 다른 개소에 재투입돼 **같은 번호가 딴 주소에
산다**. 그래서 계기번호 단독 매칭으로 끌어온 주소·변대주는 남의 개소 값일 수 있다.

검증 설계
  정답지 = **원장에 이미 주소가 있는 계기**(7,007건). 이 주소는 그 계기의 그 시공 건에
  현장에서 붙은 값이므로 진실로 본다.
  이 정답지에 대해 보강 때와 **같은 소스·같은 키**로 주소를 다시 조회하고, 원장 주소와
  일치하는지 센다. 불일치율이 곧 그 (소스,키) 조합의 오염률이다.

  ★자기 산출물 안에서만 도는 검사가 아니다 — 원장 원문과 직접 대조한다.
"""
import importlib.util
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('bld', str(ROOT / 'scripts/build_michunggu_boost_20260918.py'))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)


def norm_addr(a):
    """주소 비교용 정규화 — 공백 제거, 시도 접두 통일."""
    s = re.sub(r'\s+', '', str(a or ''))
    # ★원장 주소에는 '우선_0611_' 같은 작업 태그가 붙어 온다 — 떼고 비교한다.
    s = re.sub(r'^[가-힣]*_?\d{3,}_', '', s)
    s = re.sub(r'^서울(특별시)?', '', s)
    return s


def gu_of(a):
    m = re.search(r'([가-힣]+구)', str(a or ''))
    return m.group(1) if m else ''


def is_road(a):
    """도로명주소인가 — '…로/…길 <번호>' 꼴."""
    return bool(re.search(r'[가-힣0-9]+(?:로|길)\d*[가-힣]*\s*\d', str(a or '')))


def jibun_key(a):
    """지번 축약키 = 법정동 + 본번. 표기 흔들림(-0, 호수, 행정동 1/2동)을 흡수한다."""
    s = norm_addr(a)
    m = re.search(r'([가-힣]+?)(\d?)(동|가|읍|면|리)(\d+)', s)
    if not m:
        return ''
    return f'{m.group(1)}{m.group(3)}{m.group(4)}'


def compare(gt, got):
    """원장 주소(gt) 와 소스 주소(got) 비교.

    ★도로명 vs 지번을 불일치로 세면 안 된다 — '약령동길 85' 와 '제기동 954' 는 같은 곳일 수
      있다(1차 검증에서 이걸 오판해 오염률이 부풀었다). 표기 계열이 다르면 **구까지만** 보고
      같은 구면 '판정불가' 로 뺀다. 구가 다르면 표기와 무관하게 확실한 불일치다.
    """
    if norm_addr(gt) == norm_addr(got):
        return '완전일치'
    g1, g2 = gu_of(gt), gu_of(got)
    if g1 and g2 and g1 != g2:
        return '다른구(확실한불일치)'
    if is_road(gt) != is_road(got):
        return '판정불가(도로명vs지번)'
    k1, k2 = jibun_key(gt), jibun_key(got)
    if k1 and k2:
        return '같은지번(표기차)' if k1 == k2 else '다른지번(불일치)'
    return '판정불가(형식불명)'


def main():
    print('=== 소스 적재 ===', flush=True)
    targets, mc, L = B.load_targets()
    con = sqlite3.connect(B.DB)
    S = B.Sources(con, L)

    truth = [t for t in targets if t['지번주소']]      # 원장 주소 보유 = 정답지
    print(f'\n정답지(원장 주소 보유 계기) {len(truth):,}')

    srcs = S.order()
    stat = defaultdict(lambda: Counter())
    samples = defaultdict(list)

    def tally(k, gt, got, mtr):
        v = compare(gt, got)
        stat[k]['조회됨'] += 1
        stat[k][v] += 1
        if v in ('다른구(확실한불일치)', '다른지번(불일치)') and len(samples[k]) < 3:
            samples[k].append((mtr, gt, got, v))

    for t in truth:
        gt = t['지번주소']
        for src in srcs:
            for how, idx, key in (('계기번호', S.by_meter.get(src, {}), t['_m']),
                                  ('고객번호', S.by_cust.get(src, {}), t['고객번호'])):
                if not key:
                    continue
                rec = idx.get(key)
                if rec and rec.get('지번주소'):
                    tally((src, how), gt, rec['지번주소'], t['계기번호'])
        rec = S.by_mac.get(t['MAC']) if t['MAC'] else None
        if rec and rec.get('지번주소'):
            tally(('원장전체MAC', 'MAC'), gt, rec['지번주소'], t['계기번호'])

    KEYS = ['완전일치', '같은지번(표기차)', '다른지번(불일치)', '다른구(확실한불일치)',
            '판정불가(도로명vs지번)', '판정불가(형식불명)']
    print(f'\n{"소스":22s} {"키":6s} {"조회":>6s} {"일치":>6s} {"표기차":>5s} {"다른지번":>6s}'
          f' {"다른구":>5s} {"판정불가":>6s}  오염률')
    rows = []
    for k in sorted(stat, key=lambda x: -stat[x]['조회됨']):
        c = stat[k]
        n = c['조회됨']
        if n < 20:
            continue
        bad = c['다른지번(불일치)'] + c['다른구(확실한불일치)']
        und = c['판정불가(도로명vs지번)'] + c['판정불가(형식불명)']
        judged = n - und
        rate = bad / judged * 100 if judged else 0.0
        rows.append((k, n, judged, bad, c['다른구(확실한불일치)'], und, rate))
        print(f'{k[0]:22s} {k[1]:6s} {n:6,} {c["완전일치"]:6,} {c["같은지번(표기차)"]:5,}'
              f' {c["다른지번(불일치)"]:6,} {c["다른구(확실한불일치)"]:5,} {und:6,}  {rate:5.1f}%')

    print('\n=== 다른개소 표본 ===')
    for k, n, judged, bad, gu, und, rate in rows:
        if bad and samples[k]:
            print(f'-- {k[0]} / {k[1]}  (오염 {rate:.1f}%, 판정대상 {judged:,})')
            for mtr, gt, got, v in samples[k]:
                print(f'     {mtr}  원장[{gt}]  소스[{got}]  -> {v}')

    out = ROOT / 'research/미청구_계기키오염_검증_20260918.json'
    out.write_text(json.dumps({
        '생성': '2026-09-18',
        '설계': '정답지=원장에 주소가 있는 계기. 같은 소스·같은 키로 재조회해 원장 주소와 대조.',
        '정답지건수': len(truth),
        '결과': [{'소스': k[0], '키': k[1], '조회': n, '판정대상': judged, '불일치': bad,
                 '다른구': gu, '판정불가': und, '오염률': round(rate, 2)}
                for k, n, judged, bad, gu, und, rate in rows],
    }, ensure_ascii=False, indent=1))
    print(f'\n저장 {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
