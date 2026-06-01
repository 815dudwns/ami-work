// awms-bridge 리모컨(원격 로더) — push하면 awms-bridge 앱이 받아 awms 페이지에 실행.
// 카메라 후킹은 OCR(facingMode:environment)에만. QR(deviceId 지정)·video:true·전면은 전부 통과.

(function () {
  'use strict';
  var VER = 'v4-ocronly';
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

  // ── 카메라: OCR(facingMode:environment, deviceId 없는)만 일반(camera0)로. 그 외 전부 통과 ──
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !window.__camHookV4) {
      window.__camHookV4 = true;
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
        // OCR만: facingMode environment + deviceId 없음. (QR=deviceId, 권한=video:true, 전면=user 전부 통과)
        var isOcr = v && typeof v === 'object' && !v.deviceId
          && (v.facingMode === 'environment' || (v.facingMode && v.facingMode.exact === 'environment'));
        try { rec({ stage: 'req', video: JSON.stringify(v), ocr: !!isOcr }); } catch (e) {}
        if (!isOcr) return orig(c);   // QR·video:true·전면·기타 → awms 원본 그대로
        return (async function () {
          var devs = await navigator.mediaDevices.enumerateDevices();
          var nm = pick(devs);
          rec({ stage: 'force', label: nm ? nm.label : 'NONE' });
          if (!nm) return orig(c);
          var nv = Object.assign({}, v); delete nv.facingMode; nv.deviceId = { exact: nm.deviceId };
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
      console.log('[awms-inject] camera hook v4 (OCR only) installed');
    }
  } catch (e) {}

  // ── (예정) QR 데이터 변환: vBarcdQr G1S3...→012... ──
})();
