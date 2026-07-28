#!/usr/bin/env python3
import json, subprocess, os
HERE = os.path.dirname(os.path.abspath(__file__))

def cdp(js):
    return subprocess.run(["python3", os.path.join(HERE,"cdp_eval.py"), js],
                          capture_output=True, text=True).stdout

def getdetail(cons,cntr,seq):
    js=f'''(async()=>{{const r=await fetch("/ami/mob/mtr/mobMtr1000/getDetail?FLAG=1&HDQR_CD=3970&CONS_NO={cons}&CNTR_NO={cntr}&CONS_TGT_SEQNO={seq}",{{credentials:"include"}});return await r.text();}})()'''
    raw=cdp(js).strip()
    try:
        d=json.loads(raw)
        return d[0] if isinstance(d,list) and d else d
    except Exception as e:
        return {"__parsefail":raw[:200]}

rows=json.load(open(os.path.join(HERE,"all_complete_rows.json")))
def mtype(w):
    p=w[2:4] if w and len(w)>=4 else ""
    return {"17":"E","19":"EA","25":"G","26":"G","27":"G","45":"G3","46":"G3","47":"G3","53":"Amigo","55":"Amigo3"}.get(p,"?:"+p)

g3=[r for r in rows if mtype(r["WHM_NO"])=="G3"]
# 다양성: PWR 상위 3 + PWR 중간 2
g3_sorted=sorted(g3,key=lambda r:-(r.get("CNTR_PWR") or 0))
samples=g3_sorted[:3]+g3_sorted[len(g3_sorted)//2:len(g3_sorted)//2+2]
# 단상 대조 1건 (E)
control=next(r for r in rows if mtype(r["WHM_NO"])=="E")
control["__role"]="control_단상E"

results=[]
for r in samples+[control]:
    d=getdetail(r["CONS_NO"],r["CNTR_NO"],r["CONS_TGT_SEQNO"])
    d["__row_WHM_NO"]=r["WHM_NO"]
    d["__row_CREMO"]=r.get("CREMO_WHM_NO")
    d["__row_type"]=mtype(r["WHM_NO"])
    d["__row_LAY"]=r.get("LAY_METR_CL_CD")
    d["__row_CLAS"]=r.get("CNTR_CLAS_CD")
    d["__row_PWR"]=r.get("CNTR_PWR")
    d["__role"]=r.get("__role","g3_candidate")
    results.append(d)

json.dump(results,open(os.path.join(HERE,"gtype_detail_samples.json"),"w"),ensure_ascii=False,indent=2)

def fld(d,k):
    v=d.get(k,"")
    if v=="" or v is None: return "비움"
    try:
        if float(v)==0.0: return "0"
    except: pass
    return f"실값({v})"

print(f"{'역할':<14}{'WHM_NO':<13}{'타입':<5}{'LAY':<4}{'CLAS':<5}{'PWR':<5}{'주간WHME':<14}{'야간WHME':<12}{'최대전력DM':<14}{'무효VAR':<12}")
for d in results:
    if d.get("__parsefail"):
        print(d["__row_WHM_NO"],"PARSEFAIL",d["__parsefail"][:80]); continue
    print(f"{d['__role']:<14}{d['__row_WHM_NO']:<13}{d['__row_type']:<5}{str(d['__row_LAY']):<4}{str(d['__row_CLAS']):<5}{str(d['__row_PWR']):<5}"
          f"{fld(d,'DGD_WHME_NDL_DAY_QTT'):<14}{fld(d,'DGD_WHME_NDL_MNGT_QTT'):<12}{fld(d,'DGD_DM_MT_NDL_DAY_QTT'):<14}{fld(d,'DGD_VAR_NDL_DAY_QTT'):<12}")
