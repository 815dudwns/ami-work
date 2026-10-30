// view-only.js — 전용 그룹 계정(다른 회사 · 광명 kmtest)은 **보기 전용** (2026-10-30 영준님).
//
// "일단은 지도에 찍히고 보여줄 테스트만" — 그 회사 폰에 우리 데이터가 하나도 가면 안 된다.
//   그래서 이 계정은 Firebase 를 아예 안 연다(앱 생성·리스너·델타·큐 전송 전부 0).
//   지도는 정적 파일(data/gwangmyeong-data.json)만으로 돈다. 상태 저장·체크·불가도 막는다.
// 방식은 local-ws-override.js(로컬 workStatus 모드)와 같다 — firebase.js 의 함수를 이 자리에서 갈아 끼운다.
//   ★map.js 보다 먼저 실려야 한다(map.html 스크립트 순서).
// ★판정은 auth.js authExclusiveGroup() 하나. 세션을 못 읽으면 null -> 일반 계정 동작(authRequire 가 로그인으로 보낸다).
//   일반 계정에는 아무 영향이 없다(첫 줄에서 빠진다).
// 완전 분리(앱·데이터·Firebase 따로)는 별도 공사다.
(function () {
    const ex = (typeof authExclusiveGroup === 'function') ? authExclusiveGroup() : null;
    if (!ex) return;
    window.AMI_VIEW_ONLY = ex;
    console.warn('[view-only] 보기 전용 계정 — Firebase 연결·저장을 전부 차단합니다:', ex);

    // Firebase: 앱을 만들지 않는다 -> 읽기·쓰기·리스너 불가
    initFirebaseApp = function () { return false; };
    initFirebase = async function () { workStatus = {}; };
    syncFromFirebase = async function () {};
    // 저장 경로: 이벤트 큐·상태·체크·불가·계기추가 — 전부 아무것도 안 한다
    addEvent = function () {};
    flushEventQueue = async function () {};
    flushEventQueueDebounced = function () {};
    flushEventQueueNow = function () {};
    saveStateEvent = function () {};
    saveCheckEvent = function () {};
    saveReasonEvent = function () {};
    saveMeterFailEvent = function () {};
    saveAddedMeter = async function () {};
    removeAddedMeter = async function () {};
    // 작업상태 보관소(IndexedDB·localStorage): 읽지도 쓰지도 않는다.
    //   ★한 폰을 우리 계정과 같이 쓰면 거기 우리 기록 미러가 있다 — 이 계정 화면에 끌어오지 않는다.
    loadStatusStored = async function () { return {}; };
    loadStatusLocal = function () { return {}; };
    persistStatus = function () {};
    persistStatusNow = async function () {};
    persistStatusFlush = function () {};
    saveStatus = function () {};
    saveCheckedLocal = function () {};

    // 화면: 완료·보류·불가·사유·계기 체크·개별 불가·계기 추가·큐 보내기를 숨기고 '보기 전용' 표시
    const css = document.createElement('style');
    css.textContent = '#btn-complete,#btn-hold,#btn-fail,.fail-reason-row,#add-meter-btn,#awms-collect-btn,'
        + '#admin-upload-btn,.meter-checkbox,.meter-fail-btn,.meter-fail-input-wrap{display:none!important}'
        + '.view-only-label{font-size:13px;color:#6b7280;font-weight:600;padding:8px 4px}';
    document.head.appendChild(css);
    document.addEventListener('DOMContentLoaded', function () {
        const row = document.querySelector('.action-btn-row');
        if (row && !row.querySelector('.view-only-label')) {
            const s = document.createElement('span');
            s.className = 'view-only-label';
            s.textContent = '보기 전용';
            row.prepend(s);
        }
    });
})();
