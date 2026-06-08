// AMI Queue — 설정 (ami-work Firebase)
// datapush_queue(수집물) 읽기/상태쓰기 = ami-work DB
const firebaseConfig = {
    apiKey: "AIzaSyAqVaYGYLjT4qa8nQToYlSqnqtlgoFauWU",
    authDomain: "ami-work-1c49a.firebaseapp.com",
    databaseURL: "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ami-work-1c49a",
    storageBucket: "ami-work-1c49a.firebasestorage.app",
    messagingSenderId: "734048538037",
    appId: "1:734048538037:web:5514cb0a78ea03a4571dfc"
};

// awms 베이스
const AWMS_BASE = 'https://awms.kdn.com';

// 작업자 awms 기본값
const DEFAULT_AWMS = {
    HDQR_CD: '3970',
    OFFICE_CD: '7793',
    REG_ID: 'mdp2504381',
};

// 봇 감지 회피용 — 등록 사이 대기 시간 (ms)
const POST_DELAY_MIN = 8000;
const POST_DELAY_MAX = 18000;

// 지사 → DEPT2 (datapush-design §지사). saveAct DEPT2 채울 때 사용.
const JISA_DEPT2 = {
    '동대문중랑지사': '3000',
    '광진성동지사': '3100',
    '노원도봉지사': '3400',
    '서대문은평지사': '3500',
    '마포용산지사': '3600',
    '강북성북지사': '4080',
    '서울본부직할': '7793',
};
