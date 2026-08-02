// local-ws-override.js — 로컬 육안 확인 전용. workStatus 를 로컬 JSON 파일로 대체한다.
//
// 용도: 키 분리 마이그레이션 결과본을 실제 지도 위에서 눈으로 확인하기 위한 임시 배선.
//   예) http://localhost:8087/map.html?localws=./data/ws-migrated-20260802.json
//
// ★안전장치: localws 쿼리가 있을 때만 동작하고, 그때는 Firebase 를 아예 초기화하지 않는다.
//   앱 초기화가 없으면 리스너·전송·삭제 어느 경로도 탈 수 없다. 이벤트 큐 함수도 무력화해
//   화면에서 완료/체크를 눌러도 로컬 메모리에만 반영되고 라이브로 나가지 않는다.
//   localStorage 에도 쓰지 않는다 — 평소 쓰던 지도의 캐시를 오염시키지 않기 위해서다.
//
// 이 파일은 프로덕션 동작에 영향이 없다(쿼리 없으면 즉시 반환). 확인이 끝나면 지워도 된다.

(function () {
    const file = new URLSearchParams(location.search).get('localws');
    if (!file) return;

    console.warn('[localws] 로컬 workStatus 모드 — Firebase 연결·전송을 전부 차단합니다:', file);

    // Firebase 앱 자체를 만들지 않는다 -> 읽기·쓰기·리스너 전부 불가
    initFirebaseApp = function () {
        console.warn('[localws] Firebase 초기화 차단됨');
        return false;
    };
    // 이벤트 큐 무력화 — 화면 조작이 라이브로 새어나가지 않게
    addEvent = function () {};
    flushEventQueue = async function () {};
    flushEventQueueDebounced = function () {};

    // localStorage 오염 방지 — 이 모드에서는 상태를 저장하지 않는다
    const _setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
        if (k === STORAGE_KEY) return;   // 작업상태만 차단, 지도 위치 등은 그대로
        return _setItem(k, v);
    };

    // workStatus 를 로컬 파일로 채운다. initMap 이 loadMarkers 뒤에 이걸 부르고,
    // 그 다음 전체 재도색이 돌기 때문에 화면에 그대로 반영된다.
    initFirebase = async function () {
        const res = await fetch(file, { cache: 'no-cache' });
        if (!res.ok) throw new Error('localws 파일 로드 실패: ' + res.status);
        workStatus = await res.json();
        console.warn('[localws] 적용 완료 — 주소키', Object.keys(workStatus).length, '개');

        // 갈린 주소가 실제로 마커별 키를 갖는지 콘솔에 요약
        if (typeof statusKeyIndex !== 'undefined' && statusKeyIndex) {
            const split = statusKeyIndex.splitAddresses;
            const leftover = split.filter(a => a in workStatus);
            console.warn('[localws] 갈린 주소', split.length, '건 / 옛 주소 키가 남은 것', leftover.length, '건');
        }
    };
})();
