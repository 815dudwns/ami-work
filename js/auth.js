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
    { id: 'user09', pw: '1890', name: '윤용운', role: 'user' },  // 광진 조장 (작업자 총괄)
    { id: 'user10', pw: '1111', name: '이종우', role: 'user' },  // 마포 조장
    { id: 'user11', pw: '1111', name: '최창호', role: 'user' },  // 중랑 조장
    { id: 'user12', pw: '1111', name: '우희근', role: 'user' },  // 강북 조장
    { id: 'user13', pw: '1111', name: '양선왕', role: 'user' },  // 성북 조장 (신규)
    { id: 'user14', pw: '1111', name: '이용택', role: 'user' },  // 노원 조장 (신규)
    { id: 'user15', pw: '1111', name: '정수화', role: 'user' },  // 강북 부조장 (우희근 짝)
    { id: 'user16', pw: '1111', name: '안지홍', role: 'user' },  // 성북 부조장 (양선왕 짝)
    { id: 'user17', pw: '1111', name: '박성준', role: 'user' },  // 중랑 부조장 (최창호 짝)
    { id: 'user18', pw: '1111', name: '정재윤', role: 'user' },  // 마포 부조장 (이종우 짝)
    { id: 'user19', pw: '1111', name: '마삼환', role: 'user' },  // 중구 부조장 (조은규 짝)
    { id: 'user20', pw: '1111', name: '김영진', role: 'user' },  // 은평 부조장 (이규재 짝)
    { id: 'user21', pw: '1111', name: '이기순', role: 'user' },  // 노원 부조장 (이용택 짝)
    { id: 'user22', pw: '1111', name: '김윤준', role: 'user' },
    { id: 'user23', pw: '1111', name: '이현규', role: 'user' },
    { id: 'user24', pw: '1111', name: '김춘동', role: 'user' },
    // 종로 부조장 = 우영준(영준님 본인) = admin 계정으로 겸임 (별도 user 발급 안 함)
    // --- validator 계정 (데이터검증 사장님·직원용) ---
    // ★ 영준님이 실제 계정으로 교체할 것 (id/pw/name 모두)
    { id: 'validator01', pw: '9999', name: '검증담당자', role: 'validator' },
];

const AUTH_KEY = 'ami_auth';
// 강제 로그아웃 버전 — ★긴급(보안/중대버그)시에만 값을 올린다. 평소 배포에는 절대 건드리지 않는다.
// 값을 올리면, 이전 값을 저장해둔 사용자만 1회 로그아웃된다.
// 저장값이 없으면(신규 설치 / WebView 저장소 휘발) 로그아웃하지 않는다 — 불필요한 재로그인 방지.
const FORCE_LOGOUT_VERSION = '20260616a';
const FORCE_LOGOUT_VERSION_KEY = 'ami_force_logout_version';

// 강력 업데이트(강제 로그아웃)시에만 함께 리셋할 화면상태 키 — 지사/필터/지도위치.
// 평소 로그아웃·재시작에는 보존되고, FORCE_LOGOUT_VERSION을 올릴 때만 초기화된다.
// ★작업 데이터(ami_work_status·ami_checked_meters·ami_event_queue)는 여기 넣지 말 것(유실 방지).
const UI_STATE_KEYS = ['ami_map_view', 'ami_selected_jisa', 'ami_selected_gu', 'ami_selected_categories', 'ami_seen_categories'];

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
    localStorage.setItem(FORCE_LOGOUT_VERSION_KEY, FORCE_LOGOUT_VERSION);
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
 *
 * 강제 로그아웃은 FORCE_LOGOUT_VERSION이 바뀌고 + 사용자가 이전 값을 저장해뒀을 때만 1회 발생.
 * 저장값이 없으면(신규 / WebView 저장소 휘발) 로그아웃하지 않는다 — "배포 안 했는데 자꾸 초기화" 방지.
 * 평소 배포는 이 버전을 건드리지 않으므로 세션·캐시·이벤트큐가 모두 보존된다.
 */
function authRequire() {
    const localVer = localStorage.getItem(FORCE_LOGOUT_VERSION_KEY);
    if (localVer && localVer !== FORCE_LOGOUT_VERSION) {
        // 긴급 강제 로그아웃 — 세션 + 화면상태(지사/필터/지도위치) 리셋.
        // 단 작업 데이터·이벤트큐(EVENTS_KEY)는 보존(미전송 작업 유실 방지, 다음 로그인 후 flush)
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(FORCE_LOGOUT_VERSION_KEY);
        UI_STATE_KEYS.forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
        window.location.replace('login.html');
        return;
    }
    if (!authGetSession()) {
        window.location.href = 'login.html';
        return;
    }
    // 기존 로그인 사용자(옛 버전키만 가진 사람) 백필 — 버전키 없으면 현재값 기록.
    // 안 하면 향후 긴급 FORCE_LOGOUT_VERSION 변경이 이 사용자에게 안 먹는다.
    if (!localVer) {
        localStorage.setItem(FORCE_LOGOUT_VERSION_KEY, FORCE_LOGOUT_VERSION);
    }
}
