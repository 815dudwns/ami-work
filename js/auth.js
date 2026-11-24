// auth.js — 로그인 (2026-11-20 보안 전환: Firebase Authentication 이메일/비밀번호)
//
// ★비밀번호 목록이 더 이상 이 파일에 없다. 예전엔 평문 계정표(ACCOUNTS)를 공개 레포에 두고
//   브라우저에서 비교했다 — 누구나 파일을 열면 모든 비밀번호가 보였다.
//   지금은 아이디 -> '<아이디>@ami-work.local' 로 바꿔 Firebase 에 로그인하고,
//   이름은 계정 displayName, 역할(admin/user)은 계정 custom claim 'role' 에서 읽는다.
//   계정 만들기·바꾸기 = scripts/create_map_accounts.py(원본 ~/.ami-secrets, 레포 밖).
// ★화면 코드는 여전히 authGetSession() 을 동기로 부른다 — 로그인에 성공하면 {id,name,role} 을
//   예전과 같은 자리(localStorage 'ami_auth')에 적어 둔다. 진짜 확인은 Firebase 로그인 상태다
//   (authRequire 가 확인해, 로그인이 없으면 세션을 지우고 로그인 화면으로 보낸다).
// ★데이터(RTDB·암호화 데이터 키)는 Firebase 로그인 토큰이 있어야 읽힌다 — 세션 값을 손으로
//   적어 넣어도 데이터는 안 열린다.

const AUTH_KEY = 'ami_auth';
// 강제 로그아웃 버전 — ★긴급(보안/중대버그)시에만 값을 올린다. 평소 배포에는 절대 건드리지 않는다.
// 값을 올리면, 이전 값을 저장해둔 사용자만 1회 로그아웃된다.
// 저장값이 없으면(신규 설치 / WebView 저장소 휘발) 로그아웃하지 않는다 — 불필요한 재로그인 방지.
const FORCE_LOGOUT_VERSION = '20261019a';   // 2026-10-19 야간 일괄 수정 — 새 버전을 확실히 받게(영준님 지시)
const FORCE_LOGOUT_VERSION_KEY = 'ami_force_logout_version';

// 강력 업데이트(강제 로그아웃)시에만 함께 리셋할 화면상태 키 — 지사/필터/지도위치.
// 평소 로그아웃·재시작에는 보존되고, FORCE_LOGOUT_VERSION을 올릴 때만 초기화된다.
// ★작업 데이터(ami_work_status·ami_checked_meters·ami_event_queue)는 여기 넣지 말 것(유실 방지).
// ★지사·구 선택(ami_selected_jisa·ami_selected_gu)은 2026-10-20 에 뺐다 — 강제 로그아웃 때마다 지사가
//   날아가 전원이 첫 지사(강북성북)로 떨어졌다(영준님 '자꾸 강북성북이 나온다'). 작업자가 고른 지사는 남긴다.
// ★리스트 선택(ami_selected_categories·ami_seen_categories)도 2026-10-20 에 뺐다 — 지우면 첫 진입에 리스트가
//   전부 켜져 25미청구(14.5MB)·불가(6.7MB)까지 받고 마커가 폭증해 느려졌다(영준님 '속도가 왜 이리 느려졌냐').
const UI_STATE_KEYS = ['ami_map_view'];

function _authFb() {
    try {
        if (typeof amiFbApp !== 'function' || !amiFbApp() || !firebase.auth) return null;
        return firebase.auth(amiFbApp());
    } catch (e) { return null; }
}

function _authErrorText(e) {
    const c = (e && e.code) || '';
    if (/network-request-failed/.test(c)) return '인터넷 연결을 확인해 주세요.';
    if (/too-many-requests/.test(c)) return '시도가 많아 잠시 막혔습니다. 잠시 뒤 다시 해 주세요.';
    if (/user-disabled/.test(c)) return '사용이 중지된 계정입니다.';
    return '아이디 또는 비밀번호가 올바르지 않습니다.';
}

/**
 * 로그인 시도 — Firebase Authentication. ★비동기(Promise)다.
 * @param {string} id
 * @param {string} pw
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function authLogin(id, pw) {
    const fa = _authFb();
    if (!fa) return { ok: false, error: '로그인 모듈을 불러오지 못했습니다. 새로고침해 주세요.' };
    id = String(id || '').trim().toLowerCase();
    if (!id || !pw) return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    // ★2026-11-21 로그인 아이디 = awms 아이디(6자리, 관리자는 admin). 2026-11-24 주덕기 과장은 kdn01 그대로 로그인.
    //   규칙: 어떤 아이디든 먼저 '<아이디>@ami-work.local' 로 로그인해 본다. 옛 userNN·kdnNN 꼴인데 **계정·비밀번호가
    //   안 맞을 때만** '아이디가 바뀌었다' 안내를 붙인다 — 그 꼴로 계정을 다시 만들면(kdn01) 코드 수정 없이 들어온다.
    //   (인터넷·시도 과다 같은 다른 실패는 원래 문구 그대로)
    const oldStyle = /^(user|kdn)\d+$/.test(id);
    try {
        await fa.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const cred = await fa.signInWithEmailAndPassword(id + '@' + AMI_AUTH_EMAIL_DOMAIN, pw);
        const session = await _authSessionFromUser(cred.user);
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
        localStorage.setItem(FORCE_LOGOUT_VERSION_KEY, FORCE_LOGOUT_VERSION);
        return { ok: true };
    } catch (e) {
        console.warn('[auth] 로그인 실패', e && e.code);
        const c = (e && e.code) || '';
        if (oldStyle && /invalid-credential|invalid-login-credentials|user-not-found|wrong-password|invalid-email/.test(c)) {
            // 없는 계정과 틀린 비밀번호를 Firebase 가 같은 오류로 준다 — kdn01 이 비밀번호를 틀린 경우도 있어 둘 다 알린다
            return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다. 로그인 아이디가 바뀌었습니다 — awms 아이디(숫자 6자리)로 로그인해 주세요.' };
        }
        return { ok: false, error: _authErrorText(e) };
    }
}

/** Firebase 사용자 -> 화면 세션 {id,name,role}.
 *  ★세션 id 는 로그인 아이디(awms 아이디)가 아니라 **기록용 아이디 userNN** 이다(2026-11-21) — claim 'mapId',
 *    없으면 계정 uid(= userNN). updatedBy·AUTH_GROUPS·통계 작업자별 기록이 예전 그대로 이어진다. */
async function _authSessionFromUser(user) {
    let role = 'user', mapId = '';
    try {
        const t = await user.getIdTokenResult();
        if (t && t.claims && t.claims.role) role = String(t.claims.role);
        if (t && t.claims && t.claims.mapId) mapId = String(t.claims.mapId);
    } catch (e) { /* 역할을 못 읽으면 일반 사용자 */ }
    const id = mapId || user.uid || String(user.email || '').split('@')[0];
    return { id, name: user.displayName || id, role };
}

let _authReadyP = null;
/** Firebase 로그인 상태가 정해질 때까지 기다린다. 로그인돼 있으면 user, 아니면 null.
 *  ★RTDB 를 붙이기 전에 반드시 이것을 기다린다 — 토큰 없이 먼저 붙으면 rules 가 거절하고
 *    리스너가 취소된다(permission_denied). 오프라인이어도 저장된 로그인으로 바로 정해진다. */
function authReady() {
    if (_authReadyP) return _authReadyP;
    const fa = _authFb();
    if (!fa) return (_authReadyP = Promise.resolve(null));
    _authReadyP = new Promise(resolve => {
        const off = fa.onAuthStateChanged(u => { off(); resolve(u || null); });
    });
    return _authReadyP;
}

/** REST 호출용 로그인 토큰(만료 전 자동 갱신). 로그인 안 돼 있으면 null. */
async function authIdToken() {
    await authReady();
    // ★currentUser 를 본다 — authReady 가 처음 정해 둔 user 는 로그아웃 뒤에도 남아 있어 토큰을 계속 낸다.
    const fa = _authFb();
    const u = fa && fa.currentUser;
    if (!u) return null;
    try { return await u.getIdToken(); } catch (e) { return null; }
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

/** 계정 제한 기능의 **계정 목록 단일 출처** (2026-09-15 신설).
 *
 * ★왜: '관리자 + 윤용운(user09)' 조합이 map.html·stats.html 두 파일 세 곳에 각각 적혀 있었다.
 *   흩어져 있으면 다음에 계정을 하나 더 열어 줄 때 한 군데를 빠뜨려 어긋난다.
 *   계정을 더 열 때는 **이 표만** 고친다.
 *   staff = 통계 페이지 + 관리용 확인 리스트를 볼 수 있는 계정(관리자 + 작업자 총괄).
 */
const AUTH_GROUPS = {
    staff: ['admin', 'user09'],   // 우영준(관리자) · 윤용운(작업자 총괄)
    // ★'admin' 을 넣지 않는다 — 관리자에게도 광명이 보이면 안 된다(영준님 2026-10-30).
    kmtest: ['kmtest'],           // 광명 샘플(다른 회사)
    // 우영준(관리자) 혼자만 — LP 무기록(확인용) 리스트(영준님 2026-10-30 "무기록 리스트를 나만 보이게끔").
    //   ★staff 와 달리 user09 를 넣지 않는다. 'admin' 은 role 이 admin 인 계정을 뜻한다(authAllowsGroup).
    owner: ['admin'],
};

/** 전용(배타) 그룹 — 여기 든 그룹의 계정은 **그 그룹 리스트만** 본다(js/datasets.js datasetVisibleToUser).
 *   다른 회사 계정이 우리 리스트를 보지 않게 하는 장치다. 일반 allowGroup 은 '추가로 보인다' 이고
 *   이것은 '그것만 보인다' 다.
 */
const AUTH_EXCLUSIVE = ['kmtest'];

/** 이 세션이 속한 전용 그룹 이름, 없으면 null. */
function authExclusiveGroup() {
    const s = authGetSession();
    if (!s) return null;
    for (const g of AUTH_EXCLUSIVE) {
        if (((AUTH_GROUPS && AUTH_GROUPS[g]) || []).includes(s.id)) return g;
    }
    return null;
}

/** 이 세션이 그 그룹에 드는가 — **단일 판정 지점**.
 *
 * 목록에 'admin' 이 있으면 **role 이 admin 인 계정**도 통과시킨다. 기존 세 곳이
 *   `session.role === 'admin' || session.id === 'user09'` 였으므로 동작이 그대로 유지된다.
 * @param {string} group AUTH_GROUPS 의 키(예: 'staff')
 */
function authAllowsGroup(group) {
    const ids = (AUTH_GROUPS && AUTH_GROUPS[group]) || [];
    const s = authGetSession();
    if (!s) return false;
    return ids.includes(s.id) || (ids.includes('admin') && s.role === 'admin');
}

/**
 * 로그아웃
 */
function authLogout() {
    localStorage.removeItem(AUTH_KEY);
    const fa = _authFb();
    const go = () => { window.location.href = 'login.html'; };
    if (fa) fa.signOut().then(go, go); else go();
}

/**
 * 로그인 여부 확인 — 미인증이면 login.html로 리다이렉트
 *
 * 강제 로그아웃은 FORCE_LOGOUT_VERSION이 바뀌고 + 사용자가 이전 값을 저장해뒀을 때만 1회 발생.
 * 저장값이 없으면(신규 / WebView 저장소 휘발) 로그아웃하지 않는다 — "배포 안 했는데 자꾸 초기화" 방지.
 * 평소 배포는 이 버전을 건드리지 않으므로 세션·캐시·이벤트큐가 모두 보존된다.
 */
// 강제 로그아웃 실행 — 세션 + 화면상태(지사/필터/지도위치)만 지운다.
//   ★작업 데이터·이벤트 큐(ami_work_status·ami_checked_meters·ami_event_queue)·IndexedDB 는 절대 안 지운다.
function authForceLogoutNow() {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(FORCE_LOGOUT_VERSION_KEY);
    UI_STATE_KEYS.forEach(k => localStorage.removeItem(k));
    const emu = sessionStorage.getItem('ami_emu');
    sessionStorage.clear();
    if (emu) sessionStorage.setItem('ami_emu', emu);   // 맥 로컬 시험 중이면 에뮬레이터 모드 유지
    const fa = _authFb();
    const go = () => { window.location.replace('login.html'); };
    if (fa) fa.signOut().then(go, go); else go();
}

function _authQueueLength() {
    try {
        const q = JSON.parse(localStorage.getItem('ami_event_queue') || '[]');
        return Array.isArray(q) ? q.length : 0;
    } catch (_) { return 0; }
}

// 미전송 큐가 있으면 강제 로그아웃을 **미룬다** — 지도가 떠서 큐를 서버로 보낸 뒤에 한다
//   (firebase.js 가 초기 전송 직후 authCompletePendingLogout 을 부른다). 옛 초기화 사고처럼
//   로그아웃이 미전송 작업을 날리는 일을 막는다. 페이지가 지도가 아니면(통계 등) 바로 한다 —
//   큐는 지워지지 않으니 다음 지도 진입 때 보내진다.
let _authPendingForceLogout = false;
function authCompletePendingLogout() {
    if (!_authPendingForceLogout) return;
    _authPendingForceLogout = false;
    const n = _authQueueLength();
    if (n) console.warn('[auth] 미전송 큐', n, '건이 남은 채 로그아웃 — 큐는 보존되어 다음 로그인 때 보낸다');
    authForceLogoutNow();
}

function authRequire() {
    const localVer = localStorage.getItem(FORCE_LOGOUT_VERSION_KEY);
    if (localVer && localVer !== FORCE_LOGOUT_VERSION) {
        const onMap = /map\.html$/.test(location.pathname) || location.pathname.endsWith('/');
        // ※큐가 있을 때 로그아웃을 미루는 경로는 2026-10-19 야간 배포에서 검증이 안 끝나 꺼 두었다(false).
        //   큐는 지우지 않으므로 다시 로그인하면 지도가 시작하자마자 보낸다(기존 동작).
        if (false && _authQueueLength() && onMap && authGetSession()) {
            console.log('[auth] 강제 로그아웃 대기 — 미전송 큐부터 보낸다');
            _authPendingForceLogout = true;
            // 전송이 끝나지 않아도 20초 뒤엔 로그아웃한다(큐는 남는다)
            setTimeout(authCompletePendingLogout, 20000);
            return;
        }
        authForceLogoutNow();
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
    // ★진짜 확인 — Firebase 로그인. 옛 화면 세션만 있고(전환 전 로그인) Firebase 로그인이 없으면
    //   세션을 지우고 로그인 화면으로 보낸다(전환 후 처음 한 번 새 비밀번호로 로그인).
    //   ★작업 데이터·이벤트 큐는 안 지운다 — 다시 로그인하면 그대로 보낸다.
    //   Firebase 모듈을 못 불러온 페이지(옛 캐시 등)는 여기서 막지 않는다 — 데이터는 어차피 rules 가 막는다.
    if (_authFb()) {
        authReady().then(u => {
            if (u) {
                // 이름·역할이 계정에서 바뀌었으면 화면 세션도 맞춘다
                _authSessionFromUser(u).then(sess => {
                    const cur = authGetSession();
                    if (!cur || cur.id !== sess.id || cur.name !== sess.name || cur.role !== sess.role) {
                        localStorage.setItem(AUTH_KEY, JSON.stringify(sess));
                        if (cur && (cur.id !== sess.id || cur.role !== sess.role)) location.reload();
                    }
                });
                return;
            }
            localStorage.removeItem(AUTH_KEY);
            window.location.href = 'login.html';
        });
    }
}
