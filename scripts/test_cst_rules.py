#!/usr/bin/env python3
"""cst_rules.py 단일 출처 시험 (2026-11-14).

    python3 scripts/test_cst_rules.py                    # 단일 출처 + 알려진 값
    python3 scripts/test_cst_rules.py --against bb2ef63  # + 그 커밋 app.py 의 옛 정의와 출력 대조(공용화 전후)

1. 단일 출처 — app.py · cst_daily_check.py 가 판정 규칙(맥 형식·통신방식·계기유형·분기)을 스스로 정의하지 않는다.
   (app.py 를 import 하지 않는다 — 소스를 ast 로 읽기만 한다)
2. 알려진 값 — 실측으로 확정된 사례.
3. --against — 옛 app.py 에서 같은 이름의 정의만 뽑아 실행하고, 계기번호·맥 표본 전부에 같은 답을 내는지.
"""
import argparse
import ast
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = Path("/Users/woodelight/Projects/ami-work")
sys.path.insert(0, str(ROOT / "cst-input/backend"))
import cst_rules as R  # noqa: E402

RULE_FUNCS = {"mac_format_error", "_mac_raw_suffix", "infer_inst_s", "infer_inst_m", "slave_bungi", "meter_kind"}
RULE_NAMES = {"MAC_OUI", "MAC_847207_C7", "_MAC_HEX", "_TYPE_MAP", "_TYPE_TO_INSTM", "BUNGI_CHOICES",
              "COMM_SUFFIX_LABELS", "_COMM_LABEL"}


def defined(src):
    t = ast.parse(src)
    fs = {n.name for n in t.body if isinstance(n, ast.FunctionDef)}
    vs = {x.id for n in t.body if isinstance(n, ast.Assign) for x in n.targets if isinstance(x, ast.Name)}
    return fs, vs


def single_source():
    bad = []
    for rel in ("cst-input/backend/app.py", "scripts/cst_daily_check.py"):
        fs, vs = defined((ROOT / rel).read_text())
        for n in sorted((fs & RULE_FUNCS) | (vs & RULE_NAMES)):
            bad.append(f"{rel} 가 {n} 를 스스로 정의 — cst_rules.py 를 써라")
    src = (ROOT / "cst-input/backend/app.py").read_text()
    if 's_bungi = "무선" if' in src:
        bad.append("app.py 가 슬레이브 분기를 직접 계산 — cst_rules.slave_bungi 를 써라")
    return bad


KNOWN = [
    # (함수, 인자, 기대) — 실측 확정
    (R.infer_inst_m, ("45520006380",), "HW4050"),      # 타입코드 52 = 아미고(11/12 검사 '?' 오탐)
    (R.infer_inst_m, ("A0550070511",), "HW4050"),
    (R.infer_inst_m, ("47452030837",), "HW4030"),
    (R.infer_inst_m, ("91190220430",), "HW4040"),
    (R.infer_inst_s, ("HW4040", "AC5E8CA863B0"), "HW404090"),   # AC5E8C = K-DCU
    (R.infer_inst_s, ("HW4040", "8472070E3123"), "HW404010"),   # 8472070E3 = KS-PLC
    (R.infer_inst_s, ("HW4050", "01264265356"), "HW405092"),    # LTE + 아미고 = SMGW-C
    (R.infer_inst_s, ("HW4030", "01254537242"), "HW403070"),    # LTE + G = LTE_IV
    (R.infer_inst_s, ("HW4040", "44B433000001"), "HW404020"),   # HPGP
    (R.slave_bungi, ("92", "HW4050"), ("무선", True)),
    (R.slave_bungi, ("70", "HW4050"), ("0.5", False)),          # 11/12 02550211777: LTE_IV 함체 아미고 슬레이브
    (R.slave_bungi, ("92", "HW4040"), ("0.5", False)),
    (R.slave_bungi, ("10", "HW4050"), ("0.5", False)),
]


def known():
    bad = []
    for f, args, want in KNOWN:
        got = f(*args)
        if got != want:
            bad.append(f"{f.__name__}{args} = {got!r}, 기대 {want!r}")
    if R.mac_format_error("947207000000").get("suggest") != "847207":
        bad.append("mac_format_error 947207 후보")
    return bad


def corpus():
    macs, meters = set(), set()
    for base in (ROOT, MAIN):
        p = base / "cst-input/backend/shipped_cache.json"
        if p.exists():
            macs |= set(json.loads(p.read_text())["rows"])
            break
    for jp in (Path.home() / ".ami-cst-archive").glob("*/*/job.json"):
        try:
            j = json.loads(jp.read_text())
        except Exception:
            continue
        for s in j.get("sent") or []:
            f = s.get("fields") or {}
            if f.get("MAC_MODEM"):
                macs.add(f["MAC_MODEM"])
            if f.get("INSTR_NUM"):
                meters.add(f["INSTR_NUM"])
    p = ROOT / "data/stats-site-index.json"
    if p.exists():
        meters |= {r["계기번호"] for r in json.loads(p.read_text()) if r.get("계기번호")}
    # 경계값
    macs |= {"", "012", "0125453724", "012545372421", "947207000000", "8472070D9000", "8472070E3000",
             "8472070E4000", "847207000000", "847207E00000", "847207B00000", "847207F00000", "E0AEED000000",
             "E0AEE5000000", "44B433000000", "0014B0000000", "AC5E8C000000", "AC5E8CB00000", "AC5E8G000000",
             "e0:ae:ed:00:00:00", "01254-537242", "ZZZ"}
    meters |= {"", "1", "17", "A0550070511", "LA530151258", "9419007057", "071909442S1"}
    return sorted(macs), sorted(meters)


def against(rev):
    src = subprocess.run(["git", "-C", str(ROOT), "show", f"{rev}:cst-input/backend/app.py"],
                         capture_output=True, text=True, check=True).stdout
    t = ast.parse(src)
    keep = [n for n in t.body
            if (isinstance(n, ast.FunctionDef) and n.name in RULE_FUNCS)
            or (isinstance(n, ast.Assign) and any(isinstance(x, ast.Name) and x.id in RULE_NAMES for x in n.targets))]
    ns = {"re": __import__("re")}
    exec(compile(ast.Module(body=keep, type_ignores=[]), f"{rev}:app.py", "exec"), ns)
    macs, meters = corpus()
    bad = []
    for n in RULE_NAMES:
        if n in ns and ns[n] != getattr(R, n):
            bad.append(f"{n} 다름")
    insts = sorted({R.infer_inst_m(m) for m in meters} | {"", "HW4010", "HW4020", "HW4030", "HW4040", "HW4050"})
    for m in macs:
        if ns["mac_format_error"](m) != R.mac_format_error(m):
            bad.append(f"mac_format_error({m!r})")
        if ns["_mac_raw_suffix"](m) != R._mac_raw_suffix(m):
            bad.append(f"_mac_raw_suffix({m!r})")
        for im in insts:
            if ns["infer_inst_s"](im, m) != R.infer_inst_s(im, m):
                bad.append(f"infer_inst_s({im!r},{m!r})")
    for m in meters:
        if ns["infer_inst_m"](m) != R.infer_inst_m(m):
            bad.append(f"infer_inst_m({m!r})")
    # 옛 분기 계산식(인라인)과 slave_bungi
    for suf in ("", "10", "20", "40", "70", "80", "90", "92"):
        for im in insts:
            can = (suf == "92") and im == "HW4050"
            if R.slave_bungi(suf, im) != (("무선" if can else "0.5"), can):
                bad.append(f"slave_bungi({suf!r},{im!r})")
    print(f"  옛 정의 대조({rev}): 맥 {len(macs):,} x 계기유형 {len(insts)} · 계기번호 {len(meters):,}")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--against")
    a = ap.parse_args()
    bad = single_source() + known()
    if a.against:
        bad += against(a.against)
    for b in bad[:30]:
        print("  FAIL", b)
    print("FAIL" if bad else "PASS", f"({len(bad)})")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
