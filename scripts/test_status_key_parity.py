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
from status_key import build_status_key_index, load_rows  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

JS_DRIVER = r"""
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=process.argv[2], DATA=process.argv[3], OUT=process.argv[4];
const DATASETS=[['site-data.json','실효'],['skt-data.json','skt'],
                ['tou-data.json','tou'],['rework-data.json','재방문']];
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "data"))
    args = ap.parse_args()
    data_dir = os.path.abspath(args.data_dir)
    print("데이터:", data_dir)

    rows = load_rows(data_dir)
    py_map, py_split = build_status_key_index(rows)
    print("python: 레코드 {}건 / 마커 {}개 / 갈린 주소 {}건".format(
        len(rows), len(py_map), len(py_split)))

    with tempfile.TemporaryDirectory() as td:
        drv = os.path.join(td, "driver.js")
        out = os.path.join(td, "out.json")
        with open(drv, "w", encoding="utf-8") as f:
            f.write(JS_DRIVER)
        r = subprocess.run([("node"), drv, ROOT, data_dir, out],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("[오류] node 실행 실패:\n", r.stderr)
            return 1
        with open(out, encoding="utf-8") as f:
            js = json.load(f)

    js_map, js_split = js["byMarker"], js["split"]
    print("js    : 마커 {}개 / 갈린 주소 {}건".format(len(js_map), len(js_split)))

    problems = []
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
