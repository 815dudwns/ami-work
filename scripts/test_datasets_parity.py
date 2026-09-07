#!/usr/bin/env python3
"""데이터셋 레지스트리 패리티 검사 — js/datasets.js 와 scripts/datasets.py 가 같은가.

레지스트리가 두 벌(브라우저용 JS / 스크립트용 파이썬)이라 한쪽만 고치면 조용히 어긋난다.
어긋나면 지도에는 보이는데 통계에는 없는(또는 그 반대) 리스트가 생긴다 — 실제로 장애
리스트가 그렇게 빠져 있었다.

같이 보는 것:
  - 코드 집합과 순서
  - 코드 -> 카테고리 / 파일 / metersKey / archives
  - 네임스페이스 카테고리 목록이 js/status-key.js 와 맞는지

  python3 scripts/test_datasets_parity.py     # PASS / FAIL 만 찍는다
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from datasets import DATASETS as PY_DATASETS  # noqa: E402

JS = (ROOT / "js" / "datasets.js").read_text(encoding="utf-8")


def _js_objects():
    """js/datasets.js 의 DATASETS 배열을 아주 얕게 파싱한다.
    주석 줄은 버리고 `{ ... }` 한 덩어리씩 키:값을 뽑는다(중첩 객체는 안 쓴다)."""
    body = JS[JS.index("const DATASET_REGISTRY = ["):]
    body = body[: body.index("\n];")]
    body = re.sub(r"^\s*//.*$", "", body, flags=re.M)          # 주석 제거
    out = []
    for chunk in re.findall(r"\{[^{}]*\}", body, flags=re.S):
        d = {}
        for k, v in re.findall(r"(\w+)\s*:\s*("
                               r"'[^']*'|\[[^\]]*\]|true|false|null)", chunk):
            if v.startswith("'"):
                d[k] = v[1:-1]
            elif v.startswith("["):
                d[k] = [x.strip().strip("'") for x in v[1:-1].split(",") if x.strip()]
            else:
                d[k] = {"true": True, "false": False, "null": None}[v]
        if "code" in d:
            out.append(d)
    return out


def _norm(d, keys):
    out = {}
    for k in keys:
        v = d.get(k)
        if k in ("file",) and isinstance(v, str):
            v = v.lstrip("./")
        if k == "archives" and isinstance(v, list):
            v = [x.lstrip("./") for x in v]
        if v not in (None, "", []):
            out[k] = v
    return out


def main():
    js = _js_objects()
    py = PY_DATASETS
    keys = ("code", "category", "file", "metersKey", "archives", "archivesGlob", "onMap")
    problems = []

    jc = [d["code"] for d in js]
    pc = [d["code"] for d in py]
    if jc != pc:
        problems.append(f"코드 목록이 다르다\n   js: {jc}\n   py: {pc}")

    for a, b in zip(js, py):
        na, nb = _norm(a, keys), _norm(b, keys)
        if na != nb:
            problems.append(f"[{a['code']}] 항목이 다르다\n   js: {na}\n   py: {nb}")

    # 네임스페이스 카테고리 — status-key 와 대조(둘 다 카테고리 이름을 쓴다)
    sk = (ROOT / "js" / "status-key.js").read_text(encoding="utf-8")
    m = re.search(r"NAMESPACED_CATEGORIES\s*=\s*\[([^\]]*)\]", sk)
    ns = {x.strip().strip("'\"") for x in m.group(1).split(",") if x.strip()} if m else set()
    cats = {d.get("category") for d in py if d.get("category")}
    unknown = ns - cats
    if unknown:
        problems.append(f"status-key 의 네임스페이스 카테고리가 레지스트리에 없다: {sorted(unknown)}")

    print(f"js {len(js)}개 / py {len(py)}개 · 네임스페이스 {sorted(ns)}")
    if problems:
        print("\nFAIL")
        for p in problems:
            print("  - " + p)
        sys.exit(1)
    print("PASS — 두 레지스트리가 동일하다")


if __name__ == "__main__":
    main()
