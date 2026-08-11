#!/usr/bin/env python3
# 통신팀 UI 완료 saveAct의 실제 multipart body를 getRequestPostData로 강제 캡처.
# 마스터/슬레이브 여러 건 → /tmp/saveact_body.jsonl 에 라인별 append.
import json, websocket, urllib.request, time
PORT = 9222
OUT = "/tmp/saveact_body.jsonl"

def wsurl():
    raw = urllib.request.urlopen(f"http://localhost:{PORT}/json", timeout=5).read()
    for t in json.loads(raw, strict=False):
        if t.get("type") == "page" and "awms.kdn.com" in t.get("url", ""):
            return t["webSocketDebuggerUrl"]
    raise SystemExit("no awms")

def main():
    ws = websocket.create_connection(wsurl(), timeout=600, max_size=None, suppress_origin=True)
    mid = [0]
    def send(method, params=None):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
        return mid[0]
    def wait(idn):
        while True:
            r = json.loads(ws.recv())
            if r.get("id") == idn:
                return r
    send("Network.enable", {"maxPostDataSize": 5000000})
    print("READY", flush=True)
    reqs = {}
    while True:
        try:
            ev = json.loads(ws.recv())
        except Exception as e:
            print("WS_CLOSED", e, flush=True); break
        m = ev.get("method")
        if m == "Network.requestWillBeSent":
            p = ev["params"]; url = p.get("request", {}).get("url", "")
            if "saveAct" in url and p.get("request", {}).get("method") == "POST":
                reqs[p["requestId"]] = url
                print("SAVEACT_SEEN " + url, flush=True)
        elif m == "Network.loadingFinished":
            rid = ev["params"]["requestId"]
            if rid in reqs:
                url = reqs.pop(rid)
                pd = None
                try:
                    pm = send("Network.getRequestPostData", {"requestId": rid})
                    r = wait(pm); pd = r.get("result", {}).get("postData")
                except Exception as e:
                    pd = "POSTDATA_ERR " + str(e)
                body = None
                try:
                    bm = send("Network.getResponseBody", {"requestId": rid})
                    r = wait(bm); body = r.get("result", {}).get("body")
                except Exception:
                    pass
                out = {"url": url, "resp": body, "bodyLen": len(pd or ""), "body": pd}
                with open(OUT, "a") as f:
                    f.write(json.dumps(out, ensure_ascii=False) + "\n")
                print(f"CAPTURED resp={body} bodyLen={len(pd or '')} → {OUT}", flush=True)

if __name__ == "__main__":
    while True:
        try:
            main()
        except SystemExit as e:
            print("RECONNECT", e, flush=True); time.sleep(2)
        except Exception as e:
            print("LOOP_ERR", e, flush=True); time.sleep(2)
