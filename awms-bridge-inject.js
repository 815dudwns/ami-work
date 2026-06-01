// awms-bridge 리모컨(원격 로더) — 이 파일을 푸시하면 awms-bridge 앱이 받아 awms 페이지에 실행한다.
// 앱 재빌드 불필요. 카메라 후킹은 앱 baked-in이 담당하고, 여기는 override + 향후 로직(G1S3 변환, 사진 자동매핑 등) 자리.
// 네이티브가 직접 받아 주입하므로 awms 트래픽엔 안 나타남.

(function () {
  'use strict';
  var VER = 'v1';
  try { console.log('[awms-inject] remote loader OK ' + VER); } catch (e) {}

  // 리모컨 동작 눈 확인용 — awms 페이지 좌상단에 잠깐 배지 표시
  try {
    if (location.host.indexOf('awms') > -1 && !document.getElementById('__inject_badge')) {
      var show = function () {
        if (!document.body || document.getElementById('__inject_badge')) return;
        var b = document.createElement('div');
        b.id = '__inject_badge';
        b.textContent = '리모컨 연결됨 ' + VER;
        b.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;background:#16a34a;color:#fff;'
          + 'font:11px -apple-system,sans-serif;padding:3px 8px;border-bottom-right-radius:6px;opacity:.9';
        document.body.appendChild(b);
        setTimeout(function () { try { b.remove(); } catch (e) {} }, 4000);
      };
      if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    }
  } catch (e) {}

  // ── 향후 여기에 추가 (모두 푸시만으로 반영) ──
  // - 모뎀 바코드/QR: G1S3... → 012... 변환 (vBarcdQr 가로채기)
  // - 사진 자동매핑 (Firebase 사진/데이터 → awms 폼)
})();
