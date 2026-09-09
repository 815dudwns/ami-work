#!/usr/bin/env python3
"""test_status_key_parity.py — js/status-key.js 와 scripts/status_key.py 가 같은 키를 내는지 검사.

두 구현이 어긋나면 배치가 돌 때마다 옛 키가 되살아나거나 새 키가 고아가 된다.
키 규칙을 고칠 때는 반드시 양쪽을 함께 고치고 이 검사를 돌려라.

실행: python3 scripts/test_status_key_parity.py [--data-dir <경로>]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from status_key import DATASETS, build_status_key_index, load_rows  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ★드라이버는 데이터셋 목록을 인자(JSON)로 받는다. 예전엔 여기에 하드코딩해 두어
#   status_key.py 와 따로 놀았고, 그래서 '고압(gapap) 누락'을 이 검사가 못 잡았다(2026-08-18).
JS_DRIVER = r"""
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=process.argv[2], DATA=process.argv[3], OUT=process.argv[4], DSFILE=process.argv[5];
const DATASETS=JSON.parse(fs.readFileSync(DSFILE,'utf8'));
const rows=[];
for (const [f,cat] of DATASETS){
  const p=path.join(DATA,f);
  if(!fs.existsSync(p)) continue;
  for(const r of JSON.parse(fs.readFileSync(p,'utf8'))) rows.push(Object.assign({},r,{category:cat}));
}
const ctx={console:{log(){},warn(){}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/status-key.js'),'utf8'),ctx);
const idx=ctx.buildStatusKeyIndex(rows);
const obj={}; idx.byMarker.forEach((v,k)=>{obj[k]=v;});
fs.writeFileSync(OUT, JSON.stringify({byMarker:obj, split:idx.splitAddresses}));
"""


def app_datasets():
    """데이터셋 정의 **정본**(js/datasets.js)의 지도 데이터셋 목록을 읽는다.

    반환: [(파일이름, category), ...] / 못 읽으면 None.
    ★정본은 js/datasets.js 다. 예전엔 js/map.js 를 정규식으로 긁었는데 2026-09-03 에
      정의가 js/datasets.js 로 옮겨가면서 매칭이 실패했고, 이 검사는 "건너뛴다" 만 찍고
      통과해 버렸다(= 검사의 존재 이유가 사라진 상태로 며칠 굴러감).
      정규식 대신 node 로 모듈을 그대로 읽는다 — 주석·형식이 바뀌어도 안 깨진다.
    """
    src = os.path.join(ROOT, "js", "datasets.js")
    if not os.path.exists(src):
        return None
    drv = ("const m=require(process.argv[1]);"
           "const p=require('path');"
           "process.stdout.write(JSON.stringify("
           "m.DATASETS.map(d=>[p.basename(d.file), d.category])));")
    r = subprocess.run(["node", "-e", drv, src], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return [tuple(x) for x in json.loads(r.stdout)]
    except (ValueError, TypeError):
        return None


def check_dataset_drift():
    """status_key.py 가 쓰는 목록이 정본(js/datasets.js)과 같은지.

    status_key.py 는 scripts/datasets.py(파이썬 거울)에서 목록을 파생한다.
    여기서 어긋나면 거울이 정본을 못 따라간 것이다 — 상태키를 계산하는 자리에서 바로 막는다.
    반환: 문제 문자열 목록(없으면 빈 목록).
    """
    app = app_datasets()
    if app is None:
        return ["데이터셋 정본(js/datasets.js)을 읽지 못했다 — node 설치/모듈 export 확인. "
                "목록 대조 없이 통과시키지 않는다."]
    mine, theirs = set(DATASETS), set(app)
    if mine == theirs:
        print("[목록] scripts/datasets.py == js/datasets.js ({}개)".format(len(mine)))
        return []
    return ["데이터셋 목록이 정본(js/datasets.js)과 다르다.",
            "    정본에만 있음  : {}".format(sorted(theirs - mine) or "(없음)"),
            "    파이썬에만 있음: {}".format(sorted(mine - theirs) or "(없음)"),
            "    ※정본에만 있는 데이터셋은 배치가 상태키를 아예 계산하지 않는다 — "
            "그 리스트의 완료기록이 고아가 되거나 옛 키에 쓰인다.",
            "    고칠 곳: scripts/datasets.py (정본 js/datasets.js 를 그대로 반영)"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "data"))
    args = ap.parse_args()
    data_dir = os.path.abspath(args.data_dir)
    print("데이터:", data_dir)
    # ★목록 대조는 건너뛰지 않는다. 못 읽으면 그 자체가 실패다 — 조용히 통과하면
    #   이 검사가 있으나 마나가 된다(2026-09-03~09-07 실제로 그렇게 굴러갔다).
    drift = check_dataset_drift()

    rows = load_rows(data_dir)
    py_map, py_split = build_status_key_index(rows)
    print("python: 레코드 {}건 / 마커 {}개 / 갈린 주소 {}건".format(
        len(rows), len(py_map), len(py_split)))

    with tempfile.TemporaryDirectory() as td:
        drv = os.path.join(td, "driver.js")
        out = os.path.join(td, "out.json")
        dsf = os.path.join(td, "datasets.json")
        with open(drv, "w", encoding="utf-8") as f:
            f.write(JS_DRIVER)
        # 양쪽이 같은 목록을 보게 한다 — 목록까지 하드코딩하면 검사가 헛돈다.
        with open(dsf, "w", encoding="utf-8") as f:
            json.dump([list(d) for d in DATASETS], f, ensure_ascii=False)
        r = subprocess.run([("node"), drv, ROOT, data_dir, out, dsf],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("[오류] node 실행 실패:\n", r.stderr)
            return 1
        with open(out, encoding="utf-8") as f:
            js = json.load(f)

    js_map, js_split = js["byMarker"], js["split"]
    print("js    : 마커 {}개 / 갈린 주소 {}건".format(len(js_map), len(js_split)))

    problems = list(drift)
    if set(py_map) != set(js_map):
        only_py = sorted(set(py_map) - set(js_map))[:5]
        only_js = sorted(set(js_map) - set(py_map))[:5]
        problems.append("마커 집합 불일치 — python만 {} / js만 {}".format(only_py, only_js))
    if sorted(py_split) != sorted(js_split):
        problems.append("갈린 주소 목록 불일치")

    diff = []
    for mk in sorted(set(py_map) & set(js_map)):
        if py_map[mk] != js_map[mk]:
            diff.append((mk, py_map[mk], js_map[mk]))
    if diff:
        problems.append("상태 키 불일치 {}건".format(len(diff)))
        for mk, a, b in diff[:10]:
            problems.append("    {}\n      python: {}\n      js    : {}".format(mk, a, b))

    if problems:
        print("\nFAIL")
        for p in problems:
            print("  " + p)
        return 1

    print("\nPASS — 마커 {}개 전부 두 구현의 키가 동일".format(len(py_map)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
