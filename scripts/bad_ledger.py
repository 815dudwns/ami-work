#!/usr/bin/env python3
"""계기불량 대장 제외 축 (2026-11-13, 영준님 "리스트에서 제외할 자료") — 미조치·미조치(lte)·25미청구 공용.

정본 목록 = data/reference/meter_bad_ledger_2025_exclude_20261113.json
  {'meters': {계기번호: {사업소·증상·장소·일자·작업자·제조·분기}}} — 628대.
  출처 윤용운 반장 메일(2025 1~7월 계기불량 사진대장, 원본 xlsx main data/inbox_yun_20261113/ — git 제외).
매칭 = 계기번호 정확 일치(숫자만이면 zfill11, 영문 접두는 그대로). ★추정·유사번호 금지.
목록이 늘면 BAD_LEDGERS 에 파일만 더한다.

쓰는 곳
  scripts/build_michochi_data.py        — 미조치·미조치(lte) 영구 축(실효 대상 축 다음)
  scripts/build_michunggu_dataset_20260918.py — 25미청구 축 M7(아카이브 단계 앞)
  python3 scripts/bad_ledger.py --apply-michunggu
      — 25미청구 지도·대기 파일에 이 축만 지금 적용(재생성 없이). 빌더를 통째로 다시 돌리면 9/29 이후 원장(ami.db)
        적재로 다른 축까지 움직인다(25불가 B10 --lp-only 와 같은 이유). 다시 돌려도 같은 결과(멱등).
★완료 아카이브(리스트별)는 건드리지 않는다.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BAD_LEDGERS = [ROOT / 'data/reference/meter_bad_ledger_2025_exclude_20261113.json']


def norm_meter(v):
    """공백·하이픈 제거, 대문자, 순수 숫자만 zfill(11) — 영문 접두는 그대로."""
    s = re.sub(r'[\s-]', '', str(v if v is not None else '')).upper()
    return s.zfill(11) if s.isdigit() else s


def load():
    """정규화 계기번호 -> (대장 칸 dict, 파일 이름)."""
    out = {}
    for p in BAD_LEDGERS:
        for k, v in json.loads(p.read_text(encoding='utf-8'))['meters'].items():
            if k:
                out.setdefault(norm_meter(k), (v or {}, p.name))
    return out


def hits(rows, key='계기번호'):
    """rows 중 대장에 든 행 -> [(행, 대장 칸, 파일)]."""
    led = load()
    return [(r, *led[norm_meter(r.get(key))]) for r in rows if norm_meter(r.get(key)) in led]


def reason(v, fname):
    return (f"계기불량 대장({fname}) — {v.get('사업소', '')} · {v.get('증상', '')} · {v.get('일자', '')}"
            f" · {v.get('작업자', '')} · {v.get('분기', '')}")


def apply_michunggu():
    """25미청구 지도·대기 파일에서 대장 계기를 뺀다(축 M7). 제외 이력은 data/.exclusions-stage 에 M7 몫을 더한다
    — 이미 뺀 계기(전에 돌린 몫)는 그대로 두고 같은 계기는 겹쳐 쌓지 않는다(다시 돌려도 이력이 안 사라진다)."""
    sys.path.insert(0, str(ROOT / 'scripts'))
    import exclusions as EX
    files = [ROOT / 'data/michunggu-data.json', ROOT / 'data/michunggu-pending.json']
    staged = EX.stage_load(EX.L_MICH)
    have = {x.get('계기번호_norm') for x in staged if x.get('축코드') == 'M7'}
    new_rows = []
    for p in files:
        rows = json.loads(p.read_text(encoding='utf-8'))
        h = hits(rows)
        hs = {norm_meter(r['계기번호']) for r, _, _ in h}
        for r, v, f in h:
            print(f'  {p.name}: {r["계기번호"]} · {r.get("지사", "")} · {r.get("주소", "")} — {reason(v, f)}')
            if norm_meter(r['계기번호']) not in have:
                new_rows.append(EX.row(EX.L_MICH, 'M7', r, reason(v, f), f"대장 장소 {v.get('장소', '')}"))
        if h:
            p.write_text(json.dumps([x for x in rows if norm_meter(x['계기번호']) not in hs],
                                    ensure_ascii=False, indent=1))
        print(f'{p.name}: {len(rows):,} -> {len(rows) - len(h):,} (계기불량 대장 {len(h)})')
    EX.stage_reset(EX.L_MICH)
    EX.stage(EX.L_MICH, staged + new_rows)
    return 0


if __name__ == '__main__':
    if '--apply-michunggu' in sys.argv:
        sys.exit(apply_michunggu())
    led = load()
    print(f'계기불량 대장 {len(led):,}대 · 파일 {[p.name for p in BAD_LEDGERS]}')
