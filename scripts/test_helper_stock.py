#!/usr/bin/env python3
"""Helper inject v97 자재관리 — parity and offline build test (2026-11-14).

    python3 scripts/test_helper_stock.py              # kind parity + build cases
    python3 scripts/test_helper_stock.py --cache      # + run the JS build on responses rebuilt from
                                                      #   the backend cache and print the type table

1. Parity: the inject's stockKind() (between [v97-kind-begin] / [v97-kind-end]) is run in node and
   compared with scripts/my_stock.py kind() over the current stock list (backend shipped_cache rows
   + ledger + offbook ledger) plus edge prefixes. my_stock.kind() reads the physical-label override
   file for AE/E; the helper has no such screen yet, so the comparison is against kind() with that
   override disabled (every AE/E = AE). The override count is printed as a known difference.
2. Build: stockBuild() (between [v97-build-begin] / [v97-build-end]) on synthetic responses — every
   exclusion rule and the off-book overlap rule.
No awms call, no Firebase call.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = Path("/Users/woodelight/Projects/ami-work")
sys.path.insert(0, str(ROOT / "scripts"))
INJECT = ROOT / "awms-bridge-inject.js"


def backend_file(name):
    for base in (ROOT, MAIN):
        p = base / "cst-input/backend" / name
        if p.exists():
            return p
    return None


def js_part(tag):
    s = INJECT.read_text()
    a, b = s.index(f"// [{tag}-begin]"), s.index(f"// [{tag}-end]")
    return s[a:b]


def run_node(prog, payload):
    t = INJECT.read_text()
    mfe = t[t.index("  var MAC_OUI = ["):t.index("  // [맥 오류] 박스.")]
    src = ("var STOCK_SINCE='20260622';\n" + mfe + js_part("v97-kind") + js_part("v97-check") + "\nfunction stockNorm(m){return String(m||'')"
           ".replace(/[\\s:\\-*]/g,'').toUpperCase();}\n" + js_part("v97-build") + "\n"
           "var IN=JSON.parse(require('fs').readFileSync(0,'utf8'));\n" + prog)
    r = subprocess.run(["node", "-e", src], input=json.dumps(payload), capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("node 실패:\n" + r.stderr)
    return json.loads(r.stdout)


def corpus():
    macs = set()
    p = backend_file("shipped_cache.json")
    if p:
        d = json.loads(p.read_text())
        macs |= set(d.get("rows") or {}) | set(d.get("ledger") or []) | set(d.get("used") or [])
    p = backend_file("offbook_stock.json")
    if p:
        for bt in json.loads(p.read_text()).get("batches", []):
            macs |= {m.upper() for m in bt.get("macs", [])}
    macs |= {"", "012", "01249700000", "01249800000", "01253600000", "01264200000", "01254000000",
             "01254500000", "01255600000", "01223200000", "8472070E3000", "8472070E4000", "8472070D9000",
             "8472070DA335", "847207E00000", "847207B00000", "847207C00000", "847207D00000", "E0AEED000000",
             "AC5E8CA00000", "AC5E8CB00000", "AC5E8CB10000", "44B433000000", "0014B0000000", "ZZZ", "ac5e8cb0aaaa"}
    return sorted(macs)


def parity():
    import my_stock
    macs = corpus()
    override = my_stock._confirmed_type
    my_stock._confirmed_type = lambda m: None   # helper: no physical-label AE/E yet
    try:
        py = {m: my_stock.kind(m.upper()) for m in macs}
    finally:
        my_stock._confirmed_type = override
    js = run_node("var o={};IN.forEach(function(m){o[m]=stockKind(m);});process.stdout.write(JSON.stringify(o));", macs)
    bad = [f"{m!r}: py {py[m]!r} js {js[m]!r}" for m in macs if py[m] != js[m]]
    ov = backend_file("stock_type_override.json")
    e_marked = 0
    if ov:
        e_marked = sum(1 for v in json.loads(ov.read_text()).get("macs", {}).values() if v.get("type") == "E")
    print(f"  kind 대조: 맥 {len(macs):,}개 · 다름 {len(bad)} (실물 라벨 E 확정 {e_marked}개는 헬퍼에선 AE — 알려진 차이)")
    return bad


def R(mac, ymd="20261001", hnd="18104059", sts="N1", reg=0):
    return {"FCTY_ID": mac, "WRHSG_SHP_YMD": ymd, "HNDOVR_USER_ID": hnd, "MTRL_STS_CD": sts, "REG_DATE": reg}


def M(mac, wd="M1010", div="10", date="20261114", meter="1", ext="-"):
    return {"MAC_MODEM": mac, "WORK_DIV": wd, "MODEM_DIV": div, "WORK_DATE": date, "INSTR_NUM": meter, "EXT_FCTY_ID": ext}


def build_cases():
    r20 = [R("01254500001"),                       # G, held
           R("01223200001"),                       # LTE AE, used today
           R("01223200002", hnd="273584"),         # self handover (장애 교체) -> drop
           R("01223200003", ymd="20260610"),       # before 6/22 -> drop
           R("01223200004"),                       # not owned (N) -> drop
           R("01223200005"),                       # booked old modem removed by 교체 -> drop
           R("E0AEED000001", ymd="20260601")]      # before 6/22 but also in 인계 -> kept
    r20N = [R("01223200004")]
    r40 = [R("E0AEED000001", ymd="20260601"), R("AC5E8CB00001", ymd="20260501")]
    main = [M("01223200001", meter="A"), M("01223200001", div="20", meter="B"),
            M("01223200001", meter="A"),           # re-sent: same meter counted once today
            M("01264200009", wd="M1020", meter="C", ext="01223200005"),
            M("AC5E8CA00009", meter="D", date="20261113"),     # off-book used yesterday
            M("E0AEED999999", wd="M1030", meter="E")]          # 기설: not a new modem, not today-used
    off = {"AC5E8CA00007": {"addedAt": 1}, "AC5E8CA00009": {"addedAt": 2}, "01254500001": {"addedAt": 3}}
    out = run_node("process.stdout.write(JSON.stringify(stockBuild('273584',IN.r20,IN.r20N,IN.r40,IN.r40N,IN.main,IN.off,'20261114')));",
                   {"r20": r20, "r20N": r20N, "r40": r40, "r40N": [], "main": main, "off": off})
    lst = {r["mac"]: r for r in out["list"]}
    offd = {o["mac"]: o for o in out["off"]}
    want = [
        (set(lst), {"01254500001", "01223200001", "E0AEED000001", "AC5E8CB00001"}, "보유·사용 목록"),
        (out["drop"], {"self": 1, "before": 1, "notOwned": 1, "ext": 1}, "뺀 것"),
        (lst["01223200001"]["used"], True, "시공된 맥 = 사용"),
        ("E0AEED000001" in lst, True, "6/22 이전 출고라도 인계에 있으면 남김"),
        (out["todayUsed"], {"LTE 모뎀(AE타입)": 1, "LTE 모뎀(AMIGO)": 1}, "오늘 사용 = 신설·교체 마스터, 계기당 1회"),
        (offd["01254500001"]["inAwms"], True, "따로장부 맥이 awms 에 들어옴"),
        (offd["AC5E8CA00009"]["used"], True, "따로장부 맥 시공 = 사용"),
        (out["counts"], {"LTE 모뎀(G타입)": {"awms": 1, "off": 0}, "PLC모뎀(AE타입)": {"awms": 1, "off": 0},
                         "IotPLC모뎀(AMIGO)": {"awms": 1, "off": 0}, "IotPLC모뎀(AE타입)": {"awms": 0, "off": 1}},
         "종류별 보유 — awms 와 따로장부 겹침 없이 한 번"),
    ]
    bad = [f"{name}: {got!r} != {exp!r}" for got, exp, name in want if got != exp]
    print(f"  build 시험 {len(want)}건 · 실패 {len(bad)}")
    return bad


def check_cases():
    """Pending-list check on each scanned row (stockCheckLocal)."""
    build = {"ledger": {"01254500001": 1}, "off": [{"mac": "AC5E8CA00007"}]}
    pend = [{"mac": "AC5E8CA00008"}]
    cases = [("AC5E8CA00009", ""), ("01254500001", "awms 등록 자재 — 별도 등록 불가"), ("AC5E8CA00007", "별도 관리 자재 기등록"),
             ("AC5E8CA00008", "중복 스캔"), ("AC5E8CA0001", "MAC 형식 오류"), ("123456789012", "MAC 형식 오류"),
             ("01264200001", ""), ("", "MAC 미입력")]
    got = run_node("process.stdout.write(JSON.stringify(IN.c.map(function(c){return stockCheckLocal(c,IN.b,IN.p);})));",
                   {"c": [c for c, _ in cases], "b": build, "p": pend})
    bad = [f"check {c!r}: {g!r} (기대 {w!r})" for (c, w), g in zip(cases, got) if (w == "" and g) or (w and w not in g)]
    print(f"  대기 목록 검사 {len(cases)}건 · 실패 {len(bad)}")
    return bad


def cache_run():
    """Rebuild raw responses from the backend cache (session is dead, so no live call) and print the table."""
    d = json.loads(backend_file("shipped_cache.json").read_text())
    import datetime
    r20, r40, r20N, r40N = [], [], [], []
    for x in d.get("recv") or []:
        row = d["rows"].get(x["mac"]) or {}
        ymd = row.get("ymd") or datetime.datetime.fromtimestamp(x["regTs"] / 1000).strftime("%Y%m%d")
        raw = R(x["mac"], ymd=ymd, hnd="273584" if x.get("self") else "-", sts=row.get("sts", ""))
        (r20 if x["src"] == "20" else r40).append(raw)
        if row and not row.get("owned"):
            (r20N if x["src"] == "20" else r40N).append(raw)
    main = [M(m, meter=m, date="") for m in d.get("used") or []]
    off = {}
    p = backend_file("offbook_stock.json")
    if p:
        for bt in json.loads(p.read_text()).get("batches", []):
            for m in bt.get("macs", []):
                off[m.upper()] = {"addedAt": 0}
    out = run_node("process.stdout.write(JSON.stringify(stockBuild('273584',IN.r20,IN.r20N,IN.r40,IN.r40N,IN.main,IN.off,'00000000')));",
                   {"r20": r20, "r20N": r20N, "r40": r40, "r40N": r40N, "main": main, "off": off})
    print(f"\n  캐시 기준(출고목록 {datetime.datetime.fromtimestamp(d['ts']):%m/%d %H:%M} · 시공 {datetime.datetime.fromtimestamp(d['usedTs']):%m/%d %H:%M})")
    print("  뺀 것", out["drop"], "(교체로 뗀 옛 모뎀은 캐시에 EXT_FCTY_ID 가 없어 0)")
    ta = to = 0
    for k, v in sorted(out["counts"].items()):
        print(f"    {k:20} awms {v['awms']:4}  따로장부 {v['off']:3}  합계 {v['awms'] + v['off']:4}")
        ta += v["awms"]
        to += v["off"]
    print(f"    {'합계':20} awms {ta:4}  따로장부 {to:3}  합계 {ta + to:4}")
    return out, d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", action="store_true")
    a = ap.parse_args()
    bad = parity() + build_cases() + check_cases()
    for b in bad[:30]:
        print("  FAIL", b)
    print("FAIL" if bad else "PASS", f"({len(bad)})")
    if a.cache:
        cache_run()
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
