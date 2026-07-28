#!/usr/bin/env python3
# currentRow의 ATCH_FILE_ID_2~6 + img src를 폴링, 변할 때만 한 줄 출력.
# 영준님이 칸에 사진 삽입할 때 어느 필드가 따라오는지 자동 포착.
import json, websocket, urllib.request, time, subprocess

PORT = 9222
SNAP_JS = r"""
(function(){
  function findVM(){var root=document.querySelector('#app')&&document.querySelector('#app').__vue__;if(!root){var els=document.querySelectorAll('*');for(var i=0;i<els.length;i++){if(els[i].__vue__){root=els[i].__vue__;break;}}}if(!root)return null;var q=[root],s=0;while(q.length&&s<5000){var c=q.shift();s++;if(c&&c.mainList!==undefined&&('vFlmnCl' in c))return c;if(c&&c.$children)for(var k=0;k<c.$children.length;k++)q.push(c.$children[k]);}return null;}
  var vm=findVM(); if(!vm) return 'NO_VM';
  var cr=vm.mainList.currentRow||{};
  function sc(n){var e=document.getElementById('ATCH_FILE'+n+'_IMG');if(!e)return '-';var s=e.src||'';return s.indexOf('singleFil')>=0?'PHOTO':(s.indexOf('/main')>=0||!s||s==='about:blank'?'empty':'?');}
  var o={ri:vm.mainList.currentRowIndex,MD:cr.MODEM_DIV,RT:cr.ROW_TYPE};
  [2,3,4,5,6].forEach(function(n){o['a'+n]=cr['ATCH_FILE_ID_'+n]||'';o['s'+n]=sc(n);});
  return JSON.stringify(o);
})()
"""

def refresh_forward():
    try:
        ps = subprocess.run(["adb","shell","ps","-A"],capture_output=True,text=True,timeout=10).stdout
        pid=None
        for ln in ps.splitlines():
            if "awmshelper" in ln: pid=ln.split()[1]; break
        if not pid: return False
        subprocess.run(["adb","forward","--remove-all"],capture_output=True,timeout=10)
        subprocess.run(["adb","forward",f"tcp:{PORT}",f"localabstract:webview_devtools_remote_{pid}"],capture_output=True,timeout=10)
        return True
    except Exception:
        return False

def ws_url():
    raw=urllib.request.urlopen(f"http://localhost:{PORT}/json",timeout=5).read()
    for t in json.loads(raw):
        if t.get("type")=="page" and "awms.kdn.com" in t.get("url",""):
            return t["webSocketDebuggerUrl"]
    return None

def evaluate(ws,expr,mid):
    ws.send(json.dumps({"id":mid,"method":"Runtime.evaluate","params":{"expression":expr,"returnByValue":True}}))
    while True:
        r=json.loads(ws.recv())
        if r.get("id")==mid:
            return r.get("result",{}).get("result",{}).get("value")

def main():
    u=ws_url()
    if not u: raise SystemExit("no page")
    ws=websocket.create_connection(u,timeout=30,max_size=None,suppress_origin=True)
    print("POLL_READY",flush=True)
    prev=None; mid=0
    while True:
        mid+=1
        try:
            v=evaluate(ws,SNAP_JS,mid)
        except Exception as e:
            print("POLL_WS_LOST",str(e),flush=True); return
        if v and v!="NO_VM" and v!=prev:
            print("CHG "+v,flush=True)
            prev=v
        time.sleep(0.6)

if __name__=="__main__":
    while True:
        try: main()
        except SystemExit: pass
        except Exception as e: print("POLL_ERR",str(e),flush=True)
        refresh_forward(); time.sleep(2)
