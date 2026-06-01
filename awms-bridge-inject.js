// awms-bridge 리모컨(원격 로더) — push하면 awms-bridge 앱이 받아 awms 페이지에 실행.
// 카메라: OCR(facingMode)=일반 강제 / QR(deviceId)=그대로 두되 해상도·초점·노출 보강(빛번짐·저해상도 개선).

(function () {
  'use strict';
  var VER = 'v5-qrboost';
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

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !window.__camHookV5) {
      window.__camHookV5 = true;
      var orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      var pick = function (devs) {
        var back = devs.filter(function (d) { return d.kind === 'videoinput' && /back|후면/i.test(d.label); });
        var n = back.find(function (d) { return d.label.trim() === '후면 카메라'; });
        if (!n) n = back.find(function (d) { return /(^|[^0-9])0(,|\s|$)/.test(d.label) && /back/i.test(d.label); });
        if (!n) n = back.find(function (d) { return /camera\s*0\b/i.test(d.label); });
        return n || back[0] || null;
      };
      var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      // QR 화질 보강: 해상도 최대 + 연속초점 + 노출/화이트밸런스 자동 (deviceId·zoom은 그대로 유지)
      var boost = function (vobj) {
        var nv = Object.assign({}, vobj);
        nv.width = { ideal: 2560 };
        nv.height = { ideal: 1440 };
        nv.frameRate = { ideal: 30 };
        var adv = Array.isArray(nv.advanced) ? nv.advanced.slice() : [];
        adv.push({ focusMode: 'continuous' });
        adv.push({ exposureMode: 'continuous' });
        adv.push({ whiteBalanceMode: 'continuous' });
        nv.advanced = adv;
        return nv;
      };
      navigator.mediaDevices.getUserMedia = function (c) {
        var v = c && c.video;
        var hasDev = v && typeof v === 'object' && v.deviceId;
        var isOcr = v && typeof v === 'object' && !v.deviceId
          && (v.facingMode === 'environment' || (v.facingMode && v.facingMode.exact === 'environment'));
        try { rec({ stage: 'req', video: JSON.stringify(v), dev: !!hasDev, ocr: !!isOcr }); } catch (e) {}

        if (hasDev) {
          // QR/바코드: 카메라는 awms 선택 그대로, 화질만 보강
          var qc = Object.assign({}, c, { video: boost(v) });
          rec({ stage: 'qr-boost' });
          return (async function () {
            try { var s = await orig(qc); rec({ stage: 'qr-ok' }); return s; }
            catch (e) {
              // 보강이 OverconstrainedError 등 내면 원본으로 폴백 (QR 절대 안 깨지게)
              rec({ stage: 'qr-fallback', err: (e && e.name) });
              return orig(c);
            }
          })();
        }

        if (isOcr) {
          return (async function () {
            var devs = await navigator.mediaDevices.enumerateDevices();
            var nm = pick(devs);
            rec({ stage: 'force', label: nm ? nm.label : 'NONE' });
            if (!nm) return orig(c);
            var nv = boost(Object.assign({}, v)); delete nv.facingMode; nv.deviceId = { exact: nm.deviceId };
            var newc = Object.assign({}, c, { video: nv });
            for (var i = 0; i < 4; i++) {
              try { var s = await orig(newc); rec({ stage: 'force-ok', tryn: i }); return s; }
              catch (e) {
                if (e && e.name === 'NotReadableError' && i < 3) { rec({ stage: 'retry', n: i }); await sleep(300); continue; }
                rec({ stage: 'force-err', err: (e && e.name) }); return orig(c);
              }
            }
          })();
        }

        return orig(c);  // video:true·전면 등 → 통과
      };
      console.log('[awms-inject] camera hook v5 (QR boost) installed');
    }
  } catch (e) {}

  // ── (예정) QR 데이터 변환: vBarcdQr G1S3...→012... ──
})();
