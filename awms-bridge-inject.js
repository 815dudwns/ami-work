// awms-bridge 리모컨(원격 로더) — push하면 awms-bridge 앱이 받아 awms 페이지에 실행.
// 카메라 후킹 제거: awms QR/OCR 카메라 초기화를 건드리지 않는다 (QR은 awms 원본이 잘 읽음).
// 본 목표 = QR 데이터(vBarcdQr) 변환. 카메라와 무관.

(function () {
  'use strict';
  var VER = 'v3-nocam';
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

  // ── (예정) QR 데이터 변환: selectMtrlUseYn?vBarcdQr=<값> 가로채 G1S3...→012... ──
  // 규칙 확정 후 여기에 fetch/XHR 후킹으로 추가.
})();
