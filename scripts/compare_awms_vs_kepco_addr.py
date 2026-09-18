#!/usr/bin/env python3
"""awms 회수 주소 vs 한전(주덕기 과장) 회신 주소 대조 — awms 축의 실제 정확도 측정

쓰는 법
    python3 scripts/compare_awms_vs_kepco_addr.py <과장회신엑셀> [--sheet 요청] [--json out.json]

왜 있나 (영준님 2026-09-18)
  awms FMPMTR 로 회수한 주소 917건은 **아직 채택하지 않았다.** 과장 회신이 오면 같은
  계기에 대해 두 주소를 맞대 보고, awms 축이 실제로 맞는지 확인한 뒤 일괄 채택한다.
  이 스크립트가 그 대조를 한다.

★비교 규칙 — 도로명 vs 지번을 불일치로 세지 마라
  '동대문구 약령동길 85' 와 '동대문구 제기동 954' 는 같은 곳이다. 내가 2026-09-18 오염률을
  처음 잴 때 이걸 불일치로 세서 수치를 부풀린 전례가 있다. 그래서
    - 표기 계열(도로명/지번)이 다르면 **구까지만** 보고, 같은 구면 '판정불가' 로 뺀다
    - 구가 다르면 표기와 무관하게 **확실한 불일치**다
    - 둘 다 지번이면 법정동 + 본번으로 비교한다(-0, 호수, 행정동 1/2동 표기 흡수)
  그리고 원장 주소에 붙어 오는 '우선_0611_' 같은 **작업 태그는 떼고** 비교한다.
  awms 주소는 '도로명(지번,동호수)' 혼합 표기라 **괄호 안 지번을 따로 뽑아** 같이 본다.

산출: 등급별 정확도 표 + 불일치 목록(json). **DB 는 건드리지 않는다** — 판단은 사람이 한다.
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
AWMS = ROOT / 'research/미청구_awms주소회수_20260918.json'
DEFAULT_OUT = ROOT / 'research/awms_vs_한전주소_대조_20260918.json'

TAG_RE = re.compile(r'^[가-힣]*_?\d{3,}_\s*')
GU_RE = re.compile(r'([가-힣]+구)')
JIBUN_RE = re.compile(r'([가-힣]+?)(\d?)(동|가|읍|면|리)\s*(\d+)')
ROAD_RE = re.compile(r'[가-힣0-9]+(?:로|길)\d*[가-힣]*\s*\d')


def norm_meter(v):
    s = re.sub(r'[\s\-]', '', str(v if v is not None else '')).strip()
    if not s or s.upper() in ('NAN', 'NONE', '#N/A', '0'):
        return ''
    return s.upper() if re.search(r'[A-Za-z]', s) else s.zfill(11)


def txt(v):
    s = str(v if v is not None else '').strip()
    return '' if s.lower() in ('', 'nan', 'none', '#n/a') else s


def strip_tag(a):
    return TAG_RE.sub('', str(a or '')).strip()


def norm_addr(a):
    return re.sub(r'\s+', '', strip_tag(a))


def gu_of(a):
    m = GU_RE.search(strip_tag(a))
    return m.group(1) if m else ''


def is_road(a):
    return bool(ROAD_RE.search(str(a or '')))


def jibun_key(a):
    """법정동 + 본번. awms 의 '도로명(지번,동호수)' 는 괄호 안도 본다."""
    for cand in (a, *re.findall(r'\(([^)]*)\)', str(a or ''))):
        m = JIBUN_RE.search(norm_addr(cand))
        if m:
            return f'{m.group(1)}{m.group(3)}{m.group(4)}'
    return ''


def compare(a, b):
    """a=awms 주소, b=한전 회신 주소."""
    if not a or not b:
        return '비교불가(한쪽 없음)'
    if norm_addr(a) == norm_addr(b):
        return '완전일치'
    ga, gb = gu_of(a), gu_of(b)
    if ga and gb and ga != gb:
        return '다른구(확실한불일치)'
    ka, kb = jibun_key(a), jibun_key(b)
    if ka and kb:
        return '같은지번(표기차)' if ka == kb else '다른지번(불일치)'
    # 지번을 양쪽에서 못 뽑았다 — 표기 계열이 갈리면 판정하지 않는다
    if is_road(a) != is_road(b):
        return '판정불가(도로명vs지번)'
    return '판정불가(형식불명)'


def read_reply(path, sheet=None):
    wb = load_workbook(path, data_only=True)
    ws = wb[sheet] if sheet else wb[wb.sheetnames[0]]
    head = [txt(ws.cell(1, c).value) for c in range(1, ws.max_column + 1)]
    idx = {h: i + 1 for i, h in enumerate(head) if h}
    c_m = next((i for h, i in idx.items() if '계기번호' in h), None)
    addr_cols = [i for h, i in idx.items() if '주소' in h]
    if not c_m or not addr_cols:
        raise SystemExit(f'★계기번호/주소 열을 못 찾았다. 헤더: {head}')
    print(f'회신 시트 "{ws.title}" · 계기번호={c_m} · 주소열={addr_cols}')
    out = {}
    for r in range(2, ws.max_row + 1):
        m = norm_meter(ws.cell(r, c_m).value)
        if not m:
            continue
        vals = [txt(ws.cell(r, i).value) for i in addr_cols]
        vals = [v for v in vals if v]
        if vals:
            out[m] = vals[0] if len(vals) == 1 else ' / '.join(vals)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('reply')
    ap.add_argument('--sheet', default=None)
    ap.add_argument('--json', default=str(DEFAULT_OUT))
    a = ap.parse_args()

    kepco = read_reply(a.reply, a.sheet)
    print(f'한전 회신 주소 {len(kepco):,}건')

    awms = {}
    for r in json.loads(AWMS.read_text())['목록']:
        if r.get('결과') == '적중' and r.get('awms_주소'):
            awms[norm_meter(r['계기번호'])] = r
    print(f'awms 회수 주소 {len(awms):,}건')

    both = sorted(set(awms) & set(kepco))
    print(f'양쪽 다 있는 계기 {len(both):,}건 — 이것만 대조한다\n')
    if not both:
        print('★겹치는 계기가 없다. 회신 대상과 awms 회수 대상이 어긋난 것인지 확인하라.')
        return 1

    by_grade = defaultdict(Counter)
    rows = []
    for m in both:
        x = awms[m]
        v = compare(x['awms_주소'], kepco[m])
        g = x.get('신뢰등급', '(등급없음)')
        by_grade[g][v] += 1
        rows.append({'계기번호': x['계기번호'], '신뢰등급': g, '매칭방식': x.get('매칭방식', ''),
                     'awms_주소': x['awms_주소'], '한전_주소': kepco[m], '판정': v})

    print(f'{"신뢰등급":40s} {"대조":>5s} {"판정":>5s} {"불일치":>5s}  정확도')
    tot = Counter()
    for g, c in sorted(by_grade.items()):
        n = sum(c.values())
        und = sum(v for k, v in c.items() if k.startswith(('판정불가', '비교불가')))
        bad = c['다른지번(불일치)'] + c['다른구(확실한불일치)']
        j = n - und
        tot.update(c)
        acc = (j - bad) / j * 100 if j else 0
        print(f'{g:40s} {n:5,} {j:5,} {bad:5,}  {acc:5.1f}%')
    n = sum(tot.values())
    und = sum(v for k, v in tot.items() if k.startswith(('판정불가', '비교불가')))
    bad = tot['다른지번(불일치)'] + tot['다른구(확실한불일치)']
    j = n - und
    print(f'\n전체: 대조 {n:,} · 판정가능 {j:,} · 불일치 {bad:,}'
          f' · **정확도 {(j-bad)/j*100 if j else 0:.1f}%**')
    print(f'  판정 내역: {dict(tot.most_common())}')

    bads = [r for r in rows if r['판정'] in ('다른지번(불일치)', '다른구(확실한불일치)')]
    if bads:
        print(f'\n불일치 표본 (상위 8 / 총 {len(bads)}):')
        for r in bads[:8]:
            print(f"  {r['계기번호']} [{r['신뢰등급']}]\n"
                  f"     awms[{r['awms_주소']}]\n     한전[{r['한전_주소']}]")

    Path(a.json).write_text(json.dumps({
        '생성': '2026-09-18',
        '설명': 'awms 회수 주소 vs 한전(주덕기) 회신 주소 대조. 채택 판단 근거.',
        '대조건수': n, '판정가능': j, '불일치': bad,
        '정확도': round((j - bad) / j * 100, 2) if j else None,
        '판정내역': dict(tot), '목록': rows,
    }, ensure_ascii=False, indent=1))
    print(f'\n저장 {a.json}')
    print('★DB 는 건드리지 않았다. 채택은 사람이 판단한다 —'
          ' 채택하면 build_michunggu_target_20260918.py 를 --use-awms 로 돌린다.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
