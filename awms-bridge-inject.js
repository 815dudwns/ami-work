// awms-bridge 리모컨(원격 로더) — push하면 awms-bridge 앱이 받아 awms 페이지에 실행.
// 빌드 불필요. 카메라 후킹 + (예정) QR 데이터 변환을 여기서 push로 iterate.

(function () {
  'use strict';
  var VER = 'v2-cam';
  function rec(o) {
    try {
      o.kind = 'cam'; o.ts = Date.now(); o.url = 'https://awms.kdn.com/__cam__/' + (o.stage || '');
      if (window.AndroidRecorder && window.AndroidRecorder.record) window.AndroidRecorder.record(JSON.stringify(o));
    } catch (e) {}
  }
  try { console.log('[awms-inject] ' + VER); } catch (e) {}

  // 리모컨 동작 배지
  try {
    if (location.host.indexOf('awms') > -1 && !document.getElementById('__inject_badge')) {
      var show = function () {
        if (!document.body || document.getElementById('__inject_badge')) return;
        var b = document.createElement('div');
        b.id = '__inject_badge'; b.textContent = '리모컨 ' + VER;
        b.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0);left:0;z-index:2147483647;background:#16a34a;color:#fff;font:11px -apple-system,sans-serif;padding:3px 8px;border-bottom-right-radius:6px;opacity:.85';
        document.body.appendChild(b);
        setTimeout(function () { try { b.remove(); } catch (e) {} }, 3000);
      };
      if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    }
  } catch (e) {}

  // ── 카메라: 후면 의도(video:true / facingMode:environment, deviceId 없는) → 일반(camera0) 강제 ──
  // QR(deviceId 지정)·전면(user)은 통과. 임시 probe 없음. NotReadableError 시 재시도(권한 스트림 풀릴 때까지).
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !window.__camHookV2) {
      window.__camHookV2 = true;
      var orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      var pick = function (devs) {
        var back = devs.filter(function (d) { return d.kind === 'videoinput' && /back|후면/i.test(d.label); });
        var n = back.find(function (d) { return d.label.trim() === '후면 카메라'; });               // iOS 일반
        if (!n) n = back.find(function (d) { return /(^|[^0-9])0(,|\s|$)/.test(d.label) && /back/i.test(d.label); }); // 삼성 camera 0
        if (!n) n = back.find(function (d) { return /camera\s*0\b/i.test(d.label); });
        return n || back[0] || null;
      };
      var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      navigator.mediaDevices.getUserMedia = function (c) {
        var v = c && c.video;
        var isFront = v && (v.facingMode === 'user' || (v.facingMode && v.facingMode.exact === 'user'));
        var hasDev = v && typeof v === 'object' && v.deviceId;
        try { rec({ stage: 'req', video: JSON.stringify(v) }); } catch (e) {}
        if (!v || isFront || hasDev) return orig(c);   // 전면 / QR(deviceId) / 기타 → 그대로 통과
        return (async function () {
          var devs = await navigator.mediaDevices.enumerateDevices();
          var nm = pick(devs);
          rec({ stage: 'force', label: nm ? nm.label : 'NONE' });
          if (!nm) return orig(c);
          var nv = (typeof v === 'object' && v) ? Object.assign({}, v) : {};
          delete nv.facingMode; nv.deviceId = { exact: nm.deviceId };
          var newc = Object.assign({}, c, { video: nv });
          for (var i = 0; i < 4; i++) {
            try { var s = await orig(newc); rec({ stage: 'force-ok', tryn: i }); return s; }
            catch (e) {
              if (e && e.name === 'NotReadableError' && i < 3) { rec({ stage: 'retry', n: i }); await sleep(300); continue; }
              rec({ stage: 'force-err', err: (e && e.name) + ':' + (e && e.message) }); throw e;
            }
          }
        })();
      };
      console.log('[awms-inject] camera hook v2 installed');
    }
  } catch (e) {}

  // ── 다음 단계(push로 추가 예정): QR 데이터 변환 (G1S3... → 012...) ──
  // selectMtrlUseYn?vBarcdQr=<값> 요청을 가로채 변환. 규칙 확정 후 구현.
})();
