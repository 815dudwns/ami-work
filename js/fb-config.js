// fb-config.js — Firebase 설정과 앱 한 번 초기화 (2026-11-20 보안 전환).
//
// ★auth.js 보다 먼저 싣는다. auth.js 가 로그인에 Firebase Authentication 을 쓰기 때문이다.
//   config.js 의 firebaseConfig 는 이 값을 그대로 가리킨다(사본 금지).
// 이 값들은 공개값이다(웹 앱 식별자). 데이터 보호는 rules(auth != null)와 데이터 암호화가 한다.

const AMI_FB_CONFIG = {
    apiKey: "AIzaSyAqVaYGYLjT4qa8nQToYlSqnqtlgoFauWU",
    authDomain: "ami-work-1c49a.firebaseapp.com",
    databaseURL: "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ami-work-1c49a",
    storageBucket: "ami-work-1c49a.firebasestorage.app",
    messagingSenderId: "734048538037",
    appId: "1:734048538037:web:5514cb0a78ea03a4571dfc"
};

// 로그인 아이디 -> 내부 이메일. 화면에서는 아이디만 받는다.
const AMI_AUTH_EMAIL_DOMAIN = 'ami-work.local';

// ── 맥 로컬 시험용 에뮬레이터 연결 ─────────────────────────────────
//   localhost 에서 ?emu=1 로 한 번 열면 그 탭(sessionStorage) 동안 에뮬레이터를 쓴다.
//   ★배포 주소(github.io)에서는 절대 켜지지 않는다 — hostname 으로 막는다.
const AMI_EMU = (function () {
    try {
        const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
        if (!local) return null;
        const q = new URLSearchParams(location.search).get('emu');
        if (q === '1') sessionStorage.setItem('ami_emu', '1');
        if (q === '0') sessionStorage.removeItem('ami_emu');
        if (sessionStorage.getItem('ami_emu') !== '1') return null;
        return { auth: 'http://127.0.0.1:9099', dbHost: '127.0.0.1', dbPort: 9000,
                 ns: 'ami-work-1c49a-default-rtdb' };
    } catch (e) { return null; }
})();

let _amiFbApp = null;
/** Firebase 앱을 한 번만 만든다. 에뮬레이터 모드면 auth·database 를 거기에 붙인다. */
function amiFbApp() {
    if (_amiFbApp) return _amiFbApp;
    if (typeof firebase === 'undefined') return null;
    _amiFbApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(AMI_FB_CONFIG);
    if (AMI_EMU) {
        try { if (firebase.auth) firebase.auth(_amiFbApp).useEmulator(AMI_EMU.auth, { disableWarnings: true }); } catch (e) {}
        try { if (firebase.database) firebase.database(_amiFbApp).useEmulator(AMI_EMU.dbHost, AMI_EMU.dbPort); } catch (e) {}
        console.warn('[emu] Firebase 에뮬레이터 연결');
    }
    return _amiFbApp;
}

/** RTDB REST 주소 — 에뮬레이터면 그쪽으로. 로그인 토큰은 호출하는 쪽이 auth= 로 붙인다. */
function amiRtdbRestBase() {
    if (AMI_EMU) return `http://${AMI_EMU.dbHost}:${AMI_EMU.dbPort}`;
    return AMI_FB_CONFIG.databaseURL;
}
function amiRtdbRestQuery() {
    return AMI_EMU ? `ns=${AMI_EMU.ns}` : '';
}
