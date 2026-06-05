// 메인 앱 — 세션 모니터, 큐 등록 실행

// ─────────────────────────────────────────────
// 로그 헬퍼 (null-safe)
// ─────────────────────────────────────────────
function log(msg, cls) {
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
    log(`등록 시도: ${addr} / ${meter} → ${item.rep.new_meter_id}`);
    try {
        if (typeof registerReplacement !== 'function') {
            throw new Error('saverow 모듈 준비중 (awms-saverow.js 미로드)');
        }
        const resp = await registerReplacement({ addr, meter, rep: item.rep });
        log(`등록 성공: ${meter} (${JSON.stringify(resp).slice(0, 80)})`, 'ok');
        await markSynced(addr, meter, resp);
    } catch (e) {
        log(`등록 실패 ${meter}: ${e.message}`, 'err');
        await markError(addr, meter, e.message);
    }
    await loadQueue();
}

async function runAll() {
    const pending = _queue.filter(i => i.status === 'pending');
    if (!pending.length) return;
    if (!isSessionOK()) { alert('awms 세션 없음. 로그인 먼저'); return; }
    if (typeof registerReplacement !== 'function') {
        alert('saverow 모듈 준비중 (awms-saverow.js 미로드). 일괄 등록 불가.');
        return;
    }
    if (!confirm(
        `${pending.length}건 일괄 등록할까요?\n` +
        `건당 ${Math.round(POST_DELAY_MIN / 1000)}~${Math.round(POST_DELAY_MAX / 1000)}초 텀, ` +
        `약 ${Math.round(pending.length * (POST_DELAY_MIN + POST_DELAY_MAX) / 2 / 60000)}분 소요`
    )) return;

    const btnAll = document.getElementById('btn-run-all');
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnAll) btnAll.disabled = true;
    if (btnRefresh) btnRefresh.disabled = true;

    let ok = 0, err = 0;
    for (const item of pending) {
        try {
            log(`[${ok + err + 1}/${pending.length}] ${item.meter} 등록 중...`);
            const resp = await registerReplacement({ addr: item.addr, meter: item.meter, rep: item.rep });
            await markSynced(item.addr, item.meter, resp);
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
    if (btnRefresh) btnRefresh.disabled = false;
    await loadQueue();
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
    log('AWMS Queue 시작', 'ok');
    initFb();
    await checkSession();
    await refreshQueue();
    // 5분마다 세션 체크
    setInterval(checkSession, 5 * 60 * 1000);
})();
