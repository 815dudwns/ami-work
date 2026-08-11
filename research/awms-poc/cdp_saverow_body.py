#!/usr/bin/env python3
# UI 완료 saveRow의 실제 multipart body를 getRequestPostData로 강제 캡처
import json, websocket, urllib.request, time
PORT = 9222

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
            # 이벤트는 큐에 쌓지 않고 흘림 (단순화)
    send("Network.enable", {"maxPostDataSize": 2000000})
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
            if "saveRow" in url and p.get("request", {}).get("method") == "POST":
                reqs[p["requestId"]] = url
                print("SAVEROW_SEEN " + url, flush=True)
        elif m == "Network.loadingFinished":
            rid = ev["params"]["requestId"]
            if rid in reqs:
                url = reqs.pop(rid)
                # postData 강제 조회
                pd = None
                try:
                    pm = send("Network.getRequestPostData", {"requestId": rid})
                    r = wait(pm); pd = r.get("result", {}).get("postData")
                except Exception as e:
                    pd = "POSTDATA_ERR " + str(e)
                # 응답 조회
                body = None
                try:
                    bm = send("Network.getResponseBody", {"requestId": rid})
                    r = wait(bm); body = r.get("result", {}).get("body")
                except Exception:
                    pass
                out = {"url": url, "resp": body, "bodyLen": len(pd or ""), "body": pd}
                with open("/tmp/saverow_body.json", "w") as f:
                    json.dump(out, f, ensure_ascii=False)
                print(f"CAPTURED resp={body} bodyLen={len(pd or '')} → /tmp/saverow_body.json", flush=True)

if __name__ == "__main__":
    while True:
        try:
            main()
        except SystemExit as e:
            print("RECONNECT", e, flush=True)
        except Exception as e:
            print("LOOP_ERR", e, flush=True)
        time.sleep(2)
