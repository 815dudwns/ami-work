#!/usr/bin/env python3
import json, subprocess, os, base64, time
HERE=os.path.dirname(os.path.abspath(__file__))
DATA=os.path.join(HERE,"../../data/종로_실효리스트_20260605")
PHOTODIR=os.path.join(DATA,"awms_photos")
os.makedirs(PHOTODIR,exist_ok=True)

def cdp(js):
    return subprocess.run(["python3",os.path.join(HERE,"cdp_eval.py"),js],
                          capture_output=True,text=True).stdout.strip()

# load 27 cases + join index
twenty7=json.load(open(os.path.join(DATA,"오류분석_27건_20260605.json")))["전체_27건_상세"]
rows=json.load(open(os.path.join(HERE,"all_complete_rows.json")))+json.load(open(os.path.join(HERE,"awms14_complete.json")))
idx={}
for r in rows: idx.setdefault(str(r["WHM_NO"]),r)  # dedupe: first wins (DUP rows identical)

def getdetail(cons,cntr,seq):
    js=f'''(async()=>{{const r=await fetch("/ami/mob/mtr/mobMtr1000/getDetail?FLAG=1&HDQR_CD=3970&CONS_NO={cons}&CNTR_NO={cntr}&CONS_TGT_SEQNO={seq}",{{credentials:"include"}});const d=await r.json();const o=d[0]||d;const out={{}};for(const k in o){{if(/ATCH_FILE_ID/.test(k)&&o[k])out[k]=o[k];}}return JSON.stringify(out);}})()'''
    raw=cdp(js)
    try: return json.loads(raw)
    except: return {"__fail":raw[:200]}

meta=[]
for c in twenty7:
    w=str(c["구계기번호"])
    rec=idx.get(w)
    entry={"번호":c["번호"],"구계기번호":w,"분류":c["분류"],"awms_원본_신설계기":c.get("awms_원본_신설계기")}
    if not rec:
        entry["상태"]="파라미터미확보(C_불명확_capture범위외)"
        entry["사진"]=[]
        meta.append(entry); continue
    entry["getDetail_파라미터"]={"CONS_NO":str(rec["CONS_NO"]),"CNTR_NO":str(rec["CNTR_NO"]),"CONS_TGT_SEQNO":str(rec["CONS_TGT_SEQNO"]),"HDQR_CD":str(rec.get("HDQR_CD","3970"))}
    entry["CREMO_WHM_NO_capture"]=str(rec.get("CREMO_WHM_NO"))
    fids=getdetail(rec["CONS_NO"],rec["CNTR_NO"],rec["CONS_TGT_SEQNO"])
    if "__fail" in fids:
        entry["상태"]="getDetail실패"; entry["에러"]=fids["__fail"]; entry["사진"]=[]
        meta.append(entry); continue
    photos=[]
    for fk,fid in sorted(fids.items()):
        kind="신설계기(CREMO)" if fk.startswith("CREMO") else ("철거계기(DREMO)" if fk.startswith("DREMO") else "기타")
        photos.append({"필드":fk,"종류":kind,"atchFileId":fid,"다운로드URL":f"/singleFile.innorix?atchFileId={fid}"})
    entry["사진"]=photos
    entry["상태"]="파라미터확보"
    meta.append(entry)
    print(f"#{c['번호']:>2} {w} 사진{len(photos)}장")
    time.sleep(0.2)

json.dump(meta,open(os.path.join(DATA,"사진메타_27건.json"),"w"),ensure_ascii=False,indent=2)
tot=sum(len(e["사진"]) for e in meta)
withp=sum(1 for e in meta if e["사진"])
print(f"\n=== 메타수집 완료: 사진보유 {withp}/27건, 총 {tot}장 ===")
