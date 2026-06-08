// AMI Queue — 메인 (로그 패널 / 세션 / 초기화). Phase A: 목록 표시·삭제만.

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

// ── 초기화 ──────────────────────────────────────
(async () => {
    log('AMI Queue 시작 [Phase A: 목록·삭제만, awms write 없음]', 'ok');
    initFb();
    await checkSession();
    await refreshQueue();
    setInterval(checkSession, 5 * 60 * 1000);
    setInterval(() => {
        if (typeof isSessionOK === 'function' && !isSessionOK() && typeof ensureLoginAutofill === 'function') {
            ensureLoginAutofill();
        }
    }, 8000);
})();
