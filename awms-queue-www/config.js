// 종로 Firebase (ami-jongno — 큐 읽기/쓰기)
const firebaseConfig = {
    apiKey: "AIzaSyAQae8iqfvkYgFxoSZNaLuCca3ldA4koUU",
    authDomain: "ami-jongno.firebaseapp.com",
    databaseURL: "https://ami-jongno-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ami-jongno",
    storageBucket: "ami-jongno.firebasestorage.app",
    messagingSenderId: "393038393348",
    appId: "1:393038393348:web:1e0bfa92164554c3d24551"
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
const POST_DELAY_MIN = 8000;   // 8초
const POST_DELAY_MAX = 18000;  // 18초

// ami-work DB — awmscomplete PUT 전용 (ami-jongno와 다른 DB!)
// ※ firebase SDK는 ami-jongno로 init됨. 이 URL은 raw fetch PUT 전용.
const AWMS_WORK_DB = 'https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app';
