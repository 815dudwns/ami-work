#!/usr/bin/env python3
"""이미 만들어진 데이터셋의 주소를 **제자리에서** 정규화한다 (영준님 2026-09-21).

왜 이게 따로 필요한가
  ★일부 데이터셋은 **빌더 출력 그대로가 아니라 후처리를 거친 파일**이다.
    고압(gapap-data.json)이 그렇다 — 빌더를 다시 돌렸더니 239 -> 277 로 늘었다
    (한전기준 빈칸 83건을 걸러내는 apply_gapap_sheet2_fields.py 후처리가 날아간다).
    그래서 빌더 재실행이 아니라 **파일을 제자리에서** 고쳐야 한다.
  빌더에는 unify_addr_coords 를 따로 걸어 뒀다 — 다음 판부터는 자동으로 적용된다.

실행: python3 scripts/normalize_addr_inplace.py data/gapap-data.json [...]
      --dry 를 붙이면 바꾸지 않고 무엇이 바뀔지만 보여준다.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_s = importlib.util.spec_from_file_location(
    'mich', str(ROOT / 'scripts/build_michunggu_dataset_20260918.py'))
M = importlib.util.module_from_spec(_s)
_s.loader.exec_module(M)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    if not args:
        print(__doc__)
        return 1
    for f in args:
        p = ROOT / f if not Path(f).is_absolute() else Path(f)
        rows = json.loads(p.read_text())
        before = len(rows)
        st = M.unify_addr_coords(rows, p.name)
        if dry:
            print(f'  (--dry) {p.name} — 저장하지 않음')
            continue
        # ★건수는 절대 변하면 안 된다. 이 스크립트는 값만 고친다.
        assert len(rows) == before, f'건수가 바뀌었다 {before} -> {len(rows)}'
        p.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
        print(f'  저장 {p} — {len(rows):,}건 (건수 불변)'
              + (f' · ★보류 {st["보류개소"]}개소' if st['보류개소'] else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
