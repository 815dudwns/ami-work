// firebase.js — 상태 관리 (localStorage + Firebase Realtime Database 동기화)
// Firebase SDK: firebase-app-compat, firebase-database-compat (map.html에서 로드)

// 전역 상태 변수
let workStatus = {};

// Firebase DB 참조
let db = null;
let statusRef = null;

// ── 키 인코딩/디코딩 ─────────────────────────────────────────
// Firebase 키 금지 문자: . # $ [ ] /
function encodeKey(str) {
    return str
        .replace(/\./g,  '_dot_')
        .replace(/#/g,   '_hash_')
        .replace(/\$/g,  '_dollar_')
        .replace(/\[/g,  '_lb_')
        .replace(/\]/g,  '_rb_')
        .replace(/\//g,  '_sl_');
}

function decodeKey(str) {
    return str
        .replace(/_dot_/g,    '.')
        .replace(/_hash_/g,   '#')
        .replace(/_dollar_/g, '$')
        .replace(/_lb_/g,     '[')
        .replace(/_rb_/g,     ']')
        .replace(/_sl_/g,     '/');
}

// ── 이벤트 큐 ─────────────────────────────────────────────────
function loadEventQueue() {
    const saved = localStorage.getItem(EVENTS_KEY);
    return saved ? JSON.parse(saved) : [];
}

function saveEventQueue(queue) {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(queue));
}

function addEvent(ev) {
    const queue = loadEventQueue();
    queue.push({ ...ev, id: Date.now().toString(36) + Math.random().toString(36).slice(2) });
    saveEventQueue(queue);
}

// 큐를 Firebase에 전송 (이벤트별 update, set 안 씀)
async function flushEventQueue() {
    if (!statusRef) return;
    const queue = loadEventQueue();
    if (!queue.length) return;

    // 같은 대상의 중복 이벤트는 ts 최신 것만 유지
    const stateMap = {};   // address → latest state event
    const checkMap = {};   // address+'||'+meter → latest check event
    const failMap  = {};   // address+'||'+meter → latest meterFail event

    queue.forEach(ev => {
        if (ev.type === 'state' || ev.type === 'reset') {
            if (!stateMap[ev.address] || ev.ts > stateMap[ev.address].ts)
                stateMap[ev.address] = ev;
        } else if (ev.type === 'check' || ev.type === 'uncheck') {
            const key = ev.address + '||' + ev.meter;
            if (!checkMap[key] || ev.ts > checkMap[key].ts)
                checkMap[key] = ev;
        } else if (ev.type === 'meterFail') {
            const key = ev.address + '||' + ev.meter;
            if (!failMap[key] || ev.ts > failMap[key].ts)
                failMap[key] = ev;
        }
    });

    // Firebase multi-path update 객체 생성
    const updates = {};

    Object.values(stateMap).forEach(ev => {
        const p = encodeKey(ev.address);
        updates[`${p}/state`]         = ev.state;
        updates[`${p}/reason`]        = ev.reason || '';
        updates[`${p}/updatedAt`]     = isoKst(new Date(ev.ts));
        updates[`${p}/updatedBy`]     = ev.updatedBy || '';
        updates[`${p}/updatedByName`] = ev.updatedByName || '';
        // 작업 완료/보류/불가 시 rework 플래그 해제
        if (ev.state !== 'pending') updates[`${p}/rework`] = false;
    });

    Object.values(checkMap).forEach(ev => {
        const p = encodeKey(ev.address);
        const m = encodeKey(ev.meter);
        updates[`${p}/meterChecks/${m}`] = { checked: ev.type === 'check', ts: ev.ts };
    });

    Object.values(failMap).forEach(ev => {
        const p = encodeKey(ev.address);
        const m = encodeKey(ev.meter);
        if (ev.failed) {
            updates[`${p}/failedMeters/${m}`] = ev.reason != null ? ev.reason : '';
        } else {
            updates[`${p}/failedMeters/${m}`] = null; // Firebase에서 노드 제거
        }
    });

    // 전송 전 큐 id 스냅샷 — await 중 추가된 이벤트를 삭제하지 않기 위한 race condition 방지
    const sentIds = new Set(queue.map(e => e.id));

    try {
        await statusRef.update(updates);
        // 전송한 id만 제거 (await 중 enqueue된 새 이벤트 보존)
        saveEventQueue(loadEventQueue().filter(e => !sentIds.has(e.id)));
        console.log('[Queue] 이벤트 전송 완료, 건수:', queue.length);
    } catch (e) {
        console.warn('[Queue] 이벤트 전송 실패, 큐 유지:', e.message);
    }
}

// 디바운스 전송 — 연속 작업(체크 여러 개·완료)을 모아서 마지막 작업 후 2.5초 뒤 1회 전송.
// 고정 주기가 아니라 "작업 멈추면" 보냄. 이벤트는 즉시 localStorage 큐에 보존되므로 유실 없음.
let _flushTimer = null;
function flushEventQueueDebounced(ms = 2500) {
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(() => { _flushTimer = null; flushEventQueue(); }, ms);
}
function flushEventQueueNow() {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    return flushEventQueue();
}

// ── Firebase 초기화 및 DB 연결 ─────────────────────────────────
function initFirebaseApp() {
    try {
        const app = firebase.apps.length
            ? firebase.app()
            : firebase.initializeApp(firebaseConfig);
        db = firebase.database(app);
        statusRef = db.ref('workStatus/charger4eleccar');
        console.log('[Firebase] 초기화 완료');
        return true;
    } catch (e) {
        console.warn('[Firebase] 초기화 실패:', e.message);
        return false;
    }
}

// ── localStorage 접근 ─────────────────────────────────────────
function loadStatusLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
}

// saveStatus — failedMeters 전용 로컬 저장 (Firebase 미전송)
// 주의: state/checkedMeters 변경은 saveStateEvent/saveCheckEvent 사용
function saveStatus(status) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
}

function loadCheckedLocal() {
    const saved = localStorage.getItem(CHECKED_KEY);
    return saved ? JSON.parse(saved) : {};
}

function saveCheckedLocal(checkedMap) {
    localStorage.setItem(CHECKED_KEY, JSON.stringify(checkedMap));
}

function applyLocalChecked() {
    const checked = loadCheckedLocal();
    Object.keys(checked).forEach(addr => {
        if (workStatus[addr]) {
            workStatus[addr].checkedMeters = checked[addr];
        }
    });
}

// ── 이벤트 기반 상태 변경 함수 ────────────────────────────────

// 상태 변경 (완료/보류/불가/초기화)
function saveStateEvent(address, state, reason, updatedBy, updatedByName) {
    if (!workStatus[address]) {
        workStatus[address] = { state: 'pending', checkedMeters: [], reason: '' };
    }
    workStatus[address].state         = state;
    workStatus[address].reason        = reason || '';
    workStatus[address].updatedAt     = isoKst();
    workStatus[address].updatedBy     = updatedBy || '';
    workStatus[address].updatedByName = updatedByName || '';
    // 재작업 처리 — complete 또는 fail/hold로 새로 작업하면 rework 플래그 해제
    if (state !== 'pending' && workStatus[address].rework) {
        workStatus[address].rework = false;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));

    addEvent({
        address,
        type: state === 'pending' ? 'reset' : 'state',
        state,
        reason,
        updatedBy,
        updatedByName,
        rework: state !== 'pending' ? false : undefined,
        ts: Date.now(),
    });

    // 작업 즉시 전송 (fire-and-forget — 실패 시 큐 유지되어 다음 기회에 재시도)
    if (typeof flushEventQueueDebounced === 'function') flushEventQueueDebounced();
}

// 체크 토글
function saveCheckEvent(address, meter, checked) {
    if (!workStatus[address]) {
        workStatus[address] = { state: 'pending', checkedMeters: [], reason: '' };
    }
    const cm = workStatus[address].checkedMeters || [];
    const idx = cm.indexOf(meter);
    if (checked && idx === -1) cm.push(meter);
    if (!checked && idx > -1) cm.splice(idx, 1);
    workStatus[address].checkedMeters = cm;
    // 로컬 meterChecks에도 ts와 함께 기록 — 머지 union에서 내 미전송 체크 보존(encodeKey로 Firebase 키와 동일 형식)
    const _ts = Date.now();
    if (!workStatus[address].meterChecks) workStatus[address].meterChecks = {};
    workStatus[address].meterChecks[encodeKey(meter)] = { checked, ts: _ts };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));

    addEvent({
        address,
        type: checked ? 'check' : 'uncheck',
        meter,
        ts: _ts,
    });

    // 체크 별도 localStorage 갱신
    const allChecked = {};
    Object.keys(workStatus).forEach(addr => {
        if (workStatus[addr]?.checkedMeters?.length) allChecked[addr] = workStatus[addr].checkedMeters;
    });
    saveCheckedLocal(allChecked);

    // 체크는 빠르게 전송 — 0.4초 디바운스(연타는 묶고 단발은 거의 즉시). 여러 명 같은 건물 체크 실시간성.
    if (typeof flushEventQueueDebounced === 'function') flushEventQueueDebounced(400);
}

// ── Firebase 데이터 → 내부 형식 변환 ─────────────────────────

// 단일 Firebase 값(val) → 내부 형식 객체 변환 (주소 키 불필요, 값 객체만 처리)
function buildOneFromFirebase(val) {
    const meterChecks = val.meterChecks || {};
    let checkedMeters;

    // 기존 배열 형태도 지원 (하위호환)
    if (Array.isArray(val.checkedMeters)) {
        checkedMeters = val.checkedMeters;
    } else {
        checkedMeters = Object.entries(meterChecks)
            .filter(([, v]) => v.checked)
            .map(([encodedMeter]) => decodeKey(encodedMeter));
    }

    // failedMeters: Firebase 키(인코딩됨) → 계기번호(디코딩) 로 변환
    const failedMeters = {};
    if (val.failedMeters && typeof val.failedMeters === 'object') {
        for (const [encodedMeter, reason] of Object.entries(val.failedMeters)) {
            failedMeters[decodeKey(encodedMeter)] = reason;
        }
    }

    return {
        state:         val.state         || 'pending',
        reason:        val.reason        || '',
        updatedAt:     val.updatedAt     || '',
        updatedBy:     val.updatedBy     || '',
        updatedByName: val.updatedByName || '',
        rework:        val.rework === true,
        previousCompleteAt: val.previousCompleteAt || '',
        previousCompleteBy: val.previousCompleteBy || '',
        checkedMeters,
        meterChecks,  // 원본 보관 (ts 비교용)
        added_meters: val.added_meters || {},   // 사용자 추가 계기 (admin 등)
        failedMeters,  // 계기 개별 불가: { 계기번호: 사유 }
    };
}

// buildWorkStatusFromFirebase — 전체 객체 변환 (기존 호출처 호환 유지)
function buildWorkStatusFromFirebase(data) {
    const result = {};
    Object.entries(data).forEach(([encodedAddr, val]) => {
        result[decodeKey(encodedAddr)] = buildOneFromFirebase(val);
    });
    return result;
}

// ── 사용자 추가 계기 (admin 등) ────────────────────────────────
// added_meters/{meter_id}: { meter_id, added_by, added_by_name, added_at, mfg_ym, source }
async function saveAddedMeter(address, meterId, extra) {
    if (!statusRef) throw new Error('Firebase 미초기화');
    const session = (typeof authGetSession === 'function') ? authGetSession() : null;
    const data = {
        meter_id: meterId,
        added_by: session ? session.id : '',
        added_by_name: session ? session.name : '',
        added_at: Date.now(),
        ...(extra || {}),
    };
    const p = encodeKey(address);
    await statusRef.child(`${p}/added_meters/${meterId}`).set(data);
    // 로컬 반영
    if (!workStatus[address]) {
        workStatus[address] = { state: 'pending', checkedMeters: [], reason: '', added_meters: {} };
    }
    if (!workStatus[address].added_meters) workStatus[address].added_meters = {};
    workStatus[address].added_meters[meterId] = data;
    // localStorage 즉시 반영 — 재진입/앱 재시작 시 사라지지 않게 (Firebase set 직후 바로 미러)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus)); } catch (e) {}
    return data;
}

async function removeAddedMeter(address, meterId) {
    if (!statusRef) throw new Error('Firebase 미초기화');
    const p = encodeKey(address);
    await statusRef.child(`${p}/added_meters/${meterId}`).remove();
    if (workStatus[address] && workStatus[address].added_meters) {
        delete workStatus[address].added_meters[meterId];
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus)); } catch (e) {}
}

// ── 증분 리스너용 단일 주소 머지 ─────────────────────────────
// addr: 디코딩된 주소 키, rawVal: Firebase snap.val() 원본
function mergeOneAddress(addr, rawVal) {
    const fb    = buildOneFromFirebase(rawVal);
    const local = workStatus[addr];

    if (!local) {
        workStatus[addr] = fb;
        return;
    }

    const fbTime    = fb.updatedAt    ? new Date(fb.updatedAt).getTime()    : 0;
    const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;

    // ★ meterChecks(계기 체크)는 updatedAt과 독립 이벤트 — 계기별 ts로 union 머지.
    //   updatedAt 게이트에 막히면 다른 작업자 체크가 반영 안 됨(여러 명이 같은 건물 체크 시 실시간 안 됨).
    //   union이라 다른 작업자 체크를 받으면서 내 미전송 체크(local)도 보존.
    const mc = { ...(local.meterChecks || {}) };
    Object.entries(fb.meterChecks || {}).forEach(([m, v]) => {
        if (!mc[m] || ((v && v.ts) || 0) >= ((mc[m] && mc[m].ts) || 0)) mc[m] = v;
    });
    const mergedChecked = Object.entries(mc).filter(([, v]) => v && v.checked).map(([m]) => decodeKey(m));

    if (fbTime > localTime) {
        // Firebase가 더 최신 — 단 meterChecks/checkedMeters는 위 union 결과로(내 미전송 체크 유실 방지)
        workStatus[addr] = { ...fb, meterChecks: mc, checkedMeters: mergedChecked };
    } else {
        // 로컬 유지하되 added_meters(추가계기)는 합집합, failedMeters는 Firebase 권위, meterChecks는 ts union
        local.added_meters  = { ...(fb.added_meters || {}), ...(local.added_meters || {}) };
        local.failedMeters  = { ...(fb.failedMeters || {}) };
        local.meterChecks   = mc;
        local.checkedMeters = mergedChecked;
    }
}

// Firebase 데이터와 로컬 데이터를 updatedAt 기준으로 병합 (더 최신 쪽 유지)
// mergeOneAddress를 루프 호출하여 중복 없이 처리
function mergeFirebaseData(firebaseData) {
    Object.entries(firebaseData).forEach(([encodedAddr, val]) => {
        mergeOneAddress(decodeKey(encodedAddr), val);
    });

    applyLocalChecked();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
}

// Firebase에서 workStatus 읽기 (레거시 — 더 이상 initFirebase에서 호출 안 함, 외부 호환용 유지)
async function syncFromFirebase() {
    if (!statusRef) return;
    try {
        const snapshot = await statusRef.get();
        if (snapshot.exists()) {
            const data = snapshot.val();
            mergeFirebaseData(data);
            console.log('[Firebase] syncFromFirebase 완료, 주소수:', Object.keys(workStatus).length);
        } else {
            console.log('[Firebase] 데이터 없음 — 로컬 상태 유지');
        }
    } catch (e) {
        console.warn('[Firebase] syncFromFirebase 실패:', e.message);
    }
}

// ── 증분 리스너 ───────────────────────────────────────────────

// localStorage 디바운스 저장 (burst 시 다수 child_changed가 몰려도 1회만 저장)
let _persistTimer = null;
function persistAll() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus)); } catch (e) {}
}
function persistAllDebounced() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(persistAll, 300);
}

// child_changed 1건: 마커 즉시 갱신 + localStorage 디바운스 저장
function persistAndPaint(addr) {
    if (typeof updateMarkerColor === 'function') updateMarkerColor(addr);
    // 같은 주소(합친 마커면 구성 지번 포함) 상세 패널이 열려 있으면 체크박스 목록도 실시간 갱신
    //   (지금까지 마커 색만 갱신 → 패널 열어둔 작업자는 닫았다 다시 열어야 남의 체크가 보였음)
    try {
        const overlay = document.getElementById('fullpage-overlay');
        const detailOpen = overlay && overlay.classList.contains('active');
        const inView = (typeof currentAddress !== 'undefined' && currentAddress === addr)
            || (typeof currentAddresses !== 'undefined' && Array.isArray(currentAddresses) && currentAddresses.includes(addr));
        if (detailOpen && inView && typeof renderMetersList === 'function') renderMetersList();
    } catch (e) {}
    persistAllDebounced();
}

// 초기 전체 수신 완료 플래그
let _initialLoadDone = false;

// 증분 리스너 부착 — syncFromFirebase 대체 (풀다운로드 없음)
// child_added / child_changed / child_removed + once('value') 를 같은 동기 블록에서 부착
// → Firebase SDK가 1개 서버 구독을 공유해 초기 다운로드가 1회로 처리됨.
// ★ 주의: 이 함수 밖에서 statusRef.get() 등 추가 읽기 금지 (2배 다운로드 방지)
function attachStatusListeners() {
    _initialLoadDone = false;

    statusRef.on('child_added', snap => {
        mergeOneAddress(decodeKey(snap.key), snap.val());
        if (_initialLoadDone) {
            persistAndPaint(decodeKey(snap.key));
        }
        // 초기 burst 중에는 once('value') 후 일괄 처리 → CPU/렌더 폭발 방지
    });

    statusRef.on('child_changed', snap => {
        mergeOneAddress(decodeKey(snap.key), snap.val());
        if (_initialLoadDone) {
            persistAndPaint(decodeKey(snap.key));
        }
    });

    statusRef.on('child_removed', snap => {
        const addr = decodeKey(snap.key);
        delete workStatus[addr];
        if (_initialLoadDone) {
            persistAll();
            if (typeof refreshAllMarkers === 'function') refreshAllMarkers();
        }
    });

    // 초기 전체 수신 완료 신호 — child_added와 다운로드를 공유하므로 별도 get() 없음.
    // payload(snapshot)는 버리고 "완료 신호"로만 사용.
    statusRef.once('value', () => {
        _initialLoadDone = true;
        applyLocalChecked();
        persistAll();
        if (typeof refreshAllMarkers === 'function') refreshAllMarkers();
        console.log('[Firebase] 증분 리스너 초기 로드 완료, 주소수:', Object.keys(workStatus).length);
    });
}

// ── 초기 로드 + 리스너 부착 ───────────────────────────────────
async function initFirebase() {
    console.log('[Firebase] initFirebase 시작');

    const firebaseOk = initFirebaseApp();

    // 1순위: localStorage
    const local = loadStatusLocal();
    if (local && Object.keys(local).length > 0) {
        workStatus = local;
        console.log('[Local] localStorage에서 로드 완료, 주소수:', Object.keys(workStatus).length);
    } else {
        // 2순위: data/work-status.json
        try {
            const res = await fetch('./data/work-status.json');
            if (!res.ok) throw new Error('fetch 실패: ' + res.status);
            const data = await res.json();
            workStatus = data;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            console.log('[Local] data/work-status.json 로드 완료, 주소수:', Object.keys(workStatus).length);
        } catch (e) {
            console.warn('[Local] work-status.json 로드 실패:', e.message);
            workStatus = {};
        }
    }

    if (firebaseOk) {
        // 미전송 이벤트 큐 먼저 전송
        await flushEventQueue();

        // 풀다운로드 폴링 대신 증분 리스너 부착
        // ★ attachStatusListeners 안에서 child_* + once('value') 를 같은 동기 블록 부착
        //   → 초기 다운로드 1회 공유. 추가 get()/syncFromFirebase 호출 금지.
        attachStatusListeners();

        // visibilitychange: flush만 (리스너가 항상 연결 유지하므로 sync 불필요)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('[Sync] 창 활성화 — 미전송 큐 재시도');
                flushEventQueueNow();
            } else {
                // 백그라운드 전환 — 디바운스 대기 중인 미전송분 즉시 전송 (앱 종료 대비)
                flushEventQueueNow();
            }
        });
        // 탭/앱 완전 종료 직전에도 미전송분 시도 (best-effort)
        window.addEventListener('pagehide', () => { flushEventQueueNow(); });
    }
}
