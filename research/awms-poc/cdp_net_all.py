#!/usr/bin/env python3
# awms 모든 POST 요청 URL+postData+response 캡처 (조회/전송리스트 API 파악용)
import json, websocket, urllib.request, time
PORT=9222
def ws_url():
    raw=urllib.request.urlopen(f"http://localhost:{PORT}/json",timeout=5).read().decode('utf-8','replace')
    import re
    for m in re.finditer(r'"webSocketDebuggerUrl":\s*"([^"]+)".*?"url":\s*"([^"]*)"', raw, re.S):
        pass
    # 안전 파싱
    data=json.loads(raw, strict=False)
    for t in data:
        if t.get("type")=="page" and "awms.kdn.com" in t.get("url",""):
            return t["webSocketDebuggerUrl"]
    raise SystemExit("no awms page")
def trunc(s,n=6000):
    if s is None: return None
    s=str(s); return s if len(s)<=n else s[:n]+f"...(+{len(s)-n})"
def main():
    ws=websocket.create_connection(ws_url(),timeout=300,max_size=None,suppress_origin=True)
    mid=[0]
    def send(method,params=None):
        mid[0]+=1; ws.send(json.dumps({"id":mid[0],"method":method,"params":params or {}})); return mid[0]
    send("Network.enable",{"maxPostDataSize":300000})
    reqs={}
    print("READY",flush=True)
    while True:
        try: ev=json.loads(ws.recv())
        except Exception as e: print("WS_CLOSED",e,flush=True); break
        m=ev.get("method")
        if m=="Network.requestWillBeSent":
            p=ev["params"]; req=p.get("request",{}); url=req.get("url","")
            STATIC=(".js",".css",".png",".jpg",".jpeg",".gif",".woff",".woff2",".ico",".svg",".html",".htm",".map")
            base=url.split("?")[0]
            if "awms.kdn.com" in url and req.get("method") in ("POST","GET") and not base.endswith(STATIC):
                reqs[p["requestId"]]={"url":url,"pd":req.get("postData") or ("GET?"+url.split("?")[-1][:300] if "?" in url else "GET")}
        elif m=="Network.loadingFinished":
            rid=ev["params"]["requestId"]
            if rid in reqs:
                info=reqs.pop(rid)
                try:
                    mm=send("Network.getResponseBody",{"requestId":rid}); body=None
                    while True:
                        r=json.loads(ws.recv())
                        if r.get("id")==mm: body=r.get("result",{}).get("body"); break
                    print(json.dumps({"url":info["url"].split("/")[-1].split("?")[0],
                        "fullurl":info["url"],"req":trunc(info["pd"]),"resp":trunc(body)},ensure_ascii=False),flush=True)
                except Exception as e: print(json.dumps({"err":str(e)}),flush=True)
if __name__=="__main__":
    while True:
        try: main()
        except SystemExit as e: print("RECONNECT",e,flush=True)
        except Exception as e: print("LOOP_ERR",e,flush=True)
        time.sleep(2)
