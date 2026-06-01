// awms-bridge 리모컨 — QRCODE/BARCODE 클릭 → 네이티브 구글 스캐너(ML Kit) → 값 변환 → 타겟 칸 입력.
// 타겟 칸 = awms Vue(new Vue, __vue__)의 vFlmnCl (modalOpen('FIELD')가 세팅). 필드별로 변환 규칙 분기.
//   - 모뎀맥/맥 계열(MAC/MODEM) → 012 + 끝8자리
//   - 계기번호 계열(INSTR_NUM/METER_ID) → 변환 안 함 (숫자/라벨만)
//   - 설비ID(자재관리) → 012 변환 + 검색
// OCR은 awms 원본 그대로.

(function () {
  'use strict';
  var VER = 'v12-vflmncl';

  function rec(o) {
    try {
      o.kind = 'cam'; o.ts = Date.now(); o.url = 'https://awms.kdn.com/__cam__/' + (o.stage || '');
      if (window.AndroidRecorder && window.AndroidRecorder.record) window.AndroidRecorder.record(JSON.stringify(o));
    } catch (e) {}
  }

  // awms 촬영선택 모달(flmnMode) 닫기 — 정식 닫기 버튼만 클릭(inline display:none 금지: 잔류 시 재오픈 안 됨).
  function closeFlmnModal() {
    try {
      var modal = document.getElementById('flmnMode');
      if (!modal) return;
      rec({ stage: 'close-modal' });
      ['.layer_close', '.cbtn', '[title*="닫기"]'].some(function (s) {
        var b = modal.querySelector(s);
        if (b) { b.click(); return true; }
        return false;
      });
    } catch (e) {}
  }

  // ── awms Vue2 인스턴스(vFlmnCl + mainList 보유 컴포넌트) 찾기 ──
  function getAwmsVM() {
    try {
      var all = document.querySelectorAll('body *');
      for (var i = 0; i < all.length; i++) {
        var v = all[i].__vue__;
        if (!v) continue;
        var q = [v.$root || v], seen = 0;
        while (q.length && seen < 800) {
          var c = q.shift(); seen++;
          if (c && c.mainList && ('vFlmnCl' in c)) return c;
          if (c && c.$children) for (var j = 0; j < c.$children.length; j++) q.push(c.$children[j]);
        }
      }
    } catch (e) {}
    return null;
  }

  // ── 변환 ──
  function digitsOf(s) { return String(s || '').replace(/\D/g, ''); }
  function extractMaterialId(raw) {
    var s = String(raw || '').trim();
    var m = s.match(/자재\s*ID\s*[:：]?\s*([A-Za-z0-9]+)/);
    return m ? m[1] : s;
  }
  function toModemMac(raw) {                          // 모뎀맥/설비ID: 012 + 끝8자리
    var id = extractMaterialId(raw);
    if (/^012\d{8}$/.test(id)) return id;
    var d = digitsOf(id);
    if (/^012\d{8}$/.test(d)) return d;
    if (d.length >= 8) return '012' + d.slice(-8);
    return d || id;
  }
  function toMeter(raw) {                             // 계기번호: 변환 X, 라벨/숫자만
    var s = String(raw || '').trim();
    var m = s.match(/계기\s*번?호?\s*[:：]?\s*([0-9]+)/);
    return m ? m[1] : digitsOf(s);
  }
  function convertForField(field, raw) {
    var f = field || '';
    if (/INSTR_NUM|METER_ID/.test(f)) return toMeter(raw);        // 계기/대표계기
    if (/DCU_ID/.test(f)) return String(raw || '').trim();         // DCU ID 원본
    if (/MAC|MODEM/.test(f)) return toModemMac(raw);              // 모뎀맥/맥 계열
    return toModemMac(raw);                                        // 기본(설비ID/자재관리)
  }

  // ── DOM 폴백 입력칸 (Vue 못 찾을 때) ──
  var NAME_BY_FIELD = { 'MAC_MODEM': '모뎀맥', 'INSTR_NUM': '계기번호', 'MB_METER_ID': '대표계기',
    'EXT_DCU_ID': '기존 DCU_ID', 'NEW_DCU_MAC': '사용 DCU자재', 'EXT_DCU_MAC': '기존 DCU자재' };
  function findInputByField(field) {
    if (field && NAME_BY_FIELD[field]) {
      var n = document.querySelector('input[name="' + NAME_BY_FIELD[field] + '"]');
      if (n) return n;
    }
    return document.querySelector('input[placeholder*="설비ID"]')
      || document.querySelector('input[name="모뎀맥"]')
      || document.querySelector('input[name="계기번호"]')
      || document.querySelector('input[placeholder*="설비"]')
      || null;
  }
  function setInput(input, val) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
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

  // 네이티브 스캔 결과 → 타겟 필드 변환 → Vue 주입(+DOM 폴백)
  window.__onNativeScan = function (raw) {
    var field = window.__pendingField || '';
    var vm = window.__pendingVM || getAwmsVM();
    rec({ stage: 'scan', raw: raw, field: field });
    if (!raw) return;
    var val = convertForField(field, raw);
    rec({ stage: 'convert', val: val, field: field });

    // 1) Vue currentRow 직접 주입 (정확 — vFlmnCl 기반)
    if (vm && field && vm.mainList && vm.mainList.currentRow) {
      try {
        if (typeof vm.$set === 'function') vm.$set(vm.mainList.currentRow, field, val);
        else vm.mainList.currentRow[field] = val;
        rec({ stage: 'inject-vue', field: field });
        return;
      } catch (e) { rec({ stage: 'inject-vue-fail', msg: String(e) }); }
    }
    // 2) DOM 폴백
    var input = findInputByField(field);
    if (input) {
      setInput(input, val);
      rec({ stage: 'inject-dom', field: field });
      if (/설비ID/.test(input.placeholder || '')) setTimeout(function () { triggerSearch(input); }, 120);
    } else {
      alert('변환값: ' + val + '\n(입력칸 ' + (field || '?') + ' 못 찾음)');
    }
  };

  // QRCODE/BARCODE 클릭 가로채 → 타겟 필드 캐싱 → 네이티브 스캐너 (OCR은 통과 = awms 원본)
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
            var vm = getAwmsVM();
            window.__pendingVM = vm;
            window.__pendingField = vm ? (vm.vFlmnCl || '') : '';   // 모달 닫기 전에 타겟 캐싱
            rec({ stage: 'intercept', txt: txt, field: window.__pendingField });
            closeFlmnModal();
            if (window.AndroidScanner && window.AndroidScanner.scan) window.AndroidScanner.scan();
            else alert('네이티브 스캐너 없음 (앱 업데이트 필요)');
          }
        } catch (err) {}
      }, true);
      console.log('[awms-inject] scan-intercept + vFlmnCl autofill installed');
    }
  } catch (e) {}
})();
