#!/usr/bin/env python3
import json, subprocess, os
HERE=os.path.dirname(os.path.abspath(__file__))
def cdp(js):
    return subprocess.run(["python3",os.path.join(HERE,"cdp_eval.py"),js],capture_output=True,text=True).stdout.strip()
missing=["56170819245","56170819256","48171588277","25450076183","56170819248","56170819253"]
busikeys=["397820263032","397820263033","397820263034","397820263035","397820263150","397820263151","397820263153","397820263219"]
found={}
for cons in busikeys:
    for page in range(1,4):
        js=f'(async()=>{{const r=await fetch("/ami/mob/mtr/mobMtr1000/getMainList?FLAG=1&DEPT1=3970&busiKey={cons}&searchVal=&sortKey=&workStep=28&pPageNo={page}&pRowCount=200",{{credentials:"include"}});const d=await r.json();return JSON.stringify(d);}})()'
        raw=cdp(js)
        try: rows=json.loads(raw)
        except: rows=[]
        if not rows: break
        for r in rows:
            w=str(r.get("WHM_NO",""))
            if w in missing:
                found[w]={"CONS_NO":str(r.get("CONS_NO")),"CNTR_NO":str(r.get("CNTR_NO")),"CONS_TGT_SEQNO":str(r.get("CONS_TGT_SEQNO")),"CREMO_WHM_NO":str(r.get("CREMO_WHM_NO")),"busiKey":cons,"ATCH_FILE_ID_1":r.get("ATCH_FILE_ID_1")}
        if len(rows)<200: break
    # stop early if all found
    if len(found)==len(missing): break
print("FOUND",len(found),"/ 6")
print(json.dumps(found,ensure_ascii=False,indent=2))
