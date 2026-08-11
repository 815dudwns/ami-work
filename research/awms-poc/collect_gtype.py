#!/usr/bin/env python3
# 전 차수 workStep=28 완료행 수집 → WHM_NO dedup → 계기타입 분류 + G삼상 후보 추출
import json, subprocess, os
HERE = os.path.dirname(os.path.abspath(__file__))

def cdp(js):
    out = subprocess.run(["python3", os.path.join(HERE, "cdp_eval.py"), js],
                         capture_output=True, text=True)
    return out.stdout

def fetch_json(path):
    js = f'''(async()=>{{
      const r = await fetch("{path}",{{credentials:"include"}});
      const t = await r.text();
      return t;
    }})()'''
    raw = cdp(js).strip()
    try:
        return json.loads(raw)
    except Exception as e:
        print("PARSE FAIL", path, repr(raw[:200]))
        return None

# 1. busi list
busi = fetch_json("/ami/mob/mtr/mobMtr1000/getBusiList?DEPT1=3970")
cons_list = [b["CONS_NO"] for b in busi]
print("차수:", cons_list)

# 2. 각 차수 완료행 페이지 루프
all_rows = {}
for cons in cons_list:
    page = 1
    total = None
    got = 0
    while True:
        rows = fetch_json(f"/ami/mob/mtr/mobMtr1000/getMainList?FLAG=1&DEPT1=3970&busiKey={cons}&searchVal=&sortKey=&workStep=28&pPageNo={page}&pRowCount=100")
        if not rows:
            break
        if not isinstance(rows, list) or len(rows)==0:
            break
        if total is None:
            total = rows[0].get("CNT")
        for r in rows:
            whm = r.get("WHM_NO")
            if whm:
                # dedup, keep latest STATUS_MOD_DATE
                ex = all_rows.get(whm)
                if ex is None or (r.get("STATUS_MOD_DATE") or 0) > (ex.get("STATUS_MOD_DATE") or 0):
                    all_rows[whm] = r
        got += len(rows)
        if got >= (total or 0) or len(rows) < 100:
            break
        page += 1
    print(f"  {cons}: total={total} got={got}")

rows = list(all_rows.values())
print("총 완료행(dedup WHM_NO):", len(rows))

def mtype(whm):
    if not whm or len(whm) < 4:
        return "?"
    p = whm[2:4]
    code = {"17":"E","19":"EA","25":"G","26":"G","27":"G",
            "45":"G3","46":"G3","47":"G3","53":"Amigo","55":"Amigo3"}
    return code.get(p, "?:"+p)

# 분류
from collections import Counter
type_counter = Counter()
lay_counter = Counter()
for r in rows:
    t = mtype(r.get("WHM_NO"))
    type_counter[t]+=1
    lay_counter[r.get("LAY_METR_CL_CD")]+=1

print("\n신설계기 WHM_NO 3~4자리 타입 분포:", dict(type_counter))
print("LAY_METR_CL_CD 분포:", dict(lay_counter))

# G삼상 후보 (45/46/47)
g3 = [r for r in rows if mtype(r.get("WHM_NO"))=="G3"]
print("\nG삼상(45/46/47) 후보:", len(g3))

# 대체후보: CNTR_PWR 큰값 또는 LAY!=10
alt = sorted(rows, key=lambda r:-(r.get("CNTR_PWR") or 0))[:15]
print("\nCNTR_PWR 상위 15:")
for r in alt:
    print(f"  WHM={r.get('WHM_NO')} type={mtype(r.get('WHM_NO'))} LAY={r.get('LAY_METR_CL_CD')} CLAS={r.get('CNTR_CLAS_CD')} PWR={r.get('CNTR_PWR')}")

non10 = [r for r in rows if str(r.get("LAY_METR_CL_CD"))!="10"]
print("\nLAY_METR_CL_CD != 10:", len(non10))
for r in non10[:15]:
    print(f"  WHM={r.get('WHM_NO')} type={mtype(r.get('WHM_NO'))} LAY={r.get('LAY_METR_CL_CD')} CLAS={r.get('CNTR_CLAS_CD')} PWR={r.get('CNTR_PWR')}")

# 저장
with open(os.path.join(HERE,"all_complete_rows.json"),"w") as f:
    json.dump(rows, f, ensure_ascii=False)

# 후보 선정: G3 우선, 없으면 PWR상위/non10
candidates = g3[:5]
if not candidates:
    # non10 우선, 그다음 PWR 상위 (단상10 제외 안되면 PWR순)
    pool = non10 if non10 else alt
    candidates = pool[:5]
# 단상 대조 1건 (E 또는 G25)
control = next((r for r in rows if mtype(r.get("WHM_NO")) in ("E","EA","G")), None)

sel = {"candidates":candidates, "control":control}
with open(os.path.join(HERE,"selected_for_detail.json"),"w") as f:
    json.dump(sel, f, ensure_ascii=False)
print("\n후보 저장 완료. candidates:", len(candidates), "control:", bool(control))
