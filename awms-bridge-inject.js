// awms-bridge 리모컨 — push하면 awms-bridge 앱이 awms 페이지에 실행.
// QRCODE/BARCODE 클릭 → 네이티브 구글 스캐너(ML Kit, 카메라앱 수준) 실행 → 결과를 __onNativeScan 으로 받음.
// OCR은 awms 원본 그대로(안 건드림).

(function () {
  'use strict';
  var VER = 'v7-native-scan';
  function rec(o) {
    try {
      o.kind = 'cam'; o.ts = Date.now(); o.url = 'https://awms.kdn.com/__cam__/' + (o.stage || '');
      if (window.AndroidRecorder && window.AndroidRecorder.record) window.AndroidRecorder.record(JSON.stringify(o));
    } catch (e) {}
  }
  try { console.log('[awms-inject] ' + VER); } catch (e) {}

  // 배지
  try {
    if (location.host.indexOf('awms') > -1 && !document.getElementById('__inject_badge')) {
      var show = function () {
        if (!document.body || document.getElementById('__inject_badge')) return;
        var b = document.createElement('div');
        b.id = '__inject_badge'; b.textContent = '리모컨 ' + VER + (window.AndroidScanner ? ' [스캐너O]' : ' [스캐너X]');
        b.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0);left:0;z-index:2147483647;background:#16a34a;color:#fff;font:11px -apple-system,sans-serif;padding:3px 8px;border-bottom-right-radius:6px;opacity:.85';
        document.body.appendChild(b);
        setTimeout(function () { try { b.remove(); } catch (e) {} }, 3000);
      };
      if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    }
  } catch (e) {}

  // 네이티브 스캔 결과 핸들러 (1단계: 값 확인. 다음 단계서 변환+설비ID칸 입력)
  window.__onNativeScan = function (val) {
    rec({ stage: 'native-scan', val: val });
    if (!val) { return; }
    alert('네이티브 스캔 결과:\n' + val);
  };

  // QRCODE/BARCODE 버튼 클릭 가로채 → 네이티브 스캐너. (OCR은 통과 = awms 원본)
  try {
    if (!window.__scanHook) {
      window.__scanHook = true;
      document.addEventListener('click', function (e) {
        try {
          var el = e.target && e.target.closest && e.target.closest('button,a,p,div,span,li');
          if (!el) return;
          var txt = (el.textContent || '').trim().toUpperCase();
          if (txt === 'QRCODE' || txt === 'BARCODE') {
            e.preventDefault(); e.stopImmediatePropagation();
            rec({ stage: 'intercept', txt: txt });
            if (window.AndroidScanner && window.AndroidScanner.scan) {
              window.AndroidScanner.scan();
            } else {
              alert('네이티브 스캐너 없음 (앱 업데이트 필요)');
            }
          }
        } catch (err) {}
      }, true);  // capture 단계 — awms 핸들러보다 먼저
      console.log('[awms-inject] scan-intercept installed');
    }
  } catch (e) {}
})();
