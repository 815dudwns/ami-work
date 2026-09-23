#!/usr/bin/env python3
"""
awms FMPMTR 세션을 폰(헬퍼 WebView)에서 맥으로 뽑아온다.

전제: 폰이 USB로 연결돼 있고, 헬퍼 앱(com.youngjun.awmshelper)이
      awms.kdn.com 에 로그인된 상태(윤용운 반장 231918)여야 한다.

세션은 슬라이딩이 아니라 절대 만료로 보인다(실측 약 3.5시간 뒤 만료).
매일 수집 전에 이걸 한 번 돌려 쿠키를 갱신한다.

  python3 scripts/hapdong/pull_session.py
"""
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import websocket

KST = ZoneInfo("Asia/Seoul")
TOKEN_PATH = Path.home() / ".awms-tokens" / "fmpmtr.json"
HELPER_PKG = "com.youngjun.awmshelper"
PORT = 9222


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()


def find_webview_pid():
    """헬퍼 앱의 WebView devtools 소켓을 찾는다."""
    socks = sh("adb shell cat /proc/net/unix 2>/dev/null | grep webview_devtools_remote")
    pids = re.findall(r"webview_devtools_remote_(\d+)", socks)
    if not pids:
        sys.exit("WebView devtools 소켓 없음 — 폰 연결/헬퍼 실행 확인")
    ps = sh("adb shell ps -A -o PID,NAME")
    owner = {}
    for line in ps.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            owner[parts[0]] = parts[1]
    for pid in pids:
        if owner.get(pid) == HELPER_PKG:
            return pid
    sys.exit(f"헬퍼({HELPER_PKG})의 WebView를 못 찾음. 발견된 pid: "
             + ", ".join(f"{p}={owner.get(p, '?')}" for p in pids))


def ws_url(port):
    with urllib.request.urlopen(f"http://localhost:{port}/json", timeout=10) as r:
        for t in json.load(r):
            if t.get("type") == "page" and "awms" in t.get("url", ""):
                return t["webSocketDebuggerUrl"], t.get("url")
    sys.exit("헬퍼 WebView에 awms 페이지가 없음 — 헬퍼에서 awms를 열어두세요")


def main():
    pid = find_webview_pid()
    subprocess.run(f"adb forward tcp:{PORT} localabstract:webview_devtools_remote_{pid}",
                   shell=True, capture_output=True)
    url, page_url = ws_url(PORT)

    ws = websocket.create_connection(url, timeout=30, suppress_origin=True)
    mid = 0

    def call(method, **params):
        nonlocal mid
        mid += 1
        ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    sys.exit(f"CDP 오류: {msg['error']}")
                return msg.get("result", {})

    call("Network.enable")
    cookies = call("Network.getAllCookies").get("cookies", [])
    jar = {c["name"]: c for c in cookies if "awms" in c.get("domain", "")}

    if "JSESSIONID" not in jar:
        sys.exit("JSESSIONID 없음 — 헬퍼에서 awms 로그인 상태를 확인하세요")

    # 로그인 계정 확인 (헬퍼 localStorage에 저장된 id)
    acct = call("Runtime.evaluate",
                expression="localStorage.getItem('helper_cred_id') || ''",
                returnByValue=True).get("result", {}).get("value", "")

    j = jar["JSESSIONID"]
    tok = {
        "JSESSIONID": j["value"],
        "expires": j.get("expires"),
        "account": acct,
        "page_url": page_url,
        "pulled_at": datetime.now(KST).isoformat(),
    }
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(json.dumps(tok, ensure_ascii=False, indent=1))
    TOKEN_PATH.chmod(0o600)

    exp_txt = "?"
    if j.get("expires"):
        exp = datetime.fromtimestamp(j["expires"], KST)
        left = exp - datetime.now(KST)
        exp_txt = f"{exp:%Y-%m-%d %H:%M} (남은 {str(left).split('.')[0]})"
    print(f"세션 저장: {TOKEN_PATH}")
    print(f"  계정 {acct} / 만료 {exp_txt}")


if __name__ == "__main__":
    main()
