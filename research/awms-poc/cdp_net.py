#!/usr/bin/env python3
# CDP Network 모니터: awms saveRow/file 관련 POST 요청 body + 응답 body를 한 줄씩 출력.
# 영준님이 헬퍼 폼 조작하는 동안 #3·#4가 요청에 실리는지 / 응답으로 오는지 포착.
import json, websocket, urllib.request, sys, subprocess, time

PORT = 9222

def refresh_forward():
    """helper webview 소켓을 찾아 adb forward 갱신. 성공하면 True."""
    try:
        out = subprocess.run(["adb", "shell", "cat", "/proc/net/unix"],
                             capture_output=True, text=True, timeout=10).stdout
        socks = sorted(set(s for s in out.split() if s.startswith("webview_devtools_remote_")))
        ps = subprocess.run(["adb", "shell", "ps", "-A"], capture_output=True, text=True, timeout=10).stdout
        helper_pid = None
        for ln in ps.splitlines():
            if "awmshelper" in ln:
                helper_pid = ln.split()[1]
                break
        target = None
        if helper_pid:
            cand = f"webview_devtools_remote_{helper_pid}"
            if cand in socks:
                target = cand
        if not target:
            return False
        subprocess.run(["adb", "forward", "--remove-all"], capture_output=True, timeout=10)
        subprocess.run(["adb", "forward", f"tcp:{PORT}", f"localabstract:{target}"],
                       capture_output=True, timeout=10)
        return True
    except Exception as e:
        print("FORWARD_ERR", e, flush=True)
        return False
# 관심 URL 키워드 (저장/파일/등록 계열)
KEYS = ("save", "Save", "regist", "Regist", "file", "File", "atch", "Atch", "innorix", "main", "Main")

def ws_url():
    raw = urllib.request.urlopen(f"http://localhost:{PORT}/json", timeout=5).read()
    for t in json.loads(raw):
        if t.get("type") == "page" and "awms.kdn.com" in t.get("url", ""):
            return t["webSocketDebuggerUrl"]
    raise SystemExit("awms 페이지 없음")

def trunc(s, n=60000):
    if s is None:
        return None
    s = str(s)
    return s if len(s) <= n else s[:n] + f"...(+{len(s)-n})"

def main():
    ws = websocket.create_connection(ws_url(), timeout=120, max_size=None, suppress_origin=True)
    mid = [0]
    def send(method, params=None):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
        return mid[0]
    send("Network.enable", {"maxPostDataSize": 200000})
    reqs = {}  # requestId -> {url, method, postData}
    print("NET_MONITOR_READY", flush=True)
    while True:
        try:
            ev = json.loads(ws.recv())
        except Exception as e:
            print("WS_CLOSED", e, flush=True)
            break
        m = ev.get("method")
        if m == "Network.requestWillBeSent":
            p = ev["params"]
            req = p.get("request", {})
            url = req.get("url", "")
            if req.get("method") == "POST" and any(k in url for k in KEYS):
                pd = req.get("postData")
                reqs[p["requestId"]] = {"url": url, "method": req.get("method")}
                hit3 = "ATCH_FILE_ID_3" in (pd or "")
                hit4 = "ATCH_FILE_ID_4" in (pd or "")
                print(json.dumps({"ev": "REQ", "url": url.split("?")[0].split("/")[-1],
                                  "a3_in_req": hit3, "a4_in_req": hit4,
                                  "postData": trunc(pd)}, ensure_ascii=False), flush=True)
        elif m == "Network.loadingFinished":
            rid = ev["params"]["requestId"]
            if rid in reqs:
                info = reqs.pop(rid)
                try:
                    mm = send("Network.getResponseBody", {"requestId": rid})
                    body = None
                    while True:
                        r = json.loads(ws.recv())
                        if r.get("id") == mm:
                            body = r.get("result", {}).get("body")
                            break
                    hit3 = "ATCH_FILE_ID_3" in (body or "")
                    hit4 = "ATCH_FILE_ID_4" in (body or "")
                    print(json.dumps({"ev": "RESP", "url": info["url"].split("?")[0].split("/")[-1],
                                      "a3_in_resp": hit3, "a4_in_resp": hit4,
                                      "body": trunc(body)}, ensure_ascii=False), flush=True)
                except Exception as e:
                    print(json.dumps({"ev": "RESP_ERR", "err": str(e)}), flush=True)

if __name__ == "__main__":
    while True:
        try:
            main()
        except SystemExit as e:
            # awms 페이지 없음 → forward 갱신 후 재시도
            print("RECONNECT", str(e), flush=True)
        except Exception as e:
            print("LOOP_ERR", str(e), flush=True)
        refresh_forward()
        time.sleep(2)
