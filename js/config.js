// config.js — Firebase 설정값 및 상수

const firebaseConfig = {
    apiKey: "AIzaSyAqVaYGYLjT4qa8nQToYlSqnqtlgoFauWU",
    authDomain: "ami-work-1c49a.firebaseapp.com",
    databaseURL: "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ami-work-1c49a",
    storageBucket: "ami-work-1c49a.firebasestorage.app",
    messagingSenderId: "734048538037",
    appId: "1:734048538037:web:5514cb0a78ea03a4571dfc"
};

// ── 소속별 작업기록 경로 (2026-10-31, 소속 설계 0단계) ──────────────────────
//   광명(전용 그룹 kmtest)은 기록을 workStatus/gwangmyeong 에 따로 쓴다 — 강북 기록(charger4eleccar)과
//   읽기·쓰기 모두 섞이지 않는다. 그룹 -> 경로 표에 한 줄 넣으면 다음 소속도 같은 방식으로 갈린다.
//   ★보관소 키(localStorage·IndexedDB)도 그룹 접미('__kmtest')로 갈라, 한 폰을 같이 써도 기록이 섞이지 않는다.
//   ★auth.js 가 이 파일보다 먼저 실려야 한다(map.html·stats.html 순서). 없으면 강북 기본값.
const WS_DATASET_BY_GROUP = { kmtest: 'gwangmyeong' };
const _WS_GROUP = (typeof authExclusiveGroup === 'function' && authExclusiveGroup()) || '';
const WS_DATASET = WS_DATASET_BY_GROUP[_WS_GROUP] || 'charger4eleccar';
const WS_KEY_SUFFIX = _WS_GROUP ? '__' + _WS_GROUP : '';
// 계기·주소 추가는 소속 경로를 따로 쓰는 계정(광명 kmtest)만 한다.
//   강북 계정(관리자·윤용운·작업자)은 추가 길이 전부 없다(영준님 2026-10-31 "계기추가 관한 사항 모든상황 강북에는 없애").
//   이미 들어간 추가 계기·추가 개소는 지우지 않고 보기만 한다(삭제 버튼도 없음).
//   ★화면 숨김만이 아니라 add-site.js·detail.js·firebase.js 의 추가·삭제 함수가 이 값으로 먼저 거절한다.
const ORG_CAN_ADD = !!_WS_GROUP;
const ORG_ADD_METER_ANY = ORG_CAN_ADD;

const STORAGE_KEY = 'ami_work_status' + WS_KEY_SUFFIX;
const CHECKED_KEY = 'ami_checked_meters' + WS_KEY_SUFFIX;
const PENDING_KEY = 'ami_pending_sync';   // 하위호환용, 미사용
const EVENTS_KEY  = 'ami_event_queue' + WS_KEY_SUFFIX;
