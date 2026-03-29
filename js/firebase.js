// firebase.js — 로컬 파일 기반 상태 관리 (Firebase 제거)
// 이전: Firebase Realtime Database 사용
// 현재: localStorage + data/work-status.json 로컬 파일 사용

// 전역 상태 변수
let workStatus = {};

// localStorage에서 상태 불러오기 (동기)
function loadStatusLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
}

// 상태 저장 — localStorage에만 저장
// (브라우저 환경에서 파일 직접 쓰기 불가 → localStorage 사용)
function saveStatus(status) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
    console.log('[Local] saveStatus 완료, 주소수:', Object.keys(status).length);
}

// 상태 초기 로드
// 1순위: localStorage → 2순위: data/work-status.json 로컬 파일
async function initFirebase() {
    console.log('[Local] initFirebase 시작 (로컬 파일 모드)');

    // 1순위: localStorage 확인
    const local = loadStatusLocal();
    if (local && Object.keys(local).length > 0) {
        workStatus = local;
        console.log('[Local] localStorage에서 로드 완료, 주소수:', Object.keys(workStatus).length);
        return;
    }

    // 2순위: data/work-status.json 파일에서 로드
    try {
        const res = await fetch('./data/work-status.json');
        if (!res.ok) throw new Error('fetch 실패: ' + res.status);
        const data = await res.json();
        workStatus = data;
        // 로드한 데이터를 localStorage에 캐싱
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        console.log('[Local] data/work-status.json 로드 완료, 주소수:', Object.keys(workStatus).length);
    } catch (e) {
        console.warn('[Local] work-status.json 로드 실패:', e.message);
        workStatus = {};
    }
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
            markers.forEach(m => updateMarkerColor(m.address));
            alert('복원 완료!');
        } catch {
            alert('올바른 백업 파일이 아닙니다.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
