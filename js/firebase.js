// firebase.js — 상태 관리 (localStorage + Firebase Realtime Database 동기화)
// Firebase SDK: firebase-app-compat, firebase-database-compat (map.html에서 로드)

// 전역 상태 변수
let workStatus = {};

// Firebase DB 참조
let db = null;
let statusRef = null;

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

// 상태 저장 — localStorage + Firebase 둘 다 저장
function saveStatus(status) {
    // localStorage 저장
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
    console.log('[Local] saveStatus 완료, 주소수:', Object.keys(status).length);

    // Firebase 저장
    if (statusRef) {
        statusRef.set(status)
            .then(() => console.log('[Firebase] saveStatus 완료'))
            .catch(e => console.warn('[Firebase] saveStatus 실패:', e.message));
    }
}

// Firebase에서 workStatus 한 번 읽기 (덮어쓰기)
async function syncFromFirebase() {
    if (!statusRef) return;
    try {
        const snapshot = await statusRef.get();
        if (snapshot.exists()) {
            const data = snapshot.val();
            workStatus = data;
            // Firebase 데이터를 localStorage에도 동기화
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            console.log('[Firebase] syncFromFirebase 완료, 주소수:', Object.keys(workStatus).length);

            // 디버그: 작업자 정보 필드 존재 여부 샘플 확인
            const sampleKey = Object.keys(workStatus).find(k => workStatus[k].state !== 'pending');
            if (sampleKey) {
                const sample = workStatus[sampleKey];
                console.log('[Firebase] 작업자 정보 샘플 (주소:', sampleKey, '):', {
                    state:         sample.state,
                    updatedByName: sample.updatedByName,
                    updatedAt:     sample.updatedAt,
                });
            }
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
        await syncFromFirebase();

        // 30초 간격으로 Firebase 동기화
        setInterval(async () => {
            await syncFromFirebase();
            // 마커 색상 전체 갱신 (map.js의 함수 사용)
            if (typeof refreshAllMarkers === 'function') {
                refreshAllMarkers();
            }
        }, 30000);
    }
}
