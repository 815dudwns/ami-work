// firebase.js — 상태 관리 (localStorage + Firebase Realtime Database 동기화)
// Firebase SDK: firebase-app-compat, firebase-database-compat (map.html에서 로드)

// 전역 상태 변수
let workStatus = {};

// Firebase DB 참조
let db = null;
let statusRef = null;

// ── 미전송 큐 ─────────────────────────────────────────────────
// 창을 닫아도 localStorage에 큐가 남아있어 다음 접속 시 재전송
const PENDING_KEY = 'ami_pending_sync';

function loadPendingQueue() {
    const saved = localStorage.getItem(PENDING_KEY);
    return saved ? JSON.parse(saved) : [];
}

function savePendingQueue(queue) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
}

// 현재 workStatus 스냅샷을 큐에 추가 (타임스탬프 기록)
function enqueueSyncSnapshot() {
    const queue = loadPendingQueue();
    queue.push({
        ts: Date.now(),
        data: JSON.parse(JSON.stringify(workStatus)),
    });
    // 큐는 최대 20개 유지 (오래된 것 제거)
    if (queue.length > 20) queue.splice(0, queue.length - 20);
    savePendingQueue(queue);
}

// 큐에 있는 미전송 스냅샷을 Firebase에 전송
async function flushPendingQueue() {
    if (!statusRef) return;
    const queue = loadPendingQueue();
    if (queue.length === 0) return;

    // 가장 최신 스냅샷만 전송하면 됨 (중간 상태는 불필요)
    const latest = queue.reduce((a, b) => (a.ts > b.ts ? a : b));
    try {
        await statusRef.set(latest.data);
        savePendingQueue([]); // 전송 성공 → 큐 비움
        console.log('[Queue] 미전송 큐 Firebase 전송 완료');
    } catch (e) {
        console.warn('[Queue] 미전송 큐 전송 실패, 다음 기회에 재시도:', e.message);
    }
}

// Firebase 초기화 및 DB 연결
function initFirebaseApp() {
    try {
        // 이미 초기화된 경우 기존 앱 재사용
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

// localStorage에서 상태 불러오기 (동기)
function loadStatusLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
}

// 상태 저장 — localStorage 즉시 저장 + Firebase 전송 (실패 시 큐에 보관)
function saveStatus(status) {
    // localStorage 즉시 저장 (창 닫혀도 보존)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
    console.log('[Local] saveStatus 완료, 주소수:', Object.keys(status).length);

    // Firebase 전송 시도
    if (statusRef) {
        statusRef.set(status)
            .then(() => {
                console.log('[Firebase] saveStatus 완료');
                savePendingQueue([]); // 성공하면 큐 비움
            })
            .catch(e => {
                console.warn('[Firebase] saveStatus 실패, 큐에 보관:', e.message);
                enqueueSyncSnapshot();
            });
    } else {
        // Firebase 미연결 상태면 큐에 보관
        enqueueSyncSnapshot();
    }
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

// Firebase 데이터와 로컬 데이터를 updatedAt 기준으로 병합 (더 최신 쪽 유지)
function mergeFirebaseData(firebaseData) {
    Object.keys(firebaseData).forEach(addr => {
        const fb = firebaseData[addr];
        const local = workStatus[addr];
        if (!local) {
            workStatus[addr] = fb;
            return;
        }
        const fbTime = fb.updatedAt ? new Date(fb.updatedAt).getTime() : 0;
        const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
        // Firebase가 더 최신일 때만 덮어씀. 로컬이 같거나 더 최신이면 유지.
        if (fbTime > localTime) {
            workStatus[addr] = fb;
        }
    });
    applyLocalChecked();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
}

// Firebase에서 workStatus 읽기 — updatedAt 병합으로 완료 상태 보호
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

// 상태 초기 로드 + 30초 간격 Firebase 동기화 시작
async function initFirebase() {
    console.log('[Firebase] initFirebase 시작');

    // Firebase 앱 초기화
    const firebaseOk = initFirebaseApp();

    // 1순위: localStorage 확인
    const local = loadStatusLocal();
    if (local && Object.keys(local).length > 0) {
        workStatus = local;
        console.log('[Local] localStorage에서 로드 완료, 주소수:', Object.keys(workStatus).length);
    } else {
        // 2순위: data/work-status.json 파일에서 로드
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

    // Firebase에서 최신 데이터 한 번 읽기 (로컬보다 Firebase 우선)
    if (firebaseOk) {
        // 미전송 큐 먼저 재전송 (이전 세션에서 못 보낸 것)
        await flushPendingQueue();

        await syncFromFirebase();
        applyLocalChecked();

        // 30초 간격으로 Firebase 동기화 + 큐 재시도
        setInterval(async () => {
            await flushPendingQueue();
            await syncFromFirebase();
            if (typeof refreshAllMarkers === 'function') {
                refreshAllMarkers();
            }
        }, 30000);

        // 창/탭이 다시 활성화될 때 즉시 동기화
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible') {
                console.log('[Sync] 창 활성화 — Firebase 동기화 시작');
                await flushPendingQueue();
                await syncFromFirebase();
                if (typeof refreshAllMarkers === 'function') {
                    refreshAllMarkers();
                }
            }
        });
    }
}
