// firebase.js — Firebase 초기화 및 상태 관리

// Firebase 앱 초기화 (config.js의 firebaseConfig 사용)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const statusRef = db.ref('workStatus/charger4eleccar');

// 연결 상태 표시 리스너
db.ref('.info/connected').on('value', snap => {
    const connected = snap.val();
    console.log('[Firebase] 연결 상태:', connected ? '연결됨' : '오프라인');
    const dot = document.getElementById('conn-dot');
    if (dot) dot.style.background = connected ? '#10b981' : '#f59e0b';
});

// 전역 상태 변수
let workStatus = {};

// localStorage에서 상태 불러오기
function loadStatusLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
}

// Firebase에 상태 저장 (debounce 300ms — 연속 입력 방지)
let _fbSaveTimer = null;
function saveStatus(status) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
    clearTimeout(_fbSaveTimer);
    _fbSaveTimer = setTimeout(() => {
        console.log('[Firebase] saveStatus → set() 호출, 주소수:', Object.keys(status).length);
        statusRef.set(status)
            .then(() => console.log('[Firebase] set() 성공'))
            .catch(e => console.error('[Firebase] set() 실패:', e.code, e.message));
    }, 300);
}

// Firebase 초기 로드 + 실시간 리스너 설정
function initFirebase() {
    console.log('[Firebase] initFirebase 시작');
    return new Promise(resolve => {
        let initialLoad = true;

        statusRef.on('value', snapshot => {
            const fbData = snapshot.val() || {};
            console.log('[Firebase] onValue 콜백 — initialLoad:', initialLoad, '/ 키수:', Object.keys(fbData).length);

            if (initialLoad) {
                initialLoad = false;
                if (Object.keys(fbData).length === 0) {
                    // Firebase 비어있음 → localStorage 마이그레이션
                    const local = loadStatusLocal();
                    if (Object.keys(local).length > 0) {
                        workStatus = local;
                        console.log('[Firebase] 마이그레이션 시작, 주소수:', Object.keys(local).length);
                        statusRef.set(local)
                            .then(() => console.log('[Firebase] 마이그레이션 완료'))
                            .catch(e => console.error('[Firebase] 마이그레이션 실패:', e.code, e.message));
                    } else {
                        console.log('[Firebase] Firebase + localStorage 모두 비어있음');
                    }
                } else {
                    console.log('[Firebase] Firebase 데이터 로드 완료');
                    workStatus = fbData;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(fbData));
                }
                resolve();
            } else {
                // 다른 기기/사용자의 변경 → 실시간 반영
                console.log('[Firebase] 실시간 업데이트 수신 → 마커 갱신');
                workStatus = fbData;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(fbData));
                markers.forEach(m => updateMarkerColor(m.address));
            }
        }, error => {
            // 권한 오류 또는 네트워크 오류
            console.error('[Firebase] onValue 오류 — code:', error.code, '/ message:', error.message);
            console.warn('[Firebase] Firebase Rules에서 read 권한을 확인하세요.');
            workStatus = loadStatusLocal();
            resolve();
        });
    });
}

// JSON 파일로 현재 상태 백업 다운로드
function backupData() {
    const data = JSON.stringify(workStatus, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ami_backup_${date}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// 구형 계기번호 형식 정규화 ("68190227199.0" → "68190227199")
function migrateMeterNo(no) {
    const s = String(no).trim();
    const n = parseFloat(s);
    if (!isNaN(n)) return String(Math.round(n)).padStart(11, '0');
    return s.padStart(11, '0');
}

// 백업 파일 내 구형 계기번호 일괄 변환
function migrateBackup(data) {
    const migrated = {};
    for (const [addr, status] of Object.entries(data)) {
        migrated[addr] = {
            ...status,
            checkedMeters: (status.checkedMeters || []).map(migrateMeterNo)
        };
    }
    return migrated;
}

// JSON 파일에서 상태 복원
function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            const migrated = migrateBackup(parsed);
            workStatus = migrated;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
            statusRef.set(migrated).catch(() => {});
            markers.forEach(m => updateMarkerColor(m.address));
            alert('복원 완료!');
        } catch {
            alert('올바른 백업 파일이 아닙니다.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
