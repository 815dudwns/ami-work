#!/usr/bin/env python3
# 삼상(G3) 전수 + 비-G3 고PWR/대표 단상 getDetail 수집. 읽기(GET)만.
import json, subprocess, os, sys, time, random
HERE = os.path.dirname(os.path.abspath(__file__))

def cdp(js):
    return subprocess.run(["python3", os.path.join(HERE, "cdp_eval.py"), js],
                          capture_output=True, text=True).stdout

def getdetail(cons, cntr, seq):
    js = ('(async()=>{const r=await fetch('
          f'"/ami/mob/mtr/mobMtr1000/getDetail?FLAG=1&HDQR_CD=3970&CONS_NO={cons}&CNTR_NO={cntr}&CONS_TGT_SEQNO={seq}"'
          ',{credentials:"include"});return JSON.stringify({s:r.status,t:await r.text()});})()')
    raw = cdp(js).strip()
    try:
        wrap = json.loads(raw)
        status = wrap.get("s")
        body = wrap.get("t", "")
        d = json.loads(body)
        row = d[0] if isinstance(d, list) and d else (d if isinstance(d, dict) else None)
        return status, row
    except Exception:
        return None, {"__parsefail": raw[:300]}

def mtype(w):
    p = w[2:4] if w and len(w) >= 4 else ""
    return {"17":"E","19":"EA","25":"G","26":"G","27":"G","45":"G3","46":"G3","47":"G3","53":"Amigo","55":"Amigo3"}.get(p, "?:"+p)

rows = json.load(open(os.path.join(HERE, "all_complete_rows.json")))
for r in rows:
    r["__type"] = mtype(r["WHM_NO"])

g3 = [r for r in rows if r["__type"] == "G3"]
non = [r for r in rows if r["__type"] != "G3"]
# 고PWR 비-G3 전부 (핵심: 삼상 조건 필요성 판별). max가 10이므로 PWR>=10 전부.
non_hi = [r for r in non if (r.get("CNTR_PWR") or 0) >= 10]
# 대표 단상 랜덤 20건 (예외 4칸 탐지)
random.seed(42)
non_lo = [r for r in non if (r.get("CNTR_PWR") or 0) < 10]
non_sample = random.sample(non_lo, min(20, len(non_lo)))

targets = []
for r in g3:
    r["__bucket"] = "G3_full"; targets.append(r)
for r in non_hi:
    r["__bucket"] = "nonG3_hiPWR"; targets.append(r)
for r in non_sample:
    r["__bucket"] = "nonG3_sample"; targets.append(r)

FIELDS_QTT = ["DGD_WHME_NDL_DAY_QTT","DGD_WHME_NDL_MNGT_QTT","DGD_DM_MT_NDL_DAY_QTT","DGD_VAR_NDL_DAY_QTT"]
FIELDS_DGTS = ["DGD_WHME_NDL_DGTS","DGD_DM_MT_NDL_DGTS","DGD_VAR_NDL_DGTS"]

OUT = os.path.join(HERE, "samsang_detail_full.json")
results = []
total = len(targets)
for i, r in enumerate(targets):
    status, d = getdetail(r["CONS_NO"], r["CNTR_NO"], r["CONS_TGT_SEQNO"])
    rec = {
        "WHM_NO": r["WHM_NO"], "type": r["__type"], "bucket": r["__bucket"],
        "CNTR_PWR": r.get("CNTR_PWR"), "CNTR_CLAS_CD": r.get("CNTR_CLAS_CD"),
        "LAY_METR_CL_CD": r.get("LAY_METR_CL_CD"),
        "http_status": status,
    }
    if isinstance(d, dict) and not d.get("__parsefail"):
        for f in FIELDS_QTT + FIELDS_DGTS:
            rec[f] = d.get(f, None)
        # 판별: DM_DGTS 또는 VAR_DGTS 채워짐 => 4칸
        dm = str(d.get("DGD_DM_MT_NDL_DGTS", "") or "").strip()
        var = str(d.get("DGD_VAR_NDL_DGTS", "") or "").strip()
        rec["awms_fields"] = 4 if (dm or var) else 1
    else:
        rec["__error"] = d.get("__parsefail") if isinstance(d, dict) else str(d)
        rec["awms_fields"] = None
    results.append(rec)
    if (i+1) % 10 == 0 or i+1 == total:
        json.dump(results, open(OUT, "w"), ensure_ascii=False, indent=2)
        print(f"PROGRESS {i+1}/{total} last={rec['WHM_NO']} pwr={rec['CNTR_PWR']} fields={rec['awms_fields']} http={status}", flush=True)
    time.sleep(0.15)

json.dump(results, open(OUT, "w"), ensure_ascii=False, indent=2)
ok = sum(1 for r in results if r["awms_fields"] is not None)
print(f"DONE total={total} ok={ok} fail={total-ok}", flush=True)
