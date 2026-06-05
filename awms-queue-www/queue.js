// 종로 Firebase 큐 + awms 완료 동기화
let _db = null;
let _queue = [];  // {addr, meter, rep, status:'pending'|'err', err?}
let _completedNewMeters = new Set();  // syncCompleted에서 채움

function initFb() {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    _db = firebase.database(app);
    log('Firebase 연결 [JS:remote-r4 찾기진단] ' + firebaseConfig.databaseURL.split('/').pop(), 'ok');
}

// ─────────────────────────────────────────────
// refreshQueue — 큐 탭 진입/새로고침 시 호출
// ─────────────────────────────────────────────
async function refreshQueue() {
    const ok = await syncCompleted();   // 1. awms 완료 수신 (세션+완료대조)
    if (!ok) {
        // 세션·완료대조 둘 다 돼야 큐 표시 — 안 되면 큐 숨김(이미 등록된 것까지 보여 중복 위험)
        _queue = [];
        if (typeof renderQueue === 'function') renderQueue();
        log('awms 로그인 + 완료대조 필요 — 큐 숨김(중복 방지)', 'warn');
        return;
    }
    await loadQueue();       // 2. 큐 갱신 (완료대조 통과 = 안 올라간 것만)
}

// ─────────────────────────────────────────────
// syncCompleted — awms workStep=28 완료목록 수신
//   (a) ami-work awmscomplete/ 에 PUT
//   (b) _completedNewMeters Set 갱신 → loadQueue에서 중복 제외
// ─────────────────────────────────────────────
async function syncCompleted() {
    try {
        const rows = await _fetchAllCompleted();
        if (!rows) return false;  // 세션 없음/완료대조 실패 → 큐 표시 보류(중복 방지)

        // (a) ami-work DB에 PUT (raw fetch — SDK는 ami-jongno용)
        const payload = {
            at: Date.now(),
            busiKey: '397820263153',
            title: '14차',
            count: rows.length,
            total: (rows[0] && rows[0].CNT) || rows.length,  // 서버 보고 총건수
            rows,
        };
        const putUrl = `${AWMS_WORK_DB}/awmscomplete/c${Date.now()}.json`;
        try {
            const pr = await fetch(putUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (pr.ok) {
                log(`awmscomplete PUT 완료: ${rows.length}건`, 'ok');
            } else {
                log(`awmscomplete PUT 실패: HTTP ${pr.status}`, 'warn');
            }
        } catch (e) {
            log('awmscomplete PUT 오류: ' + e.message, 'warn');
        }

        // (b) 완료/임시저장 계기 Set — WHM_NO(완료=신설 / 임시저장25=철거) + CREMO_WHM_NO(완료의 철거)
        _completedNewMeters = new Set();
        rows.forEach(r => {
            if (r.WHM_NO) _completedNewMeters.add(String(r.WHM_NO).trim());
            if (r.CREMO_WHM_NO) _completedNewMeters.add(String(r.CREMO_WHM_NO).trim());
        });
        log(`완료 Set 갱신: ${_completedNewMeters.size}건`);
        // 조회 성공 = awms 세션 살아있음 → 세션바/isSessionOK 갱신 (앱시작 시 false 고정 해소)
        _sessionOK = true;
        if (!_sessionInfo) _sessionInfo = { userName: 'awms 연결됨' };
        if (typeof updateSessionBar === 'function') updateSessionBar();
        return true;  // 세션+완료대조 성공

    } catch (e) {
        // awmsEval reject는 이 catch로 올 수 없음 (_fetchAllCompleted에서 처리)
        log('syncCompleted 예외: ' + e.message, 'err');
        return false;
    }
}

// awms workStep=28 전체 페이지 수집 (1000건 단위)
// 세션 없으면 조용히 null 반환 + 상태바 업데이트
async function _fetchAllCompleted() {
    const ROW_COUNT = 1000;
    const all = [];

    try {
        // 전차수 getBusiList → 각 차수 완료(28) 수집 — 중복등록 제외용(14차 고정 아님, 모든 차수 커버)
        const busiList = await awmsEval(`fetch('/ami/mob/mtr/mobMtr1000/getBusiList?DEPT1=3970',{credentials:'include'}).then(r=>r.json())`);
        const conss = (Array.isArray(busiList) ? busiList : []).map(b => b.CONS_NO).filter(Boolean);
        for (const cons of conss) {
            let page = 1;
            while (page <= 30) {
                const expr = `fetch('/ami/mob/mtr/mobMtr1000/getMainList?FLAG=1&DEPT1=3970&busiKey=${cons}&searchVal=&sortKey=&workStep=25,28&pPageNo=${page}&pRowCount=${ROW_COUNT}',{credentials:'include'}).then(r=>r.json())`;
                const data = await awmsEval(expr);
                // 응답 정규화: 배열/{data}/{list} 형태 모두 처리
                const arr = Array.isArray(data) ? data
                    : (data && Array.isArray(data.data)) ? data.data
                    : (data && Array.isArray(data.list)) ? data.list
                    : null;
                if (!arr || arr.length === 0) break;
                all.push(...arr);
                if (arr.length < ROW_COUNT) break;
                page++;
            }
        }
        return all;
    } catch (e) {
        // AwmsQ 브릿지 없음(웹 미리보기) 또는 세션 만료
        const msg = e.message && e.message.includes('AwmsQ 브릿지 없음')
            ? '웹 미리보기 모드 — awms 완료 수신 생략'
            : '세션 만료 — awms 열어 로그인';
        setSessionBarMsg(`awms 세션: 없음 — ${msg}`);
        log('syncCompleted skip: ' + msg, 'warn');
        return null;
    }
}

// ─────────────────────────────────────────────
// loadQueue — ami-jongno workStatus/jongno 읽어 큐 구성
// ─────────────────────────────────────────────
async function loadQueue() {
    if (!_db) initFb();
    log('동기화 큐 조회 중...');
    const snap = await _db.ref('workStatus/jongno').once('value');
    const ws = snap.val() || {};

    const items = [];
    for (const [addr, v] of Object.entries(ws)) {
        const reps = v.replacement_list || {};
        for (const [meter, rep] of Object.entries(reps)) {
            if (rep.source === 'awms') continue;       // awms에서 가져온 건 제외
            if (rep.awms_synced === true) continue;    // 이미 등록됨
            if (!rep.new_meter_id) continue;           // 신계기 없으면 미완성
            // syncCompleted에서 이미 awms 등록(완료28/임시저장25)된 건 제외 — 철거(meter)·신설(new_meter_id) 둘 다 대조
            if (_completedNewMeters.has(String(meter).trim()) || _completedNewMeters.has(String(rep.new_meter_id).trim())) continue;
            items.push({
                addr,
                meter,
                rep,
                status: rep.awms_error ? 'err' : 'pending',
                err: rep.awms_error || null,
            });
        }
    }
    items.sort((a, b) => (b.rep.replaced_at || 0) - (a.rep.replaced_at || 0));
    _queue = items;
    renderQueue();
    log(`큐 조회 완료: 대기 ${items.filter(i => i.status === 'pending').length}건, 실패 ${items.filter(i => i.status === 'err').length}건`, 'ok');
}

// ─────────────────────────────────────────────
// renderQueue — 큐 카드 렌더링 + 요약 업데이트
// ─────────────────────────────────────────────
function renderQueue() {
    const pending = _queue.filter(i => i.status === 'pending');
    const errs = _queue.filter(i => i.status === 'err');

    const elPending = document.getElementById('stat-pending');
    const elErr = document.getElementById('stat-err');
    const btnAll = document.getElementById('btn-run-all');

    if (elPending) elPending.textContent = pending.length;
    if (elErr) elErr.textContent = errs.length;
    if (btnAll) {
        btnAll.disabled = pending.length === 0 || !isSessionOK();
        btnAll.textContent = `일괄 등록 (대기 ${pending.length}건)`;
    }

    loadDoneToday();

    const list = document.getElementById('queue-list');
    if (!list) return;

    if (!_queue.length) {
        list.innerHTML = '<div class="card" style="text-align:center;color:#9ca3af;padding:30px">동기화 대기 항목 없음</div>';
        return;
    }
    list.innerHTML = _queue.slice(0, 100).map(i => {
        const ts = i.rep.replaced_at
            ? new Date(i.rep.replaced_at).toLocaleString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })
            : '-';
        const badge = i.status === 'err'
            ? '<span class="badge badge-err">실패</span>'
            : '<span class="badge badge-pending">대기</span>';
        const errMsg = i.err
            ? `<div class="meta" style="color:#dc2626">에러: ${escapeHtml(i.err)}</div>`
            : '';
        return `
            <div class="queue-item">
                <div class="addr">${escapeHtml(i.addr)} ${badge}</div>
                <div class="meta">
                    구계기 <b>${escapeHtml(i.meter)}</b> → 신계기 <b>${escapeHtml(i.rep.new_meter_id)}</b><br>
                    사용량 ${escapeHtml(i.rep.removal_value ?? '?')} | 작업자 ${escapeHtml(i.rep.worker || '-')} | ${ts}
                </div>
                ${errMsg}
                <div class="actions">
                    <button class="btn-primary" style="padding:6px 10px;width:auto"
                        onclick="runOne('${escapeAttr(i.addr)}', '${escapeAttr(i.meter)}')">한 건 등록</button>
                </div>
            </div>`;
    }).join('');
}

async function loadDoneToday() {
    try {
        const snap = await _db.ref('workStatus/jongno').once('value');
        const ws = snap.val() || {};
        const todayMs = new Date();
        todayMs.setHours(0, 0, 0, 0);
        let cnt = 0;
        for (const v of Object.values(ws)) {
            const reps = v.replacement_list || {};
            for (const rep of Object.values(reps)) {
                if (rep.awms_synced === true && (rep.awms_synced_at || 0) >= todayMs.getTime()) cnt++;
            }
        }
        const el = document.getElementById('stat-done');
        if (el) el.textContent = cnt;
    } catch (e) {
        // ignore
    }
}

async function markSynced(addr, meter, awmsResp) {
    const upd = {
        awms_synced: true,
        awms_synced_at: Date.now(),
        awms_response: awmsResp || null,
        awms_error: null,
    };
    await _db.ref(`workStatus/jongno/${addr}/replacement_list/${meter}`).update(upd);
}

async function markError(addr, meter, errMsg) {
    await _db.ref(`workStatus/jongno/${addr}/replacement_list/${meter}`).update({
        awms_error: String(errMsg).slice(0, 500),
        awms_error_at: Date.now(),
    });
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "\\'"); }
