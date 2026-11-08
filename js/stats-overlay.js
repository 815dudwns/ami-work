// stats-overlay.js — 통계를 지도 위 전체 화면 창(iframe)으로 연다 (2026-11-08, 영준님 승인)
//   전엔 메뉴 '통계'가 stats.html 로 페이지를 넘겼다. 돌아오면 지도를 처음부터 다시 띄워(리스트 파싱·
//   workStatus 대조·마커) 느렸고, 통계는 들어갈 때마다 workStatus 전체(약 9MB)를 받았다.
//   이제 지도는 그대로 두고 그 위에 stats.html?embed=1 을 띄운다. 통계는 부모(지도)의 메모리 workStatus 를
//   그대로 읽는다(getMapWorkStatus — 전송 0). 닫으면 지도가 그 자리에 그대로 있다.
//   휴대폰 뒤로가기 = 창 닫기(열 때 history.pushState, popstate 에서 닫음).
//   stats.html 을 직접 열면(즐겨찾기) 예전처럼 혼자 돈다 — 그때는 지도 미러 + 델타(js/ws-format.js).

// 통계 iframe 이 부모의 workStatus 를 읽는 통로 — workStatus 는 let 이라 window 속성이 아니다.
function getMapWorkStatus() { return workStatus; }

let _statsOverlay = null, _statsFrame = null, _statsOpen = false;
function openStatsOverlay(e) {
    if (e) e.preventDefault();
    if (typeof window.closeAppMenu === 'function') window.closeAppMenu();
    if (!_statsOverlay) {
        _statsOverlay = document.createElement('div');
        _statsOverlay.id = 'stats-overlay';
        _statsOverlay.style.cssText = 'position:fixed;inset:0;z-index:3000;background:#f3f4f6;display:none;';
        _statsFrame = document.createElement('iframe');
        _statsFrame.title = '통계';
        _statsFrame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
        _statsFrame.src = 'stats.html?embed=1&v=' + encodeURIComponent(typeof APP_VERSION !== 'undefined' ? APP_VERSION : '');
        _statsOverlay.appendChild(_statsFrame);
        document.body.appendChild(_statsOverlay);
    } else {
        // 다시 열 때 — 지도의 최신 workStatus 로 다시 집계(전송 없음)
        try { const w = _statsFrame.contentWindow; if (w && typeof w.loadAndRender === 'function') w.loadAndRender(true); } catch (err) {}
    }
    _statsOverlay.style.display = 'block';
    _statsOverlay.classList.add('open');
    _statsOpen = true;
    try { history.pushState({ amiStats: 1 }, ''); } catch (err) {}
}
function closeStatsOverlay(fromPop) {
    if (!_statsOpen) return;
    _statsOpen = false;
    _statsOverlay.style.display = 'none';
    _statsOverlay.classList.remove('open');
    // 닫기 버튼으로 닫았으면 열 때 넣은 기록 한 칸을 되돌린다(뒤로가기 두 번 눌러야 나가는 일 방지)
    if (!fromPop && history.state && history.state.amiStats) { try { history.back(); } catch (err) {} }
}
window.addEventListener('popstate', () => { if (_statsOpen) closeStatsOverlay(true); });
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('stats-btn');
    if (btn) btn.addEventListener('click', openStatsOverlay);
});
