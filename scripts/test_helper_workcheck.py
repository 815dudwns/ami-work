#!/usr/bin/env python3
"""Helper inject v102 작업 검사 — parity with the Mac check (scripts/cst_daily_check.py), no network.

    python3 scripts/test_helper_workcheck.py                    # function parity + every synthetic case
    python3 scripts/test_helper_workcheck.py --fixture DIR      # + one real day: DIR/rows.json details.json ws_full.json (or ws_day.json)
                                                                #   (day = --day, default 20261116), prints the phone result

1. Functions: the inject's wcMacSuffix / wcInferS / wcInferM / wcSlaveBungi / wcMacErr (between
   [v102-wc-begin] / [v102-wc-end]) vs cst_rules over the MAC corpus (backend shipped_cache + off-book ledger +
   edge prefixes) and every list meter in data/stats-site-index.json.
2. Cases: every case of scripts/test_cst_daily_check.py is run through Python app_check AND the JS wcCheck on
   the same rows, details, ledger and list index. They must give the same red/yellow items (kind + modem +
   meters) and the same '대표계기 자기 번호' notes.
3. Fixture: same comparison on a real day. Python = app_check + map_check with --no-ocr semantics (archive jobs
   off — 아미큐 보관함 items are Mac-only). List-outside meters are compared as a set over the day's rows:
   Mac (awms + map side) vs phone (리스트 밖 + 번호 1자리 차이).
Map side (2026-11-16) is compared too: 누락 · 지도 없음 · 메모 1자리 차이 · 메모 번호 없음 · 지도 계기 없음 ·
지도 완료 안 함 · 지도 불가. Not compared (by design): OCR, stock reconcile, grey and plain green notes.
Fixtures hold awms rows (customer data) — keep them outside the repo.
"""
import argparse
import io
import json
import subprocess
import sys
from collections import defaultdict
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "cst-input/backend"))
import cst_daily_check as C  # noqa: E402
import cst_rules as R  # noqa: E402

INJECT = ROOT / "awms-bridge-inject.js"
MAC_LEVEL = {"마스터 2개", "맥 재사용", "장부 밖 맥", "남의 자재", "기설 맥 오류", "기설 맥 미상", "기설 의심"}
SKIP_PY = {"사진 부족",                      # 아미큐 보관함(Mac only)
           "설치불가 등록 누락", "지도 불가 설치", "지도 불가 아님"}   # 2c 설치불가 대조(2026-11-24) — 맥 전용, 폰은 아직 안 봄
# 2026-11-24 맥은 '지도 불가'(awms 설치) 를 빨강으로 올렸다 — 폰(inject v106)은 아직 노랑. 헬퍼가 따라올 때까지 알려진 차이
PHONE_LEVEL = {("red", "지도 불가"): "yellow"}


def js_src():
    t = INJECT.read_text()
    part = lambda tag: t[t.index(f"// [{tag}-begin]"):t.index(f"// [{tag}-end]")]
    mfe = t[t.index("  var MAC_OUI = ["):t.index("  // [맥 오류] 박스.")]
    return mfe + part("v97-kind") + part("v102-wc")


def node(prog, payload):
    src = js_src() + "\nvar IN=JSON.parse(require('fs').readFileSync(0,'utf8'));\n" + prog
    r = subprocess.run(["node", "-e", src], input=json.dumps(payload, ensure_ascii=False), capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("node 실패:\n" + r.stderr[-3000:])
    return json.loads(r.stdout)


# ── 1. functions ──────────────────────────────────────────────────────────────
def mac_corpus():
    macs = set()
    for base in (ROOT, C.MAIN):
        p = base / "cst-input/backend/shipped_cache.json"
        if p.exists():
            d = json.loads(p.read_text())
            macs |= set(d.get("rows") or {}) | set(d.get("ledger") or []) | set(d.get("used") or [])
            break
    macs |= set(C.offbook())
    for pre in ("012497", "012545", "012642", "8472070E3", "8472070D9", "8472070AA", "847207E1", "847207B", "847207C",
                "847207D", "8472071", "847207", "E0AEED", "AC5E8CB0", "AC5E8C11", "44B433", "0014B0", "947207", "E0AEE5", "ABCDEF"):
        macs |= {pre + "0" * (12 - len(pre)), pre + "1234", pre}
    macs |= {"0125453571", "012545357190", "01254535719", "", "012-5453-5719", "e0aeed90044b", "E0AEED90044G"}
    return sorted(macs)


def test_functions():
    macs = mac_corpus()
    meters = sorted({r["계기번호"] for r in json.loads((ROOT / "data/stats-site-index.json").read_text())} |
                    {"A0550070511", "LA530151258", "9419007057", "", "1", "3919048106A"})
    ims = ["HW4010", "HW4020", "HW4030", "HW4040", "HW4050", ""]
    out = node("""
      var o={suf:{},s:{},m:{},e:{}};
      IN.macs.forEach(function(m){o.suf[m]=wcMacSuffix(m);o.e[m]=!!wcMacErr(m);IN.ims.forEach(function(i){o.s[i+'|'+m]=wcInferS(i,m);});});
      IN.meters.forEach(function(n){o.m[n]=wcInferM(n);});
      o.b={};['92','70','10','90','',].forEach(function(s){IN.ims.forEach(function(i){o.b[s+'|'+i]=wcSlaveBungi(s,i);});});
      console.log(JSON.stringify(o));""", {"macs": macs, "meters": meters, "ims": ims})
    bad = []
    for m in macs:
        if out["suf"][m] != R._mac_raw_suffix(m):
            bad.append(("suffix", m, out["suf"][m], R._mac_raw_suffix(m)))
        if out["e"][m] != bool(R.mac_format_error(m)):
            bad.append(("macerr", m, out["e"][m], R.mac_format_error(m)))
        for i in ims:
            if out["s"][f"{i}|{m}"] != R.infer_inst_s(i, m):
                bad.append(("inst_s", i, m, out["s"][f"{i}|{m}"], R.infer_inst_s(i, m)))
    for n in meters:
        if out["m"][n] != R.infer_inst_m(n):
            bad.append(("inst_m", n, out["m"][n], R.infer_inst_m(n)))
    for k, v in out["b"].items():
        s, i = k.split("|")
        if tuple(v) != R.slave_bungi(s, i):
            bad.append(("bungi", k, v, R.slave_bungi(s, i)))
    ns = node("console.log(JSON.stringify([WC_NS_CODES, WC_PRE_SPLIT]));", {})
    if {k: tuple(v) for k, v in ns[0].items()} != C.NS_LIST or {k: tuple(v) for k, v in ns[1].items()} != C.PRE_SPLIT_FALLBACK:
        bad.append(("ns table", ns, C.NS_LIST, C.PRE_SPLIT_FALLBACK))
    print(f"{'PASS' if not bad else 'FAIL'} 함수 대조 — 맥 {len(macs)} · 계기 {len(meters)} · 상태키 이름표")
    for b in bad[:20]:
        print("      ", b)
    return not bad


# ── comparison ────────────────────────────────────────────────────────────────
def si_from_idx(idx):
    """stats-style {meter: [{주소, l, 지사}]} -> search-index shape (prefix as the real index strips it)."""
    jisa, sites, slots, rows = [], {}, [], []
    for no, xs in idx.items():
        for x in xs:
            if x["지사"] not in jisa:
                jisa.append(x["지사"])
            a = x["주소"].replace("서울특별시 ", "", 1)
            sk = (a, x["지사"])
            if sk not in sites:
                sites[sk] = len(sites)
            if [x["l"], 0] not in slots:
                slots.append([x["l"], 0])
            rows += [no, sites[sk], slots.index([x["l"], 0])]
    site_list = [None] * len(sites)
    for (a, j), i in sites.items():
        site_list[i] = [a, "", 0, 0, jisa.index(j)]
    names = {s[0]: s[0] for s in slots if s[0] != "a"}
    return {"v": 1, "slots": slots, "jisa": jisa, "sites": site_list, "rows": rows}, names


def py_keys(items, day_meters=None):
    keys, outl = set(), set()
    for x in items:
        k = x.get("kind")
        if not k or k in SKIP_PY:
            continue
        lv = x["level"]
        ms = x.get("meters") or ([x["meter"]] if x.get("meter") else [])
        if lv == "outlist" or k == "지도 없음":
            outl |= set(ms)
            continue
        if lv == "green" and k != "대표계기 자기 번호":
            continue
        lv = PHONE_LEVEL.get((lv, k), lv)
        keys.add((lv, k, x.get("mac", ""), () if k in MAC_LEVEL else tuple(sorted(set(ms)))))
    if day_meters is not None:
        outl &= day_meters
    return keys, outl


def js_keys(items):
    keys, outl = set(), set()
    for x in items:
        k, lv, ms = x["kind"], x["lv"], x.get("meters") or []
        if k in ("지도 없음", "번호 1자리 차이"):
            outl |= set(ms[:1] if k == "번호 1자리 차이" else ms)
            continue
        if k == "누락 후보" or lv == "grey" or (lv == "green" and k != "대표계기 자기 번호"):
            continue
        keys.add((lv, k, x.get("mac", ""), () if k in MAC_LEVEL else tuple(sorted(set(ms)))))
    return keys, outl


def js_check(day, rows, details, own, off, si, names, ws=None, me=C.ME):
    return node("console.log(JSON.stringify(wcCheck({day:IN.day,rows:IN.rows,details:IN.det,own:IN.own,off:IN.off,si:IN.si,names:IN.names,ws:IN.ws,me:IN.me})));",
                {"day": day, "rows": rows, "det": details, "own": own, "off": off, "si": si, "names": names, "ws": ws or {}, "me": me})


def compare(name, py_items, js_res, day_meters=None):
    pk, po = py_keys(py_items, day_meters)
    jk, jo = js_keys(js_res["items"])
    # known by design: a list-outside meter the Mac settled from the map (개별불가 memo) or the photo read —
    #   the phone reads neither, so it still shows it as 리스트 밖
    known = {m for m in jo - po if any(m in x["msg"] for x in py_items if x["sec"] in ("map", "ocr"))}
    ok = pk == jk and po == jo - known
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f"  (알려진 차이 — 폰만 리스트 밖 {sorted(known)}, 맥은 메모·사진으로 해결)" if ok and known else ""))
    if not ok:
        for k in sorted(pk - jk):
            print("       맥에만:", k)
        for k in sorted(jk - pk):
            print("       폰에만:", k)
        if po != jo:
            print("       리스트 밖 맥:", sorted(po), " 폰:", sorted(jo))
    return ok


# ── 2. synthetic cases ────────────────────────────────────────────────────────
def test_cases():
    import test_cst_daily_check as T
    results = []
    orig = T.run

    def run(rows, details=None, ws=None):
        rep = orig(rows, details, ws)
        snap = json.loads(json.dumps(rep.items))      # snapshot — a case may run the OCR step on it later
        extra = C.Report()                            # the map-state check is not part of the Mac test's run()
        C.map_state_check(T.DAY, rows, T.IDX, ws or {}, extra)
        si, names = si_from_idx(T.IDX)
        res = js_check(T.DAY, rows, details or {}, T.SHIP.get("rows") or {}, {m: 1 for m in C.offbook()}, si, names, ws or {})
        results.append((snap + extra.items, res))
        return rep
    T.run = run
    bad = 0
    for name, f in T.CASES:
        T.IDX.clear()
        results.clear()
        with redirect_stdout(io.StringIO()):
            f()
        for py_items, res in results:
            if not compare(name, py_items, res):
                bad += 1
    T.run = orig
    return bad == 0


# ── 2b. phone-only items (no Mac counterpart) ─────────────────────────────────
def test_phone_only():
    """번호 1자리 차이 (red when the map meter is not in awms, yellow when it is). 누락 후보 was dropped 2026-11-16 —
    the map side (누락 red, 지도 완료 안 함) covers it."""
    import test_cst_daily_check as T
    T.IDX.clear()
    m = T.row("48190262997", "E0AEED953741")
    s1 = T.row("48190262688", "E0AEED953741", modem="20")      # list has ...687 -> typo, ...687 not in awms
    s2 = T.row("48190262555", "E0AEED953741", modem="20")      # one off from ...565, which IS in awms elsewhere
    other = T.row("48190262565", "E0AEED953700", modem="20", mb="48190262565")
    rs = T.group(m, [s1, s2])
    for n in ("48190262997", "48190262687", "48190262565", "48190262111"):
        T.lst(n, "서울특별시 마포구 구수동 1")
    si, names = si_from_idx(T.IDX)
    res = js_check(T.DAY, rs + [dict(other, WORK_DATE="20261101")], {"48190262688": {"BUNGI": "0.5"}, "48190262555": {"BUNGI": "0.5"}},
                   T.SHIP["rows"], {}, si, names)
    got = {(x["lv"], x["kind"], tuple(x.get("meters") or [])) for x in res["items"] if x["sec"] == "list"}
    want = {("red", "번호 1자리 차이", ("48190262688", "48190262687")),
            ("yellow", "번호 1자리 차이", ("48190262555", "48190262565"))}
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'} 폰 전용 — 번호 1자리 차이(빨강·노랑)")
    if not ok:
        print("       got ", sorted(got))
        print("       want", sorted(want))
    T.IDX.clear()
    return ok


# ── 2c. getDetail cache (IndexedDB, per account) ─────────────────────────────
CACHE_PROG = r"""
var calls = [];
function wcDetail(r) { calls.push(r.INSTR_NUM); return Promise.resolve({ BUNGI: '0.5', ATCH_FILE_ID_5: 'F5', WORK_STEP: r.WORK_STEP, CUST_NO: 'x' }); }
var __wc = { det: {} };
function memDB() {   // smallest IndexedDB: one store, async callbacks
  var data = {};
  var later = function (f) { setTimeout(f, 0); };
  var store = function (tx) { return {
    get: function (k) { var q = {}; later(function () { q.result = data[k] ? JSON.parse(data[k]) : undefined; q.onsuccess && q.onsuccess(); }); return q; },
    put: function (v, k) { data[k] = JSON.stringify(v); later(function () { tx.oncomplete && tx.oncomplete(); }); } }; };
  var db = { transaction: function () { var tx = {}; tx.objectStore = function () { return store(tx); }; later(function () { if (!tx._p) tx.oncomplete && tx.oncomplete(); }); return tx; } };
  return { data: data, open: function () { var q = { result: db }; later(function () { q.onupgradeneeded && q.onupgradeneeded(); q.onsuccess && q.onsuccess(); }); return q; } };
}
var rows = [{ BUSI_NUM: 'B', INSTR_NUM: '48190262687', MAC_MODEM: 'e0aeed953741', WORK_STEP: '29' },
            { BUSI_NUM: 'B', INSTR_NUM: '48190262688', MAC_MODEM: 'E0AEED953741', WORK_STEP: '25' }];
var out = {};
function run(uid) { __wc.det = {}; calls = []; return wcDetails(rows, uid).then(function (st) { return { st: st, calls: calls.slice(), b: (__wc.det['48190262687'] || {}).BUNGI }; }); }
var window = {};
run('111').then(function (r) { out.none = r;
  window.indexedDB = { open: function () { throw new Error('blocked'); } };
  return run('111'); }).then(function (r) { out.throws = r;
  var m = memDB(); window.indexedDB = m; out.mem = m;
  return run('111'); }).then(function (r) { out.first = r; out.stored = JSON.parse(out.mem.data['111']);
  return run('111'); }).then(function (r) { out.second = r;
  return run('222'); }).then(function (r) { out.other = r; delete out.mem; console.log(JSON.stringify(out)); });
"""


def test_cache():
    t = INJECT.read_text()
    src = "function wcUp(s) { return String(s || '').toUpperCase(); }\n" + t[t.index("  var WC_DB = "):t.index("  function wcRun(")]
    r = subprocess.run(["node", "-e", src + CACHE_PROG],
                       capture_output=True, text=True)
    if r.returncode:
        print("FAIL 상세 캐시 — node 실패\n" + r.stderr[-1500:])
        return False
    o = json.loads(r.stdout)
    k29 = "B|48190262687|E0AEED953741"
    ok = (o["none"]["st"] == {"hit": 0, "got": 2} and o["none"]["b"] == "0.5"           # IndexedDB 없음 = 그대로 받음
          and o["throws"]["st"] == {"hit": 0, "got": 2}                                    # IndexedDB 오류 = 그대로 받음
          and o["first"]["st"] == {"hit": 0, "got": 2}
          and o["stored"] == {k29: {"BUNGI": "0.5", "ATCH_FILE_ID_5": "F5", "WORK_STEP": "29"}}   # 29 만, 작은 칸만
          and o["second"]["st"] == {"hit": 1, "got": 1} and o["second"]["calls"] == ["48190262688"]
          and o["second"]["b"] == "0.5"
          and o["other"]["st"] == {"hit": 0, "got": 2})                                    # 다른 계정 = 따로
    print(f"{'PASS' if ok else 'FAIL'} 폰 상세 캐시 — 29 만·작은 칸만·계정마다 따로·IndexedDB 없거나 오류면 캐시 없이")
    if not ok:
        print("       ", json.dumps(o, ensure_ascii=False)[:1500])
    return ok


# ── 3. one real day ───────────────────────────────────────────────────────────
def test_fixture(fx, day):
    rows = json.loads((fx / "rows.json").read_text())
    details = json.loads((fx / "details.json").read_text())
    wsf = fx / "ws_full.json" if (fx / "ws_full.json").exists() else fx / "ws_day.json"
    ws = json.loads(wsf.read_text())
    ship = C.fetch_ship(refresh=False)
    idx = C.list_index()
    rep = C.Report()
    with redirect_stdout(io.StringIO()):
        sites = C.map_sites(day, ws, idx)
        done = {m for _, v, ms in sites if v.get("state") == "complete" for m in ms}
        C.app_check(day, rows, ship, idx, details, [], rep, done)
        C.map_check(sites, rows, idx, rep)
        C.map_state_check(day, rows, idx, ws, rep)
    si = json.loads((ROOT / "data/search-index.json").read_text())
    names = json.loads((ROOT / "data/meter-list-index.json").read_text())["__names"]
    res = js_check(day, rows, details, ship.get("rows") or {}, {m: 1 for m in C.offbook()}, si, names, ws)
    day_meters = {r["INSTR_NUM"] for r in rows if r.get("WORK_DATE") == day}
    ok = compare(f"하루 대조 {day} (맥 --no-ocr vs 폰, 지도 포함)", rep.items, res)
    # list 지사 parity: search-index jisa vs stats 지사 for the day's list meters
    js_j = defaultdict(set)
    for i in range(0, len(si["rows"]), 3):
        if si["rows"][i] in day_meters and si["slots"][si["rows"][i + 2]][0] != "a":
            js_j[si["rows"][i]].add(si["jisa"][si["sites"][si["rows"][i + 1]][4]])
    py_j = {m: {x["지사"] for x in idx.get(m, []) if x["l"] != "a"} for m in day_meters}
    diff = [m for m in day_meters if py_j.get(m, set()) != js_j.get(m, set())]
    print(f"{'PASS' if not diff else 'FAIL'} 리스트 지사 대조 {len(day_meters)}계기" + (f" 다름 {diff[:5]}" if diff else ""))
    print("\n폰 결과", day, json.dumps(res["sum"], ensure_ascii=False))
    for x in sorted(res["items"], key=lambda x: ["red", "yellow", "grey", "green"].index(x["lv"])):
        print(f"  {x['lv']:6} {x['sec']:4} {x['kind']:10} {' / '.join(x.get('meters') or [])}"
              f"{' · ' + x['addr'] if x.get('addr') else ''}{' · ' + x['data'] if x.get('data') else ''}")
    print("  모뎀 사용", json.dumps(res["use"], ensure_ascii=False))
    print("  일별", json.dumps(res["days"], ensure_ascii=False))
    return ok and not diff


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture")
    ap.add_argument("--day", default="20261116")
    a = ap.parse_args()
    ok = test_functions()
    ok = test_cases() and ok
    ok = test_phone_only() and ok
    ok = test_cache() and ok
    if a.fixture:
        ok = test_fixture(Path(a.fixture), a.day) and ok
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
