// auth.js — 인증 관련 로직 (하드코딩 계정)

// 계정 목록 — 기존 user 번호 유지 + 신규 조장 2명 추가
const ACCOUNTS = [
    { id: 'admin',  pw: '1201', name: '우영준', role: 'admin' },
    { id: 'user01', pw: '1111', name: '김민성', role: 'user' },  // 도봉 부조장
    { id: 'user02', pw: '1111', name: '이영길', role: 'user' },  // 도봉 조장
    { id: 'user03', pw: '1111', name: '김상권', role: 'user' },  // 광진 부조장
    { id: 'user04', pw: '1111', name: '김지호', role: 'user' },  // 동대문 부조장
    { id: 'user05', pw: '1111', name: '장성훈', role: 'user' },  // 동대문 조장
    { id: 'user06', pw: '1111', name: '조은규', role: 'user' },  // 중구 조장
    { id: 'user07', pw: '1111', name: '장진교', role: 'user' },  // 종로 조장
    { id: 'user08', pw: '1111', name: '이규재', role: 'user' },  // 은평 조장
    { id: 'user09', pw: '1111', name: '윤용운', role: 'user' },  // 광진 조장
    { id: 'user10', pw: '1111', name: '이종우', role: 'user' },  // 마포 조장
    { id: 'user11', pw: '1111', name: '최창호', role: 'user' },  // 중랑 조장
    { id: 'user12', pw: '1111', name: '우희근', role: 'user' },  // 강북 조장
    { id: 'user13', pw: '1111', name: '양선왕', role: 'user' },  // 성북 조장 (신규)
    { id: 'user14', pw: '1111', name: '이용택', role: 'user' },  // 노원 조장 (신규)
];

const AUTH_KEY = 'ami_auth';
// 강제 재로그인 버전 — 이 값을 바꾸면 모든 사용자가 자동 로그아웃됨
const AUTH_VERSION = '20260529h';
const AUTH_VERSION_KEY = 'ami_auth_version';

/**
 * 로그인 시도
 * @param {string} id
 * @param {string} pw
 * @returns {{ ok: boolean, error?: string }}
 */
function authLogin(id, pw) {
    const account = ACCOUNTS.find(a => a.id === id && a.pw === pw);
    if (!account) {
        return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    }
    const session = { id: account.id, name: account.name, role: account.role };
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    localStorage.setItem(AUTH_VERSION_KEY, AUTH_VERSION);
    return { ok: true };
}

/**
 * 현재 로그인 세션 반환. 없으면 null
 * @returns {{ id: string, name: string, role: string } | null}
 */
function authGetSession() {
    try {
        const raw = localStorage.getItem(AUTH_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * 로그아웃
 */
function authLogout() {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = 'login.html';
}

/**
 * 로그인 여부 확인 — 미인증이면 login.html로 리다이렉트
 * AUTH_VERSION 다르면 새 배포로 간주 — localStorage 비우고 강제 재로그인
 */
function authRequire() {
    const localVer = localStorage.getItem(AUTH_VERSION_KEY);
    if (localVer !== AUTH_VERSION) {
        // 새 버전 배포 — 캐시·세션 다 비우고 로그인 페이지로
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem(AUTH_VERSION_KEY, AUTH_VERSION);
        window.location.replace('login.html');
        return;
    }
    if (!authGetSession()) {
        window.location.href = 'login.html';
    }
}
