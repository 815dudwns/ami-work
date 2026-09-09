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


# ─── Firebase 키 인코딩 대조 ────────────────────────────────────────────────
# ★2026-09-09 추가. 파이썬에 encodeKey 짝이 없어서 고압 집계가 완료 3·불가 1 을
#   "미착수 4건" 으로 잘못 셌다(주소에 `.` 포함). 두 구현이 같은 키를 내는지 여기서 막는다.
# ★js/firebase.js 는 통째로 실행하면 firebase SDK·localStorage 를 찾다 죽는다.
#   그래서 encodeKey/decodeKey **두 함수의 소스만 떼어** vm 에서 돌린다.
KEY_CASES = [
    # 실제로 오판을 냈던 주소들 (고압철거)
    "서울특별시 마포구 백범로 200 (공덕동 439-0 공덕_6.51.1X.지하철_IN(내))",
    "서울특별시 용산구 이촌동 196-3 (철2)한강철교북단LRRU.51.LTE.RRU_L(SS)",
    "서울특별시 강북구 도봉로27길 80-17 (미아동 332-2 소망교회무인중계기/B2F기전실)",
    "서울특별시 마포구 백범로25길 83 (염리동 519번지 염리삼성TRO.51.WIBRO.RO-TM-DAA463-CMHU)",
    # 금지문자 6종 각각 + 조합 + 네임스페이스·구분자가 섞인 상태키 형태
    "a.b", "a#b", "a$b", "a[b", "a]b", "a/b", ".#$[]/",
    "서울특별시 중구 무교동 1.2 (3/4)|고압",
    "서울특별시 종로구 명륜3가 산2-13|합동",
    "주소 없음", "", "이미_dot_인코딩된것처럼_보이는_주소",
]

JS_KEY_DRIVER = r"""
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(process.argv[2],'utf8');
// encodeKey / decodeKey 선언만 떼어 낸다(파일 전체는 SDK 를 찾다 죽는다).
const grab=(name)=>{
  const m=src.match(new RegExp('function\\s+'+name+'\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
  if(!m) throw new Error(name+' 를 js/firebase.js 에서 못 찾았다');
  return m[0];
};
const ctx={}; vm.createContext(ctx);
vm.runInContext(grab('encodeKey')+'\n'+grab('decodeKey'), ctx);
const cases=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
process.stdout.write(JSON.stringify(cases.map(s=>[ctx.encodeKey(s), ctx.decodeKey(ctx.encodeKey(s))])));
"""


def check_key_encoding():
    """js/firebase.js encodeKey/decodeKey 와 status_key.encode_key/decode_key 대조."""
    from status_key import encode_key, decode_key  # noqa: E402

    src = os.path.join(ROOT, "js", "firebase.js")
    if not os.path.exists(src):
        return ["js/firebase.js 가 없다 — 키 인코딩 대조를 건너뛰지 않는다."]
    with tempfile.TemporaryDirectory() as td:
        drv = os.path.join(td, "keydrv.js")
        casef = os.path.join(td, "cases.json")
        with open(drv, "w", encoding="utf-8") as f:
            f.write(JS_KEY_DRIVER)
        with open(casef, "w", encoding="utf-8") as f:
            json.dump(KEY_CASES, f, ensure_ascii=False)
        r = subprocess.run(["node", drv, src, casef], capture_output=True, text=True)
        if r.returncode != 0:
            return ["키 인코딩 대조 실패 — node: " + r.stderr.strip()]
        js_out = json.loads(r.stdout)

    bad = []
    for s, (js_enc, js_dec) in zip(KEY_CASES, js_out):
        py_enc, py_dec = encode_key(s), decode_key(encode_key(s))
        if py_enc != js_enc:
            bad.append("    encode 불일치 {!r}\n      python: {!r}\n      js    : {!r}"
                       .format(s, py_enc, js_enc))
        if py_dec != js_dec:
            bad.append("    decode 불일치 {!r}\n      python: {!r}\n      js    : {!r}"
                       .format(s, py_dec, js_dec))
    if bad:
        return ["Firebase 키 인코딩이 js 와 다르다 (js/firebase.js encodeKey 짝)."] + bad
    print("[키인코딩] status_key.encode_key == js/firebase.js encodeKey ({}케이스)"
          .format(len(KEY_CASES)))
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "data"))
    args = ap.parse_args()
    data_dir = os.path.abspath(args.data_dir)
    print("데이터:", data_dir)
    # ★목록 대조는 건너뛰지 않는다. 못 읽으면 그 자체가 실패다 — 조용히 통과하면
    #   이 검사가 있으나 마나가 된다(2026-09-03~09-07 실제로 그렇게 굴러갔다).
    drift = check_dataset_drift()
    drift += check_key_encoding()

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
