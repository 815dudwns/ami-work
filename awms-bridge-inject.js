// awms-bridge 리모컨 — QRCODE/BARCODE 클릭 → 네이티브 구글 스캐너(ML Kit) → 값 변환(끝8자리+012) → 설비ID칸 입력 + 검색.
// OCR은 awms 원본 그대로.

(function () {
  'use strict';
  var VER = 'v8-autofill';
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

  // 스캔 raw → 설비ID(모뎀번호) 변환: 012+8자리면 그대로, 아니면 끝 8자리 숫자 + 012
  function extractAndConvert(raw) {
    var s = String(raw || '').trim();
    // 멀티필드 텍스트 QR이면 "자재 ID :" 값만 추출, 아니면 raw 그대로
    var m = s.match(/자재\s*ID\s*[:：]?\s*([A-Za-z0-9]+)/);
    var id = m ? m[1] : s;
    if (/^012\d{8}$/.test(id)) return id;                 // 이미 정상(012+8)
    var digits = id.replace(/\D/g, '');
    if (/^012\d{8}$/.test(digits)) return digits;          // 별표/하이픈 제거 후 정상
    if (digits.length >= 8) return '012' + digits.slice(-8); // 그 외(G1S3 등): 끝8 + 012
    return digits || id;
  }

  function findInput() {
    return document.querySelector('input[placeholder*="설비ID"]')
      || document.querySelector('input[placeholder*="설비"]')
      || null;
  }
  function setInput(input, val) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));   // Vue v-model 반영
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function triggerSearch(input) {
    ['keydown', 'keyup'].forEach(function (t) {
      input.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    });
    var btn = Array.prototype.slice.call(document.querySelectorAll('button,a'))
      .find(function (b) { return /검색/.test(b.textContent || ''); });
    if (btn) btn.click();
  }

  // 네이티브 스캔 결과 → 변환 → 설비ID칸 입력 + 검색
  window.__onNativeScan = function (raw) {
    rec({ stage: 'scan', raw: raw });
    if (!raw) return;
    var val = extractAndConvert(raw);
    rec({ stage: 'convert', val: val });
    var input = findInput();
    if (input) {
      setInput(input, val);
      setTimeout(function () { triggerSearch(input); }, 120);
    } else {
      alert('변환값: ' + val + '\n(설비ID칸을 못 찾아 자동입력 못 함)');
    }
  };

  // QRCODE/BARCODE 클릭 가로채 → 네이티브 스캐너 (OCR은 통과 = awms 원본)
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
            if (window.AndroidScanner && window.AndroidScanner.scan) window.AndroidScanner.scan();
            else alert('네이티브 스캐너 없음 (앱 업데이트 필요)');
          }
        } catch (err) {}
      }, true);
      console.log('[awms-inject] scan-intercept + autofill installed');
    }
  } catch (e) {}
})();
