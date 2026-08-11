#!/usr/bin/env python3
import json, subprocess, os, base64, time
HERE=os.path.dirname(os.path.abspath(__file__))
DATA=os.path.join(HERE,"../../data/종로_실효리스트_20260605")
PHOTODIR=os.path.join(DATA,"awms_photos")
os.makedirs(PHOTODIR,exist_ok=True)

def cdp(js):
    return subprocess.run(["python3",os.path.join(HERE,"cdp_eval.py"),js],
                          capture_output=True,text=True).stdout.strip()

def fetch_img(fid):
    js=f'''(async()=>{{const r=await fetch("/singleFile.innorix?atchFileId={fid}",{{credentials:"include"}});const ct=r.headers.get("content-type")||"";const b=await r.blob();const buf=await b.arrayBuffer();const by=new Uint8Array(buf);let bin="";const CH=8192;for(let i=0;i<by.length;i+=CH)bin+=String.fromCharCode.apply(null,by.subarray(i,i+CH));return JSON.stringify({{status:r.status,ct:ct,size:by.length,b64:btoa(bin)}});}})()'''
    raw=cdp(js)
    return json.loads(raw)

meta=json.load(open(os.path.join(DATA,"사진메타_27건.json")))
ok=0; fail=[]
for e in meta:
    for p in e["사진"]:
        fid=p["atchFileId"]
        tag="CREMO" if "CREMO" in p["필드"] else "DREMO"
        slot=p["필드"].split("_")[-1]
        fn=f"{e['번호']:02d}_{e['구계기번호']}_{tag}{slot}_{fid}.jpg"
        path=os.path.join(PHOTODIR,fn)
        if os.path.exists(path) and os.path.getsize(path)>1000:
            p["저장파일"]=fn; p["다운결과"]="기존"; ok+=1; continue
        try:
            d=fetch_img(fid)
            raw=base64.b64decode(d["b64"])
            if d["status"]!=200 or "image" not in d.get("ct","") or raw[:3]!=b"\xff\xd8\xff":
                fail.append((fn,d.get("status"),d.get("ct"))); p["다운결과"]=f"실패 status={d.get('status')} ct={d.get('ct')}"; continue
            open(path,"wb").write(raw)
            p["저장파일"]=fn; p["다운결과"]=f"성공 {len(raw)}B"; ok+=1
        except Exception as ex:
            fail.append((fn,str(ex)[:100])); p["다운결과"]=f"예외 {ex}"
        time.sleep(0.15)
    print(f"#{e['번호']:>2} done")

json.dump(meta,open(os.path.join(DATA,"사진메타_27건.json"),"w"),ensure_ascii=False,indent=2)
print(f"\n=== 다운로드 완료: 성공 {ok}장 / 실패 {len(fail)}장 ===")
for f in fail: print("  실패:",f)
