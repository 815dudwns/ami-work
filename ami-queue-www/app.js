// AMI Queue — 메인 (로그 패널 / 세션 / 초기화). Phase A: 목록 표시·삭제만.

// 앱 버전 (원격로드 반영 확인용 — 화면 헤더에 표시). 갱신 시 CLAUDE.md 버전표도 갱신.
const APP_VER = 'v0613a-수집폼';

// ── 화면 처리상황 패널 ──────────────────────────
function _statusPanel() {
    let el = document.getElementById('qstatus');
    if (!el) {
        el = document.createElement('div');
        el.id = 'qstatus';
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:46vh;overflow-y:auto;'
            + 'background:rgba(17,24,39,.97);color:#d1d5db;font:12px/1.5 ui-monospace,monospace;'
            + 'padding:6px 10px 16px;z-index:99999;white-space:pre-wrap;border-top:3px solid #2563eb;display:none';
        const hd = document.createElement('div');
        hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;'
            + 'background:rgba(17,24,39,.99);padding:4px 0;margin-bottom:4px;border-bottom:1px solid #374151';
        hd.innerHTML = '<b style="color:#93c5fd">처리상황</b>';
        const x = document.createElement('button');
        x.textContent = '닫기';
        x.style.cssText = 'padding:4px 10px;font-size:11px;background:#374151;color:#fff;border:none;border-radius:6px';
        x.onclick = () => { el.style.display = 'none'; };
        hd.appendChild(x);
        el.appendChild(hd);
        const body = document.createElement('div');
        body.id = 'qstatus-body';
        el.appendChild(body);
        document.body.appendChild(el);
    }
    return el;
}

function _setBanner(text, kind) {
    let b = document.getElementById('qbanner');
    if (!b) {
        b = document.createElement('div');
        b.id = 'qbanner';
        b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:100000;padding:14px 12px;'
            + 'font:700 15px/1.4 -apple-system,sans-serif;text-align:center;color:#fff;display:none';
        document.body.appendChild(b);
    }
    if (!text) { b.style.display = 'none'; return; }
    b.style.background = kind === 'ok' ? '#059669' : kind === 'err' ? '#dc2626' : '#2563eb';
    b.textContent = text;
    b.style.display = 'block';
}

// ── 로그 (화면 패널 + firebase) ──────────────────
function log(msg, cls) {
    try {
        const panel = _statusPanel();
        const body = document.getElementById('qstatus-body');
        if (body) {
            const d = document.createElement('div');
            d.style.color = cls === 'err' ? '#f87171' : cls === 'ok' ? '#34d399' : cls === 'warn' ? '#fbbf24' : '#d1d5db';
            d.textContent = new Date().toLocaleTimeString('ko-KR', { hour12: false }) + ' ' + msg;
            body.appendChild(d);
            while (body.childNodes.length > 40) body.removeChild(body.firstChild);
            panel.style.display = 'block';
            panel.scrollTop = panel.scrollHeight;
        }
    } catch (e) {}
    if (cls === 'err') console.error('[ami-queue]', msg); else console.log('[ami-queue]', msg);
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            firebase.database().ref('awmslog/amiqueue').push({
                msg: String(msg), cls: cls || '', ts: Date.now(), iso: new Date().toISOString(),
            });
        }
    } catch (e) {}
}

// ── awms 열기 (네이티브 멀티웹뷰) ─────────────────
function openAwms() {
    if (window.AwmsQ && AwmsQ.openAwms) AwmsQ.openAwms();
    else log('AwmsQ 브릿지 없음 — 웹 미리보기 모드', 'warn');
}

// ── 수집(collect.js) 동적 로드 + 진입 버튼 (push만 반영; C 빌드 때 index.html files에 정식 편입) ──
function _loadCollect() {
    if (window.__collectHandoff || document.getElementById('collect-js')) return;
    const s = document.createElement('script');
    s.id = 'collect-js';
    s.src = 'https://815dudwns.github.io/ami-work/ami-queue-www/collect.js?t=' + Date.now();
    document.head.appendChild(s);
}

// 콜드스타트 딥링크 회수 — collect.js 로드/AwmsQ 준비 타이밍에 무관하게 폴링(1회성 key).
function _pollPendingCollect(tries) {
    if (tries <= 0) return;
    let k = '';
    try { if (window.AwmsQ && AwmsQ.getPendingCollectKey) k = AwmsQ.getPendingCollectKey() || ''; } catch (e) {}
    if (k) { _fireCollect(k, 8); return; }
    setTimeout(function () { _pollPendingCollect(tries - 1); }, 500);
}
function _fireCollect(k, tries) {
    if (window.__collectHandoff) { window.__collectHandoff(k); return; }
    if (tries > 0) setTimeout(function () { _fireCollect(k, tries - 1); }, 400);
}
function _injectCollectBtn() {
    if (document.getElementById('btn-collect')) return;
    const row = document.querySelector('.container > div[style*="display:flex"]');
    const b = document.createElement('button');
    b.id = 'btn-collect';
    b.className = 'btn-secondary';
    b.style.cssText = 'flex:0 0 70px;width:70px;background:#7c3aed;color:#fff';
    b.textContent = '수집';
    b.onclick = function () { if (window.__collectOpen) window.__collectOpen('일반'); };
    if (row) row.appendChild(b);
}

// ── 초기화 ──────────────────────────────────────
(async () => {
    log('AMI Queue ' + APP_VER + ' 시작', 'ok');
    // 버전 배지 — 헤더 우상단 고정(session.js가 덮어쓰는 header-sub와 분리)
    try {
        const hd = document.querySelector('.header');
        if (hd && !document.getElementById('app-ver-badge')) {
            hd.style.position = hd.style.position || 'sticky';
            const b = document.createElement('div');
            b.id = 'app-ver-badge';
            b.textContent = APP_VER;
            b.style.cssText = 'position:absolute;top:10px;right:12px;font-size:10px;font-weight:700;opacity:.7;color:#fff';
            hd.appendChild(b);
        }
    } catch (e) {}
    initFb();
    _loadCollect();
    _injectCollectBtn();
    _pollPendingCollect(12);   // 콜드스타트 딥링크 회수
    await checkSession();
    await refreshQueue();
    setInterval(checkSession, 5 * 60 * 1000);
    setInterval(() => {
        if (typeof isSessionOK === 'function' && !isSessionOK() && typeof ensureLoginAutofill === 'function') {
            ensureLoginAutofill();
        }
    }, 8000);
})();
