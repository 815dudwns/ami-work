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
        if k in ("file", "fileByJisa") and isinstance(v, str):
            v = v.lstrip("./")
        if k == "archives" and isinstance(v, list):
            v = [x.lstrip("./") for x in v]
        if v not in (None, "", []):
            out[k] = v
    return out


def main():
    js = _js_objects()
    py = PY_DATASETS
    keys = ("code", "category", "file", "fileByJisa", "metersKey", "archives", "archivesGlob", "onMap", "noStats", "noLabel",
            # 2026-11-10 리스트 처리 레지스트리화 — 상태키·지연 로드도 두 벌이 같아야 한다
            "statusCategory", "plainKey", "deferred")
    problems = []

    jc = [d["code"] for d in js]
    pc = [d["code"] for d in py]
    if jc != pc:
        problems.append(f"코드 목록이 다르다\n   js: {jc}\n   py: {pc}")

    for a, b in zip(js, py):
        na, nb = _norm(a, keys), _norm(b, keys)
        if na != nb:
            problems.append(f"[{a['code']}] 항목이 다르다\n   js: {na}\n   py: {nb}")

    # 지사 파일 이름 조각 — js JISA_FILE_SLUG == scripts/jisa_split.py JISA_SLUG
    from jisa_split import JISA_SLUG
    m = re.search(r"JISA_FILE_SLUG\s*=\s*\{([^}]*)\}", JS)
    jslug = dict(re.findall(r"'([^']+)'\s*:\s*'([^']+)'", m.group(1))) if m else {}
    if jslug != JISA_SLUG:
        problems.append(f"지사 파일 이름이 다르다\n   js: {jslug}\n   py: {JISA_SLUG}")

    # 네임스페이스 카테고리 — 2026-11-10 부터 레지스트리에서 만든다. 브라우저와 같은 순서(datasets.js -> status-key.js)로
    #   node 에서 실제 값을 꺼내 파이썬 status_key.NAMESPACED_CATEGORIES 와 대조한다(정규식으로 긁지 않는다).
    import subprocess
    import status_key as SK
    drv = ("const fs=require('fs'),vm=require('vm');const c={};vm.createContext(c);"
           "for(const f of process.argv.slice(1))vm.runInContext(fs.readFileSync(f,'utf8'),c);"
           "process.stdout.write(JSON.stringify(vm.runInContext("
           "'[NAMESPACED_CATEGORIES, LEGACY_NAMESPACED_CATEGORIES, DATASET_REGISTRY.map(d=>[d.category, keyCategoryOf(d.category)])]',c)));")
    r = subprocess.run(["node", "-e", drv, str(ROOT / "js" / "datasets.js"), str(ROOT / "js" / "status-key.js")],
                       capture_output=True, text=True)
    if r.returncode:
        problems.append(f"node 로 status-key 를 못 읽었다: {r.stderr.strip()[:300]}")
        js_ns, js_legacy, js_kc = [], [], []
    else:
        js_ns, js_legacy, js_kc = json.loads(r.stdout)
    if list(js_ns) != list(SK.NAMESPACED_CATEGORIES):
        problems.append(f"네임스페이스 목록이 다르다\n   js: {js_ns}\n   py: {list(SK.NAMESPACED_CATEGORIES)}")
    if not set(js_legacy) <= set(js_ns):
        problems.append(f"옛 네임스페이스가 빠졌다(기록이 고아가 된다): {sorted(set(js_legacy) - set(js_ns))}")
    py_kc = [[d.get("category"), SK.key_category_of({"category": d.get("category")})] for d in py]
    if [list(x) for x in js_kc] != py_kc:
        problems.append(f"키 카테고리가 다르다\n   js: {js_kc}\n   py: {py_kc}")
    ns = set(js_ns)
    cats = {SK.key_category_of({"category": d.get("category")}) for d in py if d.get("category")}
    # ★리스트를 내려도 네임스페이스는 남긴다 — Firebase workStatus 가 그 키로 쌓여 있어서,
    #   지우면 지난 작업 이력을 못 읽는다(LP무기록 2026-09-20 철수). 은퇴분은 예외로 둔다.
    RETIRED_NS = {'LP무기록', 'tou', '재방문'}
    unknown = ns - cats - RETIRED_NS
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
