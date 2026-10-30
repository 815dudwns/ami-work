// app-version.js — 켜 둔 채인 아미맵이 새 배포를 받게 한다 (2026-10-19)
//
// ★왜: 작업자들이 아미맵 페이지를 켜 둔 채로 하루를 보낸다. 새 배포가 나가도 페이지를 다시
//   읽지 않으니 누구는 새 버전, 누구는 옛 버전이 됐다(영준님 "누구는 되고 누구는 안 됨").
//   ?v= 캐시 쿼리는 '다시 읽을 때'만 효과가 있어서 이 문제를 못 푼다.
//
// 동작: 시작 · 화면 복귀(visible) · 10분마다 app-version.json 을 캐시 없이 읽어 APP_VERSION 과
//   다르면 → 미전송 작업(이벤트 큐·로컬 저장)을 먼저 보내고 → 그 버전 쿼리로 새로고침.
//   ★같은 버전으로는 한 번만 새로고침한다(sessionStorage). CDN 이 옛 파일을 잠깐 주는 동안
//     무한 새로고침이 도는 것을 막는다.
//   ★상세 화면이 열려 있거나 입력 중이면 미룬다 — 치던 사유가 날아가면 안 된다.
//
// 배포 규칙: map.html 의 버전 라벨 · 모든 ?v= · 이 파일의 APP_VERSION · app-version.json 을
//   **같은 값**으로 올린다. 하나라도 어긋나면 새로고침 뒤에도 버전이 달라 계속 미뤄진다(1회 제한이 막는다).
const APP_VERSION = 'v20261030.8';
const APP_VERSION_URL = 'app-version.json';
const APP_VERSION_POLL_MS = 10 * 60 * 1000;
const APP_RELOAD_GUARD_KEY = 'ami_reloaded_for_version';

let _appVerChecking = false;

function _appBusy() {
    try {
        const overlay = document.getElementById('fullpage-overlay');
        if (overlay && overlay.classList.contains('active')) return true;
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return true;
    } catch (_) {}
    return false;
}

async function _flushBeforeReload() {
    const tasks = [];
    try { if (typeof flushMeterFailReasons === 'function') flushMeterFailReasons(); } catch (_) {}
    try { if (typeof persistStatusFlush === 'function') tasks.push(persistStatusFlush()); } catch (_) {}
    try { if (typeof flushEventQueueNow === 'function') tasks.push(flushEventQueueNow()); } catch (_) {}
    // 오프라인이면 전송이 끝나지 않는다 — 8초만 기다리고 넘어간다. 큐는 localStorage 에 남아
    //   새로 뜬 페이지가 시작하자마자 다시 보낸다(firebase.js initFirebase 의 flushEventQueue).
    await Promise.race([
        Promise.allSettled(tasks),
        new Promise(r => setTimeout(r, 8000)),
    ]);
}

async function checkAppVersion(reason) {
    if (_appVerChecking) return;
    _appVerChecking = true;
    try {
        const r = await fetch(APP_VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return;
        const remote = String(((await r.json()) || {}).version || '').trim();
        if (!remote || remote === APP_VERSION) return;
        if (sessionStorage.getItem(APP_RELOAD_GUARD_KEY) === remote) {
            console.warn('[app-version] 이미 이 버전으로 새로고침했는데 아직 옛 파일이다 — 더 하지 않는다', APP_VERSION, '->', remote);
            return;
        }
        if (_appBusy()) {
            console.log('[app-version] 새 버전', remote, '— 작업 중이라 미룸');
            return;
        }
        console.log('[app-version] 새 버전', APP_VERSION, '->', remote, '(' + reason + ') — 미전송분 보내고 새로고침');
        sessionStorage.setItem(APP_RELOAD_GUARD_KEY, remote);
        await _flushBeforeReload();
        location.replace(location.pathname + '?v=' + encodeURIComponent(remote));
    } catch (e) {
        console.warn('[app-version] 확인 실패(무시):', e && e.message);
    } finally {
        _appVerChecking = false;
    }
}

(function () {
    // 시작 직후 한 번 — 데이터 로딩을 붙잡지 않게 살짝 늦춘다
    setTimeout(() => checkAppVersion('start'), 1500);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkAppVersion('visible');
    });
    setInterval(() => checkAppVersion('interval'), APP_VERSION_POLL_MS);
})();
