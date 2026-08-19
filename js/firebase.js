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

// ── syncAt — 델타 동기화용 서버 시각 (2026-08-19, 1단계) ──────
//
// 왜 updatedAt 을 안 쓰고 새 필드를 두는가:
//   updatedAt 은 '사람이 일한 시각'이라는 뜻을 이미 갖고 있고 stats.html 이 그 날짜로
//   일별 실적을 집계한다(stats.html: isSameLocalDay(ws.updatedAt, dateStr)).
//   동기화 편의로 체크할 때마다 updatedAt 을 올리면 완료 실적이 체크한 날로 옮겨간다
//   — 실측하니 지금 데이터에서만 30건이 이동한다. 조용히 틀리는 종류라 더 나쁘다.
//   그래서 '이 레코드가 마지막으로 바뀐 시각'은 별도 필드로 둔다.
//
// 왜 서버 시각인가:
//   updatedAt 은 폰이 찍는다. 폰 시계가 틀리면 델타가 새거나 겹친다.
//   또 기존 updatedAt 은 표기가 섞여 있어(+09:00 10,660건 / Z 2,123건) 문자열 정렬이
//   시간순과 169군데 어긋난다. 숫자 서버시각이면 정렬이 곧 시간순이다.
//
// ★workStatus 를 쓰는 모든 경로가 이걸 통과해야 한다. 하나라도 빠지면 그 변경이
//   델타에서 샌다 — 이 작업에서 가장 저지르기 쉬운 실수라 헬퍼로 묶었다.
function _serverNow() {
    try {
        return firebase.database.ServerValue.TIMESTAMP;
    } catch (e) {
        return Date.now();   // SDK 미로드 등 예외 — 폰 시각이라도 넣는다(없는 것보단 낫다)
    }
}

// 단일 주소 update 객체에 syncAt 을 붙인다. (경로: statusRef.child(주소).update(patch))
function withSyncAt(patch) {
    const out = Object.assign({}, patch);
    out.syncAt = _serverNow();
    return out;
}

// multi-path update 객체에 대상 주소들의 syncAt 을 붙인다.
//   (경로: statusRef.update({ '주소/필드': 값, ... }) — 주소 접두사별로 하나씩)
function addSyncAtForPaths(updates, encodedAddrs) {
    encodedAddrs.forEach(p => { updates[`${p}/syncAt`] = _serverNow(); });
    return updates;
}

// ── 이벤트 큐 ─────────────────────────────────────────────────
function loadEventQueue() {
    const saved = localStorage.getItem(EVENTS_KEY);
    return saved ? JSON.parse(saved) : [];
}

// ★2026-08-19: 예전엔 try/catch 가 없어 quota 예외가 그대로 던져졌고, 호출부의
//   `catch (_) {}` 가 그걸 조용히 삼켰다. 그러면 전송도 큐도 실패한 채 화면만 완료로
//   보이고, 새로고침하면 그 완료가 사라진다 — 작업자는 끝까지 모른다.
//   큐는 '아직 서버에 못 보낸 작업'이라 이 앱에서 가장 잃으면 안 되는 데이터다.
//   실패하면 조용히 넘어가지 말고 (1) 자리를 만들어 다시 시도하고 (2) 그래도 안 되면 알린다.
function saveEventQueue(queue) {
    try {
        localStorage.setItem(EVENTS_KEY, JSON.stringify(queue));
        return true;
    } catch (e) {
        console.warn('[queue] 저장 실패 — 자리 확보 후 재시도:', e.message);
        // ★우선순위 역전 바로잡기: 옛 workStatus 미러(최대 4.3M자)는 서버에서 다시 받으면
        //   되지만, 큐는 다시 만들 수 없다. 자리를 다투면 미러를 버린다.
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
        try { localStorage.removeItem(CHECKED_KEY); } catch (_) {}
        try {
            localStorage.setItem(EVENTS_KEY, JSON.stringify(queue));
            console.warn('[queue] 자리 확보 후 저장 성공');
            return true;
        } catch (e2) {
            console.error('[queue] 저장 최종 실패 — 미전송 작업이 유실될 수 있다:', e2.message);
            notifySendProblem('저장 공간이 가득 찼습니다. 앱을 껐다 켜 주세요.');
            return false;
        }
    }
}

// 전송·저장 문제를 작업자에게 알린다. 지금까지는 console 뿐이라 화면에 아무것도 안 떴다.
//   지도 위 알약(sync-pill)을 재사용한다 — 새 UI 를 만들지 않는다.
function notifySendProblem(msg) {
    try {
        if (typeof showSyncProgress === 'function') {
            showSyncProgress('전송 실패 — ' + msg, 8000);
        }
    } catch (_) {}
}

function addEvent(ev) {
    const queue = loadEventQueue();
    queue.push({ ...ev, id: Date.now().toString(36) + Math.random().toString(36).slice(2) });
    return saveEventQueue(queue);
}


// 직접 전송이 실패했을 때의 공통 폴백 — 완료·체크가 같은 길을 타게 한다.
//   저장까지 실패하면 조용히 넘어가지 않고 작업자에게 알린다.
function queueFallback(ev, label, flushMs) {
    let saved = false;
    try {
        saved = addEvent(ev);
    } catch (e) {
        console.error('[queue] 폴백 중 예외:', e && e.message);
        saved = false;
    }
    if (saved) {
        if (typeof flushEventQueueDebounced === 'function') flushEventQueueDebounced(flushMs || 2500);
    } else {
        notifySendProblem((label || '작업') + '이 저장되지 않았습니다. 다시 눌러 주세요.');
    }
    return saved;
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

    // ★이 큐가 건드린 모든 주소에 syncAt 을 붙인다(델타 누락 방지).
    //   state/check/fail 세 갈래가 같은 주소를 건드릴 수 있으므로 주소 집합으로 모은다.
    const touched = new Set();
    Object.values(stateMap).forEach(ev => touched.add(encodeKey(ev.address)));
    Object.values(checkMap).forEach(ev => touched.add(encodeKey(ev.address)));
    Object.values(failMap).forEach(ev  => touched.add(encodeKey(ev.address)));
    addSyncAtForPaths(updates, [...touched]);

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

// ── workStatus 보관소: localStorage -> IndexedDB (2026-08-19, 델타 2단계) ─────
//
// ★왜 옮기나 (실측): workStatus 미러가 4,308,232자(UTF-8 4.47MB)다. iOS localStorage 한도는
//   5MB 이고 WebKit 은 UTF-16(자당 2바이트)으로 세는 판본이 있어 8.6MB 로 계산될 수 있다.
//   저장이 실패하면 미러가 안 남고, 다음에 앱을 열면 로컬이 비어 전량 수신(LTE 22.8초)이
//   끝날 때까지 빈 화면이 된다 — 영준님이 보신 "처음 열면 완료가 하나도 없다"가 이것이다.
//   게다가 미러가 자리를 다 먹으면 작은 이벤트 큐 저장까지 밀려 완료가 통째 유실된다.
// IndexedDB 는 이 한도가 사실상 없고, site-data 16MB 캐시가 이미 같은 경로로 돌고 있다.
const WS_IDB_KEY = 'ami_work_status_v2';

async function loadStatusStored() {
    // 1순위 IndexedDB
    try {
        if (typeof idbGet === 'function') {
            const v = await idbGet(WS_IDB_KEY);
            if (v && typeof v === 'object' && Object.keys(v).length) {
                console.log('[Local] IndexedDB 로드, 주소수:', Object.keys(v).length);
                return v;
            }
        }
    } catch (e) {
        console.warn('[Local] IndexedDB 읽기 실패 — localStorage 로 폴백:', e.message);
    }
    // 2순위 localStorage(옛 보관소) — 있으면 옮기고 원본을 지운다
    try {
        const old = loadStatusLocal();
        if (old && Object.keys(old).length) {
            console.log('[Local] localStorage 에서 이전, 주소수:', Object.keys(old).length);
            try {
                if (typeof idbSet === 'function') await idbSet(WS_IDB_KEY, old);
                // ★옮긴 뒤에만 지운다. 지우기 전에 실패하면 데이터가 사라진다.
                localStorage.removeItem(STORAGE_KEY);
                console.log('[Local] 이전 완료 — localStorage 자리 반환(약 4.3M자)');
            } catch (e) {
                console.warn('[Local] IDB 이전 실패 — localStorage 원본 유지:', e.message);
            }
            return old;
        }
    } catch (e) {
        console.warn('[Local] localStorage 읽기 실패:', e.message);
    }
    return {};
}

// 저장은 단일 경로로 모은다 — 예전엔 8군데서 제각기 localStorage 에 썼다.
let _persistTimer = null;
let _persistDirty = false;

async function persistStatusNow() {
    _persistDirty = false;
    try {
        if (typeof idbSet === 'function') {
            await idbSet(WS_IDB_KEY, workStatus);
            return true;
        }
    } catch (e) {
        console.warn('[persist] IndexedDB 저장 실패:', e.message);
    }
    // IDB 를 못 쓰는 환경 — 옛 경로로라도 남긴다(용량 초과면 조용히 포기)
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
        return true;
    } catch (e) {
        console.warn('[quota] localStorage 폴백 저장도 실패:', e.message);
        return false;
    }
}

// 3초 디바운스 + 화면 이탈 시 즉시 — 4MB 직렬화를 자주 돌리지 않기 위해서다.
function persistStatus(delay = 3000) {
    _persistDirty = true;
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => { _persistTimer = null; persistStatusNow(); }, delay);
}
function persistStatusFlush() {
    if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
    if (_persistDirty) return persistStatusNow();
    return Promise.resolve(true);
}

// saveStatus — failedMeters 전용 로컬 저장 (Firebase 미전송)
// 주의: state/checkedMeters 변경은 saveStateEvent/saveCheckEvent 사용
function saveStatus(status) {
    // 저장소는 persistStatus 로 일원화 — status 는 workStatus 그 자체다.
    persistStatus();
}

function loadCheckedLocal() {
    const saved = localStorage.getItem(CHECKED_KEY);
    return saved ? JSON.parse(saved) : {};
}

function saveCheckedLocal(checkedMap) {
    localStorage.setItem(CHECKED_KEY, JSON.stringify(checkedMap));
}

// CHECKED_KEY 보험의 보관 범위 — 최근 7일치 체크만 담는다.
//   목적이 '아직 서버에 못 보낸 체크의 보존'이라 오래된 건 담을 이유가 없다(서버에 이미 있고
//   merge 가 되살린다). 전량이면 637KB, 7일치면 55KB — quota 보험이 되레 quota를 먹으면 안 된다.
const CHECK_BACKUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// ★2026-08-19 교체: 옛 applyLocalChecked() 는 checkedMeters 를 로컬 스냅샷으로 '통째 덮어써서'
//   mergeOneAddress 가 ts union 으로 제대로 합쳐놓은 남의 체크를 초기 로드 때마다 되돌렸다.
//   (실증: 폰 A가 계기 3개 체크·완료해도 폰 B는 1개만 보이고, 새로고침해도 매번 재발.
//    meterChecks 는 안 덮어 두 필드가 어긋나기까지 했다. 화면은 checkedMeters 만 읽는다.)
//
//   지금은 '덮어쓰기'가 아니라 'meterChecks 에 ts 와 함께 주입'만 한다. 합칠지 말지 판단은
//   mergeOneAddress 의 union 에 맡긴다 — 판단 지점이 하나여야 어긋나지 않는다.
//   옛 배열 형식({주소:[계기...]})은 ts=0 으로 읽는다. 서버에 같은 항목이 있으면 언제나
//   서버가 이기고, 서버가 모르는 로컬 전용 체크만 살아남는다(그게 이 보험의 목적이다).
function mergeLocalCheckBackup() {
    let backup;
    try {
        backup = loadCheckedLocal();
    } catch (e) {
        console.warn('[check] 로컬 체크 백업 읽기 실패(무시):', e.message);
        return;
    }
    if (!backup || typeof backup !== 'object') return;

    let injected = 0;
    Object.entries(backup).forEach(([addr, val]) => {
        if (!workStatus[addr] || !val) return;
        if (!workStatus[addr].meterChecks) workStatus[addr].meterChecks = {};
        const mc = workStatus[addr].meterChecks;

        // 옛 형식은 배열, 새 형식은 { 인코딩계기: {checked, ts} }
        const entries = Array.isArray(val)
            ? val.map(m => [encodeKey(m), { checked: true, ts: 0 }])
            : Object.entries(val);

        entries.forEach(([m, v]) => {
            if (!v) return;
            const cur = mc[m];
            // 더 새로운 것만 반영. 같거나 오래됐으면 기존(=서버에서 온 것)을 유지한다.
            if (!cur || (v.ts || 0) > (cur.ts || 0)) {
                mc[m] = { checked: !!v.checked, ts: v.ts || 0 };
                injected++;
            }
        });

        workStatus[addr].checkedMeters = Object.entries(mc)
            .filter(([, v]) => v && v.checked)
            .map(([m]) => decodeKey(m));
    });
    if (injected) console.log('[check] 로컬 백업에서 주입한 체크:', injected, '건');
}

// ── 이벤트 기반 상태 변경 함수 ────────────────────────────────

// 상태 변경 (완료/보류/불가/초기화)
function saveStateEvent(address, state, reason, updatedBy, updatedByName) {
    if (!workStatus[address]) {
        workStatus[address] = { state: 'pending', checkedMeters: [], reason: '' };
    }
    const _ts = Date.now();
    workStatus[address].state         = state;
    workStatus[address].reason        = reason || '';
    workStatus[address].updatedAt     = isoKst(new Date(_ts));
    workStatus[address].updatedBy     = updatedBy || '';
    workStatus[address].updatedByName = updatedByName || '';
    // 재작업 처리 — complete 또는 fail/hold로 새로 작업하면 rework 플래그 해제
    if (state !== 'pending' && workStatus[address].rework) {
        workStatus[address].rework = false;
    }
    // localStorage 미러 — 저장공간(quota) 초과해도 앱 동작/전송을 막지 않는다.
    //   (미러는 즉시표시용일 뿐, 권위는 Firebase. quota여도 아래 직접 전송으로 서버 반영 보장.)
    persistStatus(0);   // 작업자가 누른 것 — 지체 없이 저장한다

    const ev = {
        address,
        type: state === 'pending' ? 'reset' : 'state',
        state, reason, updatedBy, updatedByName,
        rework: state !== 'pending' ? false : undefined,
        ts: _ts,
    };

    // 상태 변경은 Firebase로 직접 전송 — quota로 이벤트 큐(localStorage) 저장이 막혀도 서버 반영 보장.
    //   전송 실패(오프라인 등) 시에만 큐로 폴백.
    if (statusRef) {
        const p = encodeKey(address);
        const upd = {};
        upd[`${p}/state`]         = state;
        upd[`${p}/reason`]        = reason || '';
        upd[`${p}/updatedAt`]     = isoKst(new Date(_ts));
        upd[`${p}/updatedBy`]     = updatedBy || '';
        upd[`${p}/updatedByName`] = updatedByName || '';
        if (state !== 'pending') upd[`${p}/rework`] = false;
        upd[`${p}/syncAt`] = _serverNow();   // 델타 동기화용 서버 시각
        statusRef.update(upd).catch(err => {
            console.warn('[state] 직접 전송 실패, 큐 폴백:', err && err.message);
            queueFallback(ev, '완료·보류 기록');
        });
    } else {
        queueFallback(ev, '완료·보류 기록');
    }
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
    // 미러 — quota 초과해도 막지 않음(권위는 Firebase)
    persistStatus(0);

    // ★완료와 같은 처리로 모은다(2026-08-19). 전엔 체크만 별도 폴백이라 실패 처리가 갈렸고,
    //   판단 지점이 둘이면 반드시 어긋난다(오늘 체크 버그가 그랬다).
    const _fallback = () => queueFallback(
        { address, type: checked ? 'check' : 'uncheck', meter, ts: _ts }, '계기 체크', 400);

    // 체크도 Firebase 직접 전송 — quota로 큐가 막혀도 서버 반영 보장. 실패 시 큐 폴백.
    if (statusRef) {
        const p = encodeKey(address);
        const m = encodeKey(meter);
        // ★한 번의 update 로 meterChecks 와 syncAt 을 함께 쓴다(2026-08-19).
        //   전엔 meterChecks 만 set 해서 부모가 안 바뀌었고, 그래서 '체크만 한 건'은
        //   델타에 영영 안 잡혔다. 이게 과거에 델타를 접었던 실체다.
        //   ※state·updatedBy·updatedByName·updatedAt 은 건드리지 않는다 — 체크는 상태 변경이
        //     아니다. 통계(pending 건너뛰기·일자 집계)와 작업자 표시에 영향이 없다.
        statusRef.child(p).update(withSyncAt({ [`meterChecks/${m}`]: { checked, ts: _ts } }))
            .catch(err => { console.warn('[check] 직접 전송 실패, 큐 폴백:', err && err.message); _fallback(); });
    } else {
        _fallback();
    }

    // 체크 별도 localStorage 갱신 — quota-safe (STORAGE_KEY 저장이 실패해도 이건 작아서 산다)
    //   ★ts 를 담은 meterChecks 형식으로 저장한다. 옛 형식(계기 배열)은 ts 가 없어 union 판정이
    //     불가능했고, 그래서 읽을 때 통째 덮어쓸 수밖에 없었다 — 그게 이번 버그의 뿌리였다.
    //   ★최근 7일치만 담는다. 이 보험은 '아직 못 보낸 체크' 용이라 옛것은 담을 이유가 없다.
    try {
        const cutoff = Date.now() - CHECK_BACKUP_WINDOW_MS;
        const allChecked = {};
        Object.keys(workStatus).forEach(addr => {
            const mc = workStatus[addr] && workStatus[addr].meterChecks;
            if (!mc) return;
            const recent = {};
            Object.entries(mc).forEach(([m, v]) => {
                if (v && (v.ts || 0) > cutoff) recent[m] = v;
            });
            if (Object.keys(recent).length) allChecked[addr] = recent;
        });
        saveCheckedLocal(allChecked);
    } catch (e) {
        console.warn('[quota] checkedLocal 저장 실패(무시):', e.message);
    }
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
        // 델타 동기화용 서버 시각. 3단계(델타 쿼리)에서 lastSyncAt 계산에 쓴다.
        //   ★숫자다. 없으면 0 — 1단계 배포 전에 쓰인 레코드가 여기 해당한다.
        syncAt:        (typeof val.syncAt === 'number') ? val.syncAt : 0,
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
    // 추가계기도 델타에 잡히도록 syncAt 을 같이 쓴다(한 번의 update).
    await statusRef.child(p).update(withSyncAt({ [`added_meters/${meterId}`]: data }));
    // 로컬 반영
    if (!workStatus[address]) {
        workStatus[address] = { state: 'pending', checkedMeters: [], reason: '', added_meters: {} };
    }
    if (!workStatus[address].added_meters) workStatus[address].added_meters = {};
    workStatus[address].added_meters[meterId] = data;
    // localStorage 즉시 반영 — 재진입/앱 재시작 시 사라지지 않게 (Firebase set 직후 바로 미러)
    persistStatus(0);
    return data;
}

async function removeAddedMeter(address, meterId) {
    if (!statusRef) throw new Error('Firebase 미초기화');
    const p = encodeKey(address);
    // 삭제도 변경이다 — null 로 지우면서 syncAt 을 올려 델타에 태운다.
    await statusRef.child(p).update(withSyncAt({ [`added_meters/${meterId}`]: null }));
    if (workStatus[address] && workStatus[address].added_meters) {
        delete workStatus[address].added_meters[meterId];
    }
    persistStatus(0);
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
    let mergedChecked = Object.entries(mc).filter(([, v]) => v && v.checked).map(([m]) => decodeKey(m));
    // ★legacy 폴백(2026-08-19): meterChecks 가 아예 없고 서버가 옛 checkedMeters 배열만 가진
    //   레코드가 실서버에 32건 있다. union 결과만 쓰면 그 32건은 체크가 [] 로 지워진다.
    //   지금까지 안 터진 건 옛 applyLocalChecked() 가 로컬 스냅샷으로 되살려주고 있었기 때문이라,
    //   그 호출을 걷어내는 이번 수정과 반드시 짝으로 가야 한다.
    if (!Object.keys(mc).length && Array.isArray(rawVal && rawVal.checkedMeters)) {
        mergedChecked = fb.checkedMeters || [];
    }

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

    // ★applyLocalChecked() 호출 제거(2026-08-19). 여기서 로컬 스냅샷으로 덮으면
    //   위 mergeOneAddress 가 ts union 으로 합쳐놓은 남의 체크가 되돌아간다.
    persistStatus();
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

// 저장 래퍼 — 실제 저장은 persistStatus(단일 경로, IndexedDB)가 한다.
//   옛 이름을 남겨 둔 이유는 호출처가 여럿이라서다.
function persistAll() {
    persistStatus(0);
}
function persistAllDebounced() {
    persistStatus();   // 3초 디바운스 — 저장 경로는 persistStatus 하나로 모았다
}

// child_changed 1건: 마커 즉시 갱신 + localStorage 디바운스 저장
function persistAndPaint(addr) {
    // ★마커 갱신은 묶음으로 돌린다(2026-08-19). updateMarkerColor 는 호출마다 markers 전체를
    //   훑으므로, 다른 작업자 여러 명의 변경이 몰리면 훑기가 그 수만큼 반복된다.
    //   묶으면 '배치당 1회'로 줄고, 지연은 최대 PAINT_MIN_GAP_MS 라 눈에 띄지 않는다.
    //   ※내가 누른 완료는 detail.js updateStatus() 가 그 자리에서 updateMarkerColor 를
    //     부르므로 즉시 반영된다 — 이 지연은 남의 변경에만 걸린다.
    schedulePaint(addr);
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

// ── 초기 수신 중 묶음 렌더 (2026-08-19) ──────────────────────
// 문제: 초기 전체 수신(1만여 건)이 끝날 때까지 화면을 안 그려서, 그동안 로컬 캐시의
//   옛 화면이 보였다. 다른 폰의 완료가 한참 반영 안 되는 증상의 실체가 이것이다.
//   페이지 로드마다 반복되고, 통계는 별도 페이지라 갔다 오면 또 그렇다.
// 해법: 가드를 없애지 않는다(원래 목적인 CPU/렌더 폭발 방지는 지켜야 한다).
//   도착분을 모아 '배치당 마커 1회 훑기'로 반영한다. 건별로 그리면 markers 전체 훑기가
//   수신 건수만큼 반복돼(1만 x 4천) 폰이 멎는다 — 그게 원래 가드를 넣은 이유였다.
const PAINT_BATCH_MAX = 200;      // 한 배치 최대 주소 수
const PAINT_MIN_GAP_MS = 200;     // 배치 사이 최소 간격 — 화면 신선도와 CPU의 절충
let _pendingPaint = new Set();    // 다시 칠할 상태키
let _paintTimer = null;
let _lastPaintAt = 0;
let _syncSeen = 0;                // 초기 수신 진행 건수(표시용)

// 진행 표시 — 상단 중앙 알약. 초기 전체 수신일 때만 띄운다.
//   델타 몇십 건에도 띄우면 시끄럽기만 하다.
function showSyncProgress(text, autoHideMs) {
    const el = (typeof document !== 'undefined') && document.getElementById('sync-pill');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    if (el._hideTimer) { clearTimeout(el._hideTimer); el._hideTimer = null; }
    if (autoHideMs) {
        el._hideTimer = setTimeout(() => { el.classList.remove('show'); el._hideTimer = null; }, autoHideMs);
    }
}
function hideSyncProgress() {
    const el = (typeof document !== 'undefined') && document.getElementById('sync-pill');
    if (el) el.classList.remove('show');
}

function flushPaintQueue() {
    _paintTimer = null;
    if (!_pendingPaint.size) return;
    const keys = _pendingPaint;
    _pendingPaint = new Set();
    _lastPaintAt = Date.now();
    // ★그리기만 한다. 저장(persistAll)은 여기서 하지 않는다 —
    //   3MB 직렬화를 배치마다 돌리면 그리기보다 저장이 더 비싸진다.
    if (typeof repaintMarkersForKeys === 'function') repaintMarkersForKeys(keys);
}

function schedulePaint(statusKey) {
    if (statusKey) _pendingPaint.add(statusKey);
    if (_paintTimer) return;
    // 배치가 다 차면 다음 프레임에 즉시, 아니면 최소 간격을 지켜 예약
    const wait = (_pendingPaint.size >= PAINT_BATCH_MAX)
        ? 0
        : Math.max(0, PAINT_MIN_GAP_MS - (Date.now() - _lastPaintAt));
    // ★requestAnimationFrame 은 this 가 window 여야 한다. const 에 담아 맨 호출하면
    //   "Illegal invocation" 으로 죽어 배치가 영영 안 돈다(실측으로 잡은 버그).
    const raf = fn => (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame(fn) : setTimeout(fn, 16);
    _paintTimer = setTimeout(() => { _paintTimer = null; raf(flushPaintQueue); }, wait);
}

// 증분 리스너 부착 — syncFromFirebase 대체 (풀다운로드 없음)
// child_added / child_changed / child_removed + once('value') 를 같은 동기 블록에서 부착
// → Firebase SDK가 1개 서버 구독을 공유해 초기 다운로드가 1회로 처리됨.
// ★ 주의: 이 함수 밖에서 statusRef.get() 등 추가 읽기 금지 (2배 다운로드 방지)
// ── 델타 동기화 (2026-08-19, 3단계) ──────────────────────────
//
// 지금까지는 페이지를 열 때마다 workStatus 전량(3.05MB)을 다시 받았다. 96%가 이미 끝난
// 완료건이고, 지도 -> 통계 -> 지도 로 오갈 때마다 되풀이됐다. LTE 실측으로 첫 데이터가
// 22.8초 뒤에 도착한다 — 다른 폰의 완료가 한참 반영 안 되던 실체가 이것이다.
//
// 바꾼 방식: 마지막으로 받은 syncAt 이후에 바뀐 레코드만 받는다.
//   orderByChild('syncAt').startAt(lastSyncAt + 1)
//   쿼리 리스너 하나가 '초기 델타'와 '실시간 반영'을 겸한다. 남이 레코드를 고치면
//   syncAt 이 커져 쿼리 범위에 들어오므로 child_added 가 즉시 뜬다.
//   syncAt 은 단조증가라 한번 들어온 레코드가 범위를 벗어나지 않는다 — 따라서 이 구조에서
//   child_removed 는 곧 '서버에서 지워졌다'는 뜻이다.
//
// ★rules 에 workStatus/$dataset .indexOn "syncAt" 이 있어야 한다(2026-08-19 적용 완료).
//   없으면 서버가 전건을 훑어 오히려 느려진다.
const WS_SYNCAT_KEY = 'ami_work_status_syncAt';   // 마지막으로 받은 syncAt (IndexedDB)
const WS_SCHEMA_VERSION = 2;                       // 구조가 바뀌면 올린다 -> 전량 재수신
const WS_SCHEMA_KEY = 'ami_work_status_schema';
const FULL_RESYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;   // 주 1회 키 대조
const WS_AUDIT_KEY = 'ami_work_status_audit_at';

let _lastSyncAt = 0;
let _isDeltaMode = false;

// 로컬이 가진 syncAt 의 최댓값 — 델타 시작점. 서버가 찍은 값만 쓰므로 폰 시계가 안 끼어든다.
function maxSyncAtOf(ws) {
    let mx = 0;
    Object.keys(ws || {}).forEach(k => {
        const v = ws[k] && ws[k].syncAt;
        if (typeof v === 'number' && v > mx) mx = v;
    });
    return mx;
}

// 델타로 갈지 전량으로 갈지 결정한다.
//   ★전량으로 되돌아가는 길을 넉넉히 열어 둔 것이 이 설계의 자가치유다.
//     델타가 싸기 때문에(하루치 14KB) 의심스러우면 되감는 쪽을 택할 수 있다.
async function decideSyncMode() {
    let stored = 0, schema = 0;
    try {
        if (typeof idbGet === 'function') {
            stored = (await idbGet(WS_SYNCAT_KEY)) || 0;
            schema = (await idbGet(WS_SCHEMA_KEY)) || 0;
        }
    } catch (e) { /* 못 읽으면 전량으로 간다 */ }

    const local = maxSyncAtOf(workStatus);
    const have = Object.keys(workStatus).length;

    if (schema !== WS_SCHEMA_VERSION) {
        console.log('[Delta] 스키마 버전 불일치 — 전량 수신');
        return { delta: false, from: 0 };
    }
    if (!have) {
        console.log('[Delta] 로컬이 비었다 — 전량 수신');
        return { delta: false, from: 0 };
    }
    // 저장된 값과 실제 데이터 중 작은 쪽에서 시작한다(저장이 앞서 있으면 구멍이 생긴다).
    const from = Math.min(stored || local, local || stored);
    if (!from) {
        console.log('[Delta] syncAt 을 가진 레코드가 없다 — 전량 수신(1단계 배포 이전 데이터)');
        return { delta: false, from: 0 };
    }
    return { delta: true, from };
}

async function rememberSyncAt(v) {
    try {
        if (typeof idbSet === 'function') {
            await idbSet(WS_SYNCAT_KEY, v);
            await idbSet(WS_SCHEMA_KEY, WS_SCHEMA_VERSION);
        }
    } catch (e) { /* 저장 실패해도 다음 로드에서 데이터로 다시 구한다 */ }
}

// 삭제 감지 — 주 1회 키만 받아(전량의 20.8%) 로컬에만 있는 유령을 걷어낸다.
//   델타는 '바뀐 것'만 주므로 지워진 레코드는 영영 오지 않는다. 그 구멍을 이걸로 막는다.
async function auditDeletions(force) {
    let last = 0;
    try { if (typeof idbGet === 'function') last = (await idbGet(WS_AUDIT_KEY)) || 0; } catch (e) {}
    if (!force && Date.now() - last < FULL_RESYNC_INTERVAL_MS) return;
    try {
        // ★반드시 REST 의 shallow 로 받는다. compat SDK 에는 shallow 옵션이 없어서
        //   once('value', null, {shallow:true}) 로 부르면 세 번째 인자를 조용히 무시하고
        //   전량(2.4MB)을 내려받는다 — 아끼려고 넣은 대조가 되레 제일 비싼 호출이 된다.
        //   (2026-08-19 실측으로 잡았다. 키만 받으면 634KB, 전량의 20.8%다.)
        const url = firebaseConfig.databaseURL + '/workStatus/charger4eleccar.json?shallow=true';
        const res = await fetch(url);
        if (!res.ok) return;
        const serverKeys = await res.json();
        if (!serverKeys || typeof serverKeys !== 'object') return;
        const alive = new Set(Object.keys(serverKeys).map(decodeKey));
        const ghosts = Object.keys(workStatus).filter(a => !alive.has(a));
        if (ghosts.length) {
            ghosts.forEach(a => { delete workStatus[a]; });
            console.log('[Delta] 서버에 없는 로컬 레코드 정리:', ghosts.length, '건');
            persistStatus(0);
            if (typeof refreshAllMarkers === 'function') refreshAllMarkers();
        }
        try { if (typeof idbSet === 'function') await idbSet(WS_AUDIT_KEY, Date.now()); } catch (e) {}
    } catch (e) {
        console.warn('[Delta] 삭제 대조 실패(무시):', e.message);
    }
}

// 작업자용 최종 수단 — 로컬을 비우고 전량을 다시 받는다.
//   지금까지는 이런 수단이 아예 없어서, 폰이 이상하면 앱 데이터를 지우는 수밖에 없었다.
async function forceFullResync() {
    try {
        if (typeof idbSet === 'function') {
            await idbSet(WS_SYNCAT_KEY, 0);
            await idbSet(WS_SCHEMA_KEY, 0);
        }
    } catch (e) {}
    location.reload();
}


let _deltaSource = null;

// 받은 레코드의 syncAt 을 따라가며 다음 델타 시작점을 갱신한다.
function trackSyncAt(val) {
    const v = val && val.syncAt;
    if (typeof v === 'number' && v > _lastSyncAt) _lastSyncAt = v;
}

function attachStatusListeners() {
    _initialLoadDone = false;
    _syncSeen = 0;

    // ★진행 표시는 '받는 중'을 먼저 띄운다. 실측하니 데이터는 네트워크를 기다렸다가
    //   한 덩어리로 도착한다(데스크톱 858ms 대기 후 40ms 안에 12,934건 전부).
    //   즉 기다리는 동안에는 셀 건수가 없다. 건수만으로 표시하면 정작 기다리는 구간이 빈다.
    //   0.6초 안에 끝나면 띄우지 않는다 — 빠른 로드에 알약이 깜빡이면 시끄럽다.
    setTimeout(() => {
        if (!_initialLoadDone && !_isDeltaMode) showSyncProgress('작업상태 받는 중');
    }, 600);

    // ★델타냐 전량이냐 — 여기서 갈린다. 두 경우 모두 아래 리스너 코드가 그대로 쓰인다.
    const src = _isDeltaMode
        ? statusRef.orderByChild('syncAt').startAt(_lastSyncAt + 1)
        : statusRef;
    _deltaSource = src;
    console.log(_isDeltaMode
        ? `[Delta] 델타 수신 — syncAt > ${_lastSyncAt}`
        : '[Delta] 전량 수신');

    src.on('child_added', snap => {
        const addr = decodeKey(snap.key);
        trackSyncAt(snap.val());
        mergeOneAddress(addr, snap.val());
        if (_initialLoadDone) {
            persistAndPaint(addr);
        } else {
            // 초기 수신 중 — 묶음으로 그린다(저장은 수신 완료 후 1회)
            _syncSeen++;
            schedulePaint(addr);
            // 느린 기기에선 전달이 여러 번에 나뉘어 온다(실측: CPU 20배 조이면 43번 끊김).
            //   그때는 건수까지 보여준다. 한 덩어리로 오면 이 갱신은 화면에 안 남는다.
            if (_syncSeen % PAINT_BATCH_MAX === 0) {
                showSyncProgress('작업상태 받는 중 ' + _syncSeen.toLocaleString());
            }
        }
    });

    src.on('child_changed', snap => {
        const addr = decodeKey(snap.key);
        trackSyncAt(snap.val());
        mergeOneAddress(addr, snap.val());
        if (_initialLoadDone) {
            persistAndPaint(addr);
        } else {
            schedulePaint(addr);
        }
    });

    src.on('child_removed', snap => {
        const addr = decodeKey(snap.key);
        delete workStatus[addr];
        if (_initialLoadDone) {
            persistAll();
            if (typeof refreshAllMarkers === 'function') refreshAllMarkers();
        }
    });

    // 초기 전체 수신 완료 신호 — child_added와 다운로드를 공유하므로 별도 get() 없음.
    // payload(snapshot)는 버리고 "완료 신호"로만 사용.
    src.once('value', () => {
        _initialLoadDone = true;
        // ★applyLocalChecked() 호출 제거(2026-08-19) — 이 자리가 버그의 현장이었다.
        //   초기 수신이 끝나 mergeOneAddress 가 전 주소를 제대로 합쳐놓은 직후에
        //   로컬 스냅샷으로 checkedMeters 를 통째 덮어써 남의 체크를 되돌렸고,
        //   바로 아래 persistAll() 이 그 잘못된 값을 저장까지 했다.
        //   로컬 백업 주입은 initFirebase() 에서 로드 직후 1회만 한다(merge 이전).
        // 남은 배치를 먼저 비우고(중복 그리기 방지) 저장 -> 전체 갱신 순으로 마무리한다.
        _pendingPaint.clear();
        if (_paintTimer) { clearTimeout(_paintTimer); _paintTimer = null; }
        persistAll();
        if (typeof refreshAllMarkers === 'function') refreshAllMarkers();
        const n = Object.keys(workStatus).length;
        // 다음 델타 시작점을 남긴다. 로컬 데이터에서도 최댓값을 다시 구해 더 큰 쪽을 쓴다.
        _lastSyncAt = Math.max(_lastSyncAt, maxSyncAtOf(workStatus));
        rememberSyncAt(_lastSyncAt);
        if (_isDeltaMode) {
            console.log('[Delta] 델타 수신 완료 —', _syncSeen, '건 / 다음 시작점', _lastSyncAt);
            hideSyncProgress();
        } else if (_syncSeen > PAINT_BATCH_MAX) {
            showSyncProgress('작업상태 최신 ' + n.toLocaleString(), 1800);
        } else {
            hideSyncProgress();
        }
        // 삭제 감지 — 주 1회. 델타는 '지워진 것'을 알려주지 않는다.
        auditDeletions(false);
        console.log('[Firebase] 증분 리스너 초기 로드 완료, 주소수:', n, '/ 수신', _syncSeen);
    });
}

// ── 초기 로드 + 리스너 부착 ───────────────────────────────────
async function initFirebase() {
    console.log('[Firebase] initFirebase 시작');

    const firebaseOk = initFirebaseApp();

    // 1순위: 로컬 보관소(IndexedDB, 없으면 옛 localStorage 에서 이전)
    const local = await loadStatusStored();
    if (local && Object.keys(local).length > 0) {
        workStatus = local;
    } else {
        // 2순위: data/work-status.json
        try {
            const res = await fetch('./data/work-status.json');
            if (!res.ok) throw new Error('fetch 실패: ' + res.status);
            const data = await res.json();
            workStatus = data;
            persistStatus(0);
            console.log('[Local] data/work-status.json 로드 완료, 주소수:', Object.keys(workStatus).length);
        } catch (e) {
            console.warn('[Local] work-status.json 로드 실패:', e.message);
            workStatus = {};
        }
    }

    // ★로컬 체크 백업 주입은 여기서 1회 — 반드시 merge 이전이어야 한다.
    //   merge 이후에 하면(옛 applyLocalChecked 자리) 서버에서 받은 남의 체크를 되돌린다.
    //   여기서 넣어두면 뒤이은 mergeOneAddress 의 ts union 이 서버 것과 알아서 저울질한다.
    mergeLocalCheckBackup();

    if (firebaseOk) {
        // 미전송 이벤트 큐 먼저 전송
        await flushEventQueue();

        // 델타냐 전량이냐 결정 — 로컬이 비었거나 스키마가 바뀌었으면 전량으로 간다
        const mode = await decideSyncMode();
        _isDeltaMode = mode.delta;
        _lastSyncAt = mode.from;

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
                persistStatusFlush();   // 저장 디바운스도 함께 비운다(앱이 죽어도 남게)
            }
        });
        // 탭/앱 완전 종료 직전에도 미전송분 시도 (best-effort)
        window.addEventListener('pagehide', () => { flushEventQueueNow(); persistStatusFlush(); });
    }
}
