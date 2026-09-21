#!/usr/bin/env python3
"""왜 빠졌나 — 제외 이력 조회 (영준님 2026-09-20 "제외된 사유 리스트 잘 관리해").

  python3 scripts/why_excluded.py 07510112531      계기 하나
  python3 scripts/why_excluded.py --cust 0117308760  고객번호로
  python3 scripts/why_excluded.py --rule C2         그 축 전량
  python3 scripts/why_excluded.py --summary         축별 건수 표

제외 안 된 건이면 '현재 리스트에 있다' 고 답한다.
정본은 data/exclusions.json · DB 사본은 ami.db :: exclusions.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import exclusions as EX                                            # noqa: E402

LISTS = {
    EX.L_MICH: ('data/michunggu-data.json', 'data/michunggu-pending.json'),
    EX.L_BULGA: ('data/michunggu-bulga-data.json', 'data/michunggu-bulga-pending.json'),
}


def load():
    if not EX.INDEX.exists():
        sys.exit('data/exclusions.json 이 없다 — python3 scripts/build_exclusions_index.py 먼저')
    return json.loads(EX.INDEX.read_text())


def current(m_norm):
    """현재 리스트에 살아 있나 — (리스트, 지도/대기) 로 답한다."""
    out = []
    for lab, files in LISTS.items():
        for f in files:
            p = ROOT / f
            if not p.exists():
                continue
            for x in json.loads(p.read_text()):
                if EX._norm(x.get('계기번호')) == m_norm:
                    out.append((lab, '대기' if 'pending' in f else '지도', x))
    return out


def show(rows, m):
    print(f'\n=== {m} ===')
    hits = [r for r in rows if r['계기번호_norm'] == EX._norm(m)]
    cur = current(EX._norm(m))
    if not hits and not cur:
        print('  제외 기록도 없고 현재 리스트에도 없다 — 애초에 대상이 아니었다.')
        return
    for lab, where, rec in cur:
        print(f'  ★현재 [{lab}] {where} 에 있다 — 주소 {rec.get("주소") or "-"}')
    if not hits:
        print('  제외된 적 없다.')
        return
    print(f'  제외 기록 {len(hits)}건'
          + (' ★두 축 이상에 걸렸다 — 한 축만 되살리면 안 된다' if len(hits) > 1 else ''))
    for h in hits:
        rule = EX.RULE_BY_CODE.get(h['축코드'], {})
        print(f'\n  [{h["축코드"]}] {h["축이름"]}  ({h["원본리스트"]})')
        print(f'     왜     : {h.get("사유") or "-"}')
        print(f'     판정근거: {h.get("판정근거") or "-"}')
        print(f'     판정방법: {h.get("판정방법") or rule.get("판정방법", "-")}')
        print(f'     되살리기: {h.get("되살리기") or "-"}')
        print(f'     지시    : {h.get("지시근거") or "-"}  (판정 {h.get("제외시각") or "-"})')
        o = h.get('원본') or {}
        if o:
            keys = [k for k in o if not k.endswith('출처') and k not in
                    ('lat', 'lng', '좌표정확도', '신뢰등급', '대장출처', '주소_원문')]
            print(f'     원본({len(o)}필드): '
                  + ' · '.join(f'{k}={o[k]}' for k in keys[:12] if o.get(k)))
            if len(keys) > 12:
                print(f'              … 외 {len(keys)-12}필드 (전문은 data/exclusions.json)')
        lg = h.get('원장원본') or []
        if lg:
            g0 = lg[0]
            keep = {k: v for k, v in g0.items()
                    if v not in (None, '') and k not in ('snapshot', 'src_file', 'visible')}
            print(f'     원장({len(lg)}행, {len(g0)}필드): '
                  + ' · '.join(f'{k}={v}' for k, v in list(keep.items())[:10]))


def summary(rows):
    print('=== 축별 건수 (고유 계기) ===')
    by = defaultdict(set)
    for r in rows:
        by[(r['원본리스트'], r['축코드'])].add(r['계기번호_norm'])
    print(f'{"리스트":10s}{"축":5s}{"축이름":24s}{"건수":>8s}  적용순서')
    for rule in EX.RULES:
        for lab in (EX.L_MICH, EX.L_BULGA):
            s = by.get((lab, rule['축코드']))
            if s:
                print(f'{lab:10s}{rule["축코드"]:5s}{rule["축이름"][:22]:24s}'
                      f'{len(s):8,}  {rule["적용순서"]}')
    print()
    for lab, files in LISTS.items():
        n = 0
        for f in files:
            p = ROOT / f
            if p.exists():
                n += len(json.loads(p.read_text()))
        exc = len({r['계기번호_norm'] for r in rows if r['원본리스트'] == lab})
        print(f'{lab:10s} 현재 리스트 {n:,} · 제외 고유계기 {exc:,}')
    dup = Counter((r['원본리스트'], r['계기번호_norm']) for r in rows)
    multi = sum(1 for v in dup.values() if v > 1)
    print(f'\n두 축 이상에 걸린 계기 {multi:,}건'
          ' — 한 축을 되살릴 때 나머지 축을 확인해야 한다')


def main():
    a = sys.argv[1:]
    rows = load()
    if not a or a[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    if a[0] == '--summary':
        summary(rows)
        return 0
    if a[0] == '--rule':
        code = a[1].upper()
        hit = [r for r in rows if r['축코드'] == code]
        rule = EX.RULE_BY_CODE.get(code, {})
        print(f'=== [{code}] {rule.get("축이름", "?")} — {len(hit):,}건 ===')
        print(f'  정의: {rule.get("정의", "-")}')
        print(f'  판정: {rule.get("판정방법", "-")}')
        print(f'  되살리기: {rule.get("되살리는법", "-")}\n')
        for r in hit[:200]:
            print(f'  {r["계기번호"]:13s} {r["지사"]:12s} {(r.get("판정근거") or "")[:36]:38s} {r["주소"][:28]}')
        if len(hit) > 200:
            print(f'  … 외 {len(hit)-200:,}건 (전량은 data/exclusions.json)')
        return 0
    if a[0] == '--cust':
        cu = re.sub(r'\D', '', a[1]).zfill(10)
        hit = [r for r in rows if re.sub(r'\D', '', r['고객번호'] or '').zfill(10) == cu]
        print(f'=== 고객번호 {cu} — 제외 기록 {len(hit)}건 ===')
        for r in hit:
            print(f'  {r["계기번호"]} [{r["축코드"]}] {r["축이름"]}\n      {r.get("사유") or "-"}')
        if not hit:
            print('  제외 기록 없음')
        return 0
    for m in a:
        show(rows, m)
    return 0


if __name__ == '__main__':
    sys.exit(main())
