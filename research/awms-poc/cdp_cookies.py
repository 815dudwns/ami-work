#!/usr/bin/env python3
# CDP Network.getAllCookies로 awms webview 쿠키 추출 (httpOnly JSESSIONID 포함).
# document.cookie로는 httpOnly가 안 보이므로 이 스크립트 필요. 사용: python3 cdp_cookies.py
import json, websocket, urllib.request

PORT = 9222

def ws_url():
    raw = urllib.request.urlopen(f"http://localhost:{PORT}/json", timeout=5).read()
    for t in json.loads(raw):
        if t.get("type") == "page" and "awms.kdn.com" in t.get("url", ""):
            return t["webSocketDebuggerUrl"]
    raise SystemExit("awms 페이지 없음")

ws = websocket.create_connection(ws_url(), timeout=15, max_size=None, suppress_origin=True)
ws.send(json.dumps({"id": 1, "method": "Network.getAllCookies"}))
while True:
    r = json.loads(ws.recv())
    if r.get("id") == 1:
        cookies = r.get("result", {}).get("cookies", [])
        ws.close()
        out = [c for c in cookies if "awms" in c.get("domain", "") or c.get("name") in ("JSESSIONID",)]
        print(json.dumps(out, ensure_ascii=False, indent=2))
        # 쿠키 헤더 한 줄도 출력
        hdr = "; ".join(f"{c['name']}={c['value']}" for c in out)
        print("\nCOOKIE_HEADER:", hdr)
        break
