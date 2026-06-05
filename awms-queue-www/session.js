// awms 세션 상태 + awmsEval 헬퍼 (멀티웹뷰 브릿지)
let _sessionOK = false;
let _sessionInfo = null;

// ─────────────────────────────────────────────
// awmsEval — awmsWebView 컨텍스트에서 식(expr) 실행 후 결과 반환
// 미검증 — live session 후 확인
// ─────────────────────────────────────────────
let __seq = 0;
const __pend = {};

function awmsEval(expr) {
    return new Promise((res, rej) => {
        const id = ++__seq;
        __pend[id] = { res, rej };
        if (!(window.AwmsQ && AwmsQ.callAwms)) {
            rej(new Error('AwmsQ 브릿지 없음(웹 미리보기)'));
            return;
        }
        AwmsQ.callAwms(id, expr);
    });
}

// 네이티브가 awmsWebView 실행 결과를 여기로 콜백
// 미검증 — live session 후 확인
window.__awmsResult = (id, s) => {
    const p = __pend[id];
    if (!p) return;
    delete __pend[id];
    let v;
    try { v = JSON.parse(s); } catch { v = s; }
    if (v && v.__err) p.rej(new Error(v.__err));
    else p.res(v);
};

// ─────────────────────────────────────────────
// 세션 확인 — awmsEval로 session-info fetch
// ─────────────────────────────────────────────
async function checkSession() {
    try {
        // 검증된 awms API(getBusiList)로 세션 확인 — session-info 경로가 불확실해 로그인돼도 미인식되던 문제 수정
        const body = await awmsEval(
            `fetch('${AWMS_BASE}/ami/mob/mtr/mobMtr1000/getBusiList?DEPT1=3970',{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject('HTTP '+r.status))`
        );
        const arr = Array.isArray(body) ? body : ((body && body.data) || []);
        _sessionOK = Array.isArray(arr) && arr.length > 0;
        _sessionInfo = _sessionOK ? { userName: 'awms 연결됨', cha: arr.length } : null;
        updateSessionBar();
        return _sessionOK;
    } catch (e) {
        _sessionOK = false;
        _sessionInfo = null;
        const isBridgeMissing = e.message && e.message.includes('AwmsQ 브릿지 없음');
        updateSessionBar(isBridgeMissing ? '웹 미리보기 모드' : '체크 실패: ' + e.message);
        return false;
    }
}

function updateSessionBar(extra) {
    const bar = document.getElementById('session-bar');
    const sub = document.getElementById('header-sub');
    if (!bar) return;
    if (_sessionOK) {
        const who = (_sessionInfo && (
            _sessionInfo.userName || _sessionInfo.USER_NM ||
            _sessionInfo.userId || _sessionInfo.USER_ID
        )) || '?';
        bar.textContent = `awms 세션: 연결됨 (${who})`;
        bar.className = 'session-bar ok';
        if (sub) sub.textContent = `로그인: ${who}`;
    } else {
        const msg = extra || 'awms 열어 로그인';
        bar.textContent = `awms 세션: 없음 — ${msg}`;
        bar.className = 'session-bar err';
        if (sub) sub.textContent = '작업자 awms 세션 연결 필요';
    }
}

function setSessionBarMsg(msg) {
    const bar = document.getElementById('session-bar');
    if (!bar) return;
    bar.textContent = msg;
    bar.className = 'session-bar';
}

function isSessionOK() { return _sessionOK; }
function getSessionInfo() { return _sessionInfo; }
