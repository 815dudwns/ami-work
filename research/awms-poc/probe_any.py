import json, subprocess, os
HERE=os.path.dirname(os.path.abspath(__file__))
def cdp(js): return subprocess.run(["python3",os.path.join(HERE,"cdp_eval.py"),js],capture_output=True,text=True).stdout.strip()
missing=set(["56170819245","56170819256","48171588277","25450076183","56170819248","56170819253"])
busikeys=["397820263150","397820263151","397820263153","397820263219","397820263032","397820263033","397820263034","397820263035"]
hits={}
for cons in busikeys:
    for ws in ["","25","28"]:
        js=f'(async()=>{{const r=await fetch("/ami/mob/mtr/mobMtr1000/getMainList?FLAG=1&DEPT1=3970&busiKey={cons}&searchVal=&sortKey=&workStep={ws}&pPageNo=1&pRowCount=300",{{credentials:"include"}});const d=await r.json();return JSON.stringify(d.map(x=>String(x.WHM_NO)));}})()'
        try: ws_list=json.loads(cdp(js))
        except: ws_list=[]
        for w in ws_list:
            if w in missing: hits.setdefault(w,[]).append(f"{cons}/step{ws or 'all'}")
print("총 행수 점검 - 6건 중 발견:", len(hits))
for w in missing: print(" ",w, hits.get(w,"없음"))
