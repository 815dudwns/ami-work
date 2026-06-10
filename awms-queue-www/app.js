// 메인 앱 — 세션 모니터, 큐 등록 실행

// ─────────────────────────────────────────────
// 화면 처리상황 패널 (index.html에 #log 없음 → 동적 생성, 리모컨으로 추가)
// ─────────────────────────────────────────────
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

// 상단 큰 배너 (등록 중 / 성공 / 실패)
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
    const bg = kind === 'ok' ? '#059669' : kind === 'err' ? '#dc2626' : '#2563eb';
    b.style.background = bg;
    b.textContent = text;
    b.style.display = 'block';
}

// ─────────────────────────────────────────────
// 로그 헬퍼 (null-safe) — 화면 패널 + firebase 동시
// ─────────────────────────────────────────────
function log(msg, cls) {
    // 화면 패널에 출력 (처리상황 실시간 표시)
    try {
        const panel = _statusPanel();
        const body = document.getElementById('qstatus-body');
        if (body) {
            const d = document.createElement('div');
            const color = cls === 'err' ? '#f87171' : cls === 'ok' ? '#34d399' : cls === 'warn' ? '#fbbf24' : '#d1d5db';
            d.style.color = color;
            d.textContent = `${new Date().toLocaleTimeString('ko-KR', { hour12: false })} ${msg}`;
            body.appendChild(d);
            // 최근 40줄만 유지
            while (body.childNodes.length > 40) body.removeChild(body.firstChild);
            panel.style.display = 'block';
            panel.scrollTop = panel.scrollHeight;
        }
    } catch (e) {}

    const el = document.getElementById('log');
    if (el) {
        const d = document.createElement('div');
        if (cls) d.className = cls;
        d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        el.appendChild(d);
        el.scrollTop = el.scrollHeight;
    }
    if (cls === 'err') console.error('[awms-queue]', msg);
    else console.log('[awms-queue]', msg);
    // firebase 통합 로그 — awms 페이지 아닌 곳(큐 웹뷰)의 로그도 남겨 saveRow 전 과정을 한곳에서 추적
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            firebase.database().ref('awmslog/queue').push({
                msg: String(msg), cls: cls || '', ts: Date.now(), iso: new Date().toISOString(),
            });
        }
    } catch (e) {}
}

// ─────────────────────────────────────────────
// awms 열기 — 네이티브 멀티웹뷰
// ─────────────────────────────────────────────
function openAwms() {
    if (window.AwmsQ && AwmsQ.openAwms) {
        AwmsQ.openAwms();
    } else {
        log('AwmsQ 브릿지 없음 — 웹 미리보기 모드', 'warn');
    }
}

// ─────────────────────────────────────────────
// 등록 실행 — registerReplacement 인터페이스에만 의존
//   (실제 구현은 awms-saverow.js 담당 — 준비 전엔 "saverow 모듈 준비중")
// ─────────────────────────────────────────────
async function runOne(addr, meter) {
    const item = _queue.find(i => i.addr === addr && i.meter === meter);
    if (!item) { log(`항목 못 찾음: ${addr} / ${meter}`, 'err'); return; }
    if (!isSessionOK()) {
        alert('awms 세션이 없습니다. [awms 열기]에서 로그인 후 시도하세요.');
        return;
    }
    _setBanner(`등록 중... ${meter} → ${item.rep.new_meter_id}`, 'busy');
    log(`등록 시도: ${addr} / ${meter} → ${item.rep.new_meter_id}`);
    try {
        if (typeof registerReplacement !== 'function') {
            throw new Error('saverow 모듈 준비중 (awms-saverow.js 미로드)');
        }
        const resp = await registerReplacement({ addr, meter, rep: item.rep });
        log(`등록 성공: ${meter} (등록번호 ${resp.consTgtSeqno || '?'})`, 'ok');
        _setBanner(`등록 성공  ${meter}  (임시저장, 등록번호 ${resp.consTgtSeqno || '?'})`, 'ok');
        await markSynced(addr, meter, resp);
        markDoneLocal(meter, item.rep.new_meter_id);  // 즉시 완료 반영 (다음 refresh 전까지)
        setTimeout(() => _setBanner('', ''), 5000);  // 성공 배너 5초 후 자동 숨김
    } catch (e) {
        log(`등록 실패 ${meter}: ${e.message}`, 'err');
        _setBanner(`등록 실패  ${meter}  —  ${e.message}`, 'err');
        setTimeout(() => _setBanner('', ''), 8000);  // 실패 배너도 8초 후 자동 숨김 (계속 안 없어지던 문제)
        await markError(addr, meter, e.message);
    }
    await refreshQueue();   // 이벤트 후 전체 새로고침(awms 완료상태 반영)
}

async function runAll() {
    // 현재 선택한 날짜 필터의 대기+실패건 일괄 등록 (전체 선택 시 전부)
    const inView = (typeof _dateFilter !== 'undefined' && _dateFilter !== 'all' && typeof _dateKey === 'function')
        ? _queue.filter(i => _dateKey(i.rep.replaced_at) === _dateFilter)
        : _queue;
    const pending = inView.filter(i => i.status === 'pending' || i.status === 'err');
    const dateLabel = (typeof _dateFilter !== 'undefined' && _dateFilter !== 'all') ? _dateFilter : '전체';
    await _runBatch(pending, dateLabel);
}

// 선택 등록 — 체크박스로 고른 항목 전송 (상태 무관, done 제외)
async function runSelected() {
    const checks = Array.from(document.querySelectorAll('.q-check:checked'));
    if (!checks.length) { alert('선택된 항목이 없습니다. (시퀀스 앞 체크박스로 선택)'); return; }
    const keySet = new Set(checks.map(c => `${c.dataset.addr}${c.dataset.meter}`));
    const pending = _queue.filter(i => i.status !== 'done' && keySet.has(`${i.addr}${i.meter}`));
    await _runBatch(pending, '선택');
}
window.runSelected = runSelected;

// 공통 일괄 등록 루프 (runAll/runSelected 공유)
async function _runBatch(pending, label) {
    if (!pending.length) { alert(`[${label}] 등록할 대기/실패 건이 없습니다.`); return; }
    if (!isSessionOK()) { alert('awms 세션 없음. 로그인 먼저'); return; }
    if (typeof registerReplacement !== 'function') {
        alert('saverow 모듈 준비중 (awms-saverow.js 미로드). 일괄 등록 불가.');
        return;
    }
    if (!confirm(
        `[${label}] ${pending.length}건 일괄 등록할까요?\n` +
        `건당 ${Math.round(POST_DELAY_MIN / 1000)}~${Math.round(POST_DELAY_MAX / 1000)}초 텀, ` +
        `약 ${Math.round(pending.length * (POST_DELAY_MIN + POST_DELAY_MAX) / 2 / 60000)}분 소요`
    )) return;

    const btnAll = document.getElementById('btn-run-all');
    const btnSel = document.getElementById('btn-run-selected');
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnAll) btnAll.disabled = true;
    if (btnSel) btnSel.disabled = true;
    if (btnRefresh) btnRefresh.disabled = true;

    // 백그라운드 서비스 시작 — 화면 꺼져도 루프 유지
    if (window.AwmsQ && AwmsQ.startBgTask) { try { AwmsQ.startBgTask(); } catch(e){} }

    let ok = 0, err = 0;
    try {
        for (const item of pending) {
            try {
                log(`[${ok + err + 1}/${pending.length}] ${item.meter} 등록 중...`);
                const resp = await registerReplacement({ addr: item.addr, meter: item.meter, rep: item.rep });
                await markSynced(item.addr, item.meter, resp);
                markDoneLocal(item.meter, item.rep.new_meter_id);  // 즉시 완료 반영
                ok++;
                log(`  성공`, 'ok');
            } catch (e) {
                err++;
                log(`  ${e.message}`, 'err');
                await markError(item.addr, item.meter, e.message);
            }
            if ((ok + err) < pending.length) {
                log(`  ... 다음까지 대기`);
                await randomDelay();
                if ((ok + err) % 5 === 0) await checkSession();
            }
        }
        log(`일괄 완료: 성공 ${ok} / 실패 ${err}`, 'warn');
        await refreshQueue();   // 이벤트 후 전체 새로고침
    } finally {
        // 정상 완료 / 에러 / 중단 어느 경우에도 서비스 종료 + 버튼 복구
        if (window.AwmsQ && AwmsQ.stopBgTask) { try { AwmsQ.stopBgTask(); } catch(e){} }
        if (btnAll) btnAll.disabled = false;
        if (btnSel) btnSel.disabled = false;
        if (btnRefresh) btnRefresh.disabled = false;
    }
}

// 등록 사이 랜덤 대기 (봇 감지 회피)
function randomDelay() {
    const min = (typeof POST_DELAY_MIN === 'number') ? POST_DELAY_MIN : 8000;
    const max = (typeof POST_DELAY_MAX === 'number') ? POST_DELAY_MAX : 18000;
    const ms = min + Math.random() * (max - min);
    return new Promise(res => setTimeout(res, ms));
}

// ─────────────────────────────────────────────
// refreshQueue — 외부(버튼/네이티브) 노출
// ─────────────────────────────────────────────
window.refreshQueue = refreshQueue;

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
(async () => {
    log('AWMS Queue 시작 [JS:remote-r7 완료즉시반영]', 'ok');
    initFb();
    if (typeof loadSiteMap === 'function') await loadSiteMap();  // 도로명/계약정보 캐시(1회)
    await checkSession();
    await refreshQueue();
    // 5분마다 세션 체크 (큐 자동 새로고침은 안 함 — 수동/등록이벤트 후에만 갱신)
    setInterval(checkSession, 5 * 60 * 1000);
    // 세션 없을 때 8초마다 로그인 아이디/비번 자동입력 시도 (awms 열면 바로 채워지게)
    setInterval(() => {
        if (typeof isSessionOK === 'function' && !isSessionOK() && typeof ensureLoginAutofill === 'function') {
            ensureLoginAutofill();
        }
    }, 8000);
})();

// 우상단 버전 표시 (새 배포 반영 확인용) — push마다 갱신
(function () {
    var APP_VER = 'v0611-1';
    function show() {
        if (!document.body) { setTimeout(show, 300); return; }
        if (document.getElementById('app-ver')) return;
        var v = document.createElement('div');
        v.id = 'app-ver';
        v.textContent = APP_VER;
        v.style.cssText = 'position:fixed;top:6px;right:10px;z-index:99999;font-size:11px;font-weight:800;color:#9ca3af;background:rgba(0,0,0,0.35);padding:2px 8px;border-radius:6px;pointer-events:none;';
        document.body.appendChild(v);
    }
    show();
})();
