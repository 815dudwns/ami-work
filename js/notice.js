// notice.js — 메뉴 '공지' (2026-10-20, 영준님 지시)
//
// 내용은 코드가 아니라 data/notices.json(우리) · data/notices-gwangmyeong.json(광명) 에 둔다 — 다음 공지부터는 그 파일만 고친다.
//   형식: [{ id, date, title, body }] 최신이 앞. body 는 줄바꿈(\n) 포함 평문.
// ★본문은 textContent 로만 넣는다(innerHTML 금지 — 공개 파일이라도 스크립트 주입 경로를 만들지 않는다).
// 읽음 = localStorage 'ami_notice_seen' 에 최신 id. ★작업 데이터 키가 아니고, 강제 로그아웃
//   UI_STATE_KEYS 에도 넣지 않는다 — 로그아웃 뒤 같은 공지가 다시 뜨면 안 된다.
// 안 읽은 공지가 있으면 메뉴 버튼·공지 행에 점을 찍고, 지도를 처음 열 때 한 번 자동으로 띄운다.
// ★광명(전용 그룹 kmtest)은 광명 공지만 본다 — data/notices-gwangmyeong.json (영준님 2026-10-30 "우리 공지랑 분리해").
//   우리 계정은 data/notices.json 만. 서로 폴백하지 않는다(파일이 없으면 공지 없음).
//   읽음 표시도 키를 따로 둔다(한 폰에서 두 계정을 써도 서로의 읽음을 덮지 않게).
const _NOTICE_GROUP = (typeof authExclusiveGroup === 'function' && authExclusiveGroup()) || '';
const NOTICE_FILES = { kmtest: 'data/notices-gwangmyeong.json' };
const NOTICE_URL = _NOTICE_GROUP ? (NOTICE_FILES[_NOTICE_GROUP] || '') : 'data/notices.json';
const NOTICE_SEEN_KEY = _NOTICE_GROUP ? `ami_notice_seen__${_NOTICE_GROUP}` : 'ami_notice_seen';
let _notices = [];

async function loadNotices() {
    if (!NOTICE_URL) return [];          // 공지 파일이 정해지지 않은 전용 그룹 — 우리 공지로 폴백하지 않는다
    try {
        const r = await fetch(NOTICE_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return [];
        const arr = await r.json();
        return Array.isArray(arr) ? arr.filter(n => n && n.id) : [];
    } catch (e) {
        console.warn('[notice] 불러오기 실패(무시):', e && e.message);
        return [];
    }
}

function _noticeUnseen() {
    return _notices.length && localStorage.getItem(NOTICE_SEEN_KEY) !== String(_notices[0].id);
}

function _paintNoticeDots() {
    const on = !!_noticeUnseen();
    const row = document.getElementById('notice-dot-row');
    if (row) row.style.display = on ? '' : 'none';
    const trig = document.getElementById('menu-trigger');
    if (trig) {
        let dot = document.getElementById('notice-dot-menu');
        if (!dot) {
            dot = document.createElement('span');
            dot.id = 'notice-dot-menu';
            dot.style.cssText = 'position:absolute;top:6px;right:6px;width:9px;height:9px;border-radius:50%;'
                + 'background:#ef4444;border:2px solid #fff;pointer-events:none;';
            if (getComputedStyle(trig).position === 'static') trig.style.position = 'relative';
            trig.appendChild(dot);
        }
        dot.style.display = on ? '' : 'none';
    }
}

function _el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = String(text);
    return e;
}

function _noticeBlock(n, first) {
    const box = _el('div', 'padding:14px 0;border-bottom:1px solid #e5e7eb;');
    box.appendChild(_el('div', 'font-size:12px;color:#6b7280;margin-bottom:4px;', n.date || ''));
    box.appendChild(_el('div', `font-size:${first ? 18 : 15}px;font-weight:800;color:#111827;margin-bottom:8px;`, n.title || ''));
    box.appendChild(_el('div', 'font-size:14px;line-height:1.6;color:#1f2937;white-space:pre-wrap;word-break:keep-all;', n.body || ''));
    return box;
}

function openNotices() {
    if (typeof closeAppMenu === 'function') closeAppMenu();
    let ov = document.getElementById('notice-overlay');
    if (ov) ov.remove();
    ov = _el('div', 'position:fixed;inset:0;z-index:10000;background:#fff;display:flex;flex-direction:column;');
    ov.id = 'notice-overlay';
    const head = _el('div', 'display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e7eb;');
    head.appendChild(_el('div', 'font-size:17px;font-weight:800;color:#111827;', '공지'));
    const x = _el('button', 'border:none;background:#f3f4f6;border-radius:8px;padding:8px 14px;font-size:14px;font-weight:700;color:#111827;', '닫기');
    x.type = 'button';
    x.onclick = closeNotices;
    head.appendChild(x);
    ov.appendChild(head);
    const body = _el('div', 'flex:1;overflow-y:auto;padding:0 16px 24px;');
    if (!_notices.length) body.appendChild(_el('div', 'padding:24px 0;color:#6b7280;', '공지가 없습니다.'));
    _notices.forEach((n, i) => {
        if (i === 1) body.appendChild(_el('div', 'margin-top:18px;font-size:12px;font-weight:700;color:#9ca3af;', '지난 공지'));
        body.appendChild(_noticeBlock(n, i === 0));
    });
    ov.appendChild(body);
    document.body.appendChild(ov);
}

function closeNotices() {
    const ov = document.getElementById('notice-overlay');
    if (ov) ov.remove();
    if (_notices.length) localStorage.setItem(NOTICE_SEEN_KEY, String(_notices[0].id));
    _paintNoticeDots();
}

(async function () {
    _notices = await loadNotices();
    _paintNoticeDots();
    if (_noticeUnseen()) setTimeout(openNotices, 800);   // 지도를 처음 열 때 한 번 — 닫으면 읽음
})();
