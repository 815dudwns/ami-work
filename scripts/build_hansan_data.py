#!/usr/bin/env python3
"""'한산교체' list — defective 한산 meters that were already replaced (주덕기 과장 mail 2026-11-18 "계기 불량 교체").

What it is: 한산-made meters found defective; each was already swapped for another meter. The number in the file
is the **removed 한산 meter** — the new meter number is not given. The field finds the place and works it.

Source (main worktree inbox, gitignored):
  data/inbox_jdg_20261118/복사본 보강 대상 선조치 요청(261112)_v2.xlsx  Sheet1
  rows with 요청일 '(한산)' (비고 '하자 대상 한산 계기(교체 완료됨)'). The other rows (요청일 11/12) are 선조치 —
  scripts/build_seonjochi_data.py reads the same file.
  The file masks the meter as '0553*0323637' and wraps the address in '*' — both stripped.

Output: data/hansan-data.json — one record per meter, site key 주소 = 지번주소.
  js/datasets.js code 'e', category '한산교체' -> status key '주소|한산교체' (never the plain address).

Normalisation = the 선조치 builder (parse_addr_any, norm_meter, geocode_rows): letters prefix kept (A053, LA53), pure
digits zfill(11); 계기타입 from digits 3-4 only; 동호수 = the text after the lot number; 주소_원문 kept.
An address without a lot number ('대흥동  번지') goes in at the dong centre, approximate — no row is dropped.

Gates: source vs output (meter set both ways, prefix counts, null coords) + scripts/validate_bdju.py.

    python3 scripts/build_hansan_data.py
"""
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import build_seonjochi_data as S  # noqa: E402

OUT = ROOT / 'data/hansan-data.json'
GEO_CACHE = ROOT / 'data/inbox_hansan/geocode-cache.json'
HANSAN = '(한산)'


def main():
    _, src = S.load_source()
    src = [r for r in src if S.ws(r.get('요청일')) == HANSAN]
    out, bad_addr = [], []
    for r in src:
        m = S.norm_meter(r.get('계기번호'))
        p = S.parse_addr_any(r.get('주소'))
        if not p:
            bad_addr.append((m, r.get('주소')))
            continue
        jibun, road, extra, how = p
        jisa = S.ws(r.get('지사'))
        out.append({
            '지사': S.JISA_FIX.get(jisa, jisa),
            '주소': jibun, '지번주소': jibun, '도로명주소': road, '동호수': extra,
            '주소_원문': S.unstar(r.get('주소')), '_how': how,
            '계기번호': m, '계기타입': S.TYPE_BY_CODE.get(m[2:4], ''),
            '변대주': S.clean(r.get('변대주명')), '변대주번호': '', 'DCUID': '',
            '순번': S.ws(r.get('순번')), '비고': S.ws(r.get('비고')),
            'LP1': S.clean(r.get('LP1')), 'LP2': S.clean(r.get('LP2')), '완료여부': S.clean(r.get('완료여부')),
        })
    if bad_addr:
        sys.exit(f'★주소를 못 읽은 행 {bad_addr} — parse_addr_any 를 고치고 다시 돌려라(행을 버리지 않는다)')

    geo = S.geocode_rows(out, GEO_CACHE, lambda x: x['_how'])
    fixed = [(x['계기번호'], x['주소_원문'], x['주소'], x['_how']) for x in out if x['_how']]
    for x in out:
        x.pop('_how')

    src_m = [S.norm_meter(r.get('계기번호')) for r in src]
    out_m = [x['계기번호'] for x in out]
    pre = lambda ms: Counter(m[:2] for m in ms if not m.isdigit())
    print(f'대조: 원본 {len(src_m)} · 출력 {len(out_m)} · 원본-출력 {len(set(src_m) - set(out_m))}'
          f' · 출력-원본 {len(set(out_m) - set(src_m))} · 중복 {len(out_m) - len(set(out_m))}'
          f' · 접두 원본 {dict(pre(src_m))} 출력 {dict(pre(out_m))}'
          f' · 좌표 null {sum(1 for x in out if x["lat"] is None)}')
    if (set(src_m) != set(out_m) or len(out_m) != len(set(out_m)) or pre(src_m) != pre(out_m)
            or any(x['lat'] is None for x in out)):
        sys.exit('★원본 대조 실패 — 출력하지 않는다')
    bad_fmt = [m for m in out_m if not S.METER_RE.match(m)]
    print(f'계기번호 형식 위반 {len(bad_fmt)} {bad_fmt}')
    for f in fixed:
        print(f'주소 보정 {f}')
    print(f'개소 {len(geo)} · 좌표(개소) {dict(Counter(g["acc"] for g in geo.values()))}'
          f' · 계기 {dict(Counter(x["좌표정확도"] for x in out))}')
    print(f'방법(개소) {dict(Counter(g["method"] for g in geo.values()).most_common())}')
    print(f'지사 {dict(Counter(x["지사"] for x in out).most_common())}')
    print(f'계기타입 {dict(Counter(x["계기타입"] or "(빈값)" for x in out))}')

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'저장 {OUT} ({len(out)}계기)')
    r = subprocess.run([sys.executable, str(ROOT / 'scripts/validate_bdju.py'), str(OUT)])
    if r.returncode:
        OUT.unlink()
        sys.exit('★validate_bdju 실패 — 산출물을 지웠다')


if __name__ == '__main__':
    main()
