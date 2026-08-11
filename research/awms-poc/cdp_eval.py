#!/usr/bin/env python3
# CDP로 awms-helper webview에 JS 평가. 사용: python3 cdp_eval.py '<js expr>'
# js는 마지막 표현식 값을 반환(awaitPromise). 큰 문자열은 그대로 출력.
import sys, json, websocket, urllib.request

PORT = 9222

def ws_url():
    raw = urllib.request.urlopen(f"http://localhost:{PORT}/json", timeout=5).read()
    for t in json.loads(raw):
        if t.get("type") == "page" and "awms.kdn.com" in t.get("url", ""):
            return t["webSocketDebuggerUrl"]
    raise SystemExit("awms 페이지 없음")

def evaluate(expr):
    ws = websocket.create_connection(ws_url(), timeout=30, max_size=None, suppress_origin=True)
    msg = {
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expr,
            "awaitPromise": True,
            "returnByValue": True,
            "userGesture": True,
        },
    }
    ws.send(json.dumps(msg))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == 1:
            ws.close()
            res = r.get("result", {})
            if "exceptionDetails" in res:
                return {"__error": res["exceptionDetails"]}
            return res.get("result", {}).get("value")

if __name__ == "__main__":
    js = sys.stdin.read() if sys.argv[1:] == ["-"] else sys.argv[1]
    out = evaluate(js)
    if isinstance(out, (dict, list)):
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(out)
