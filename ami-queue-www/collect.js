// AMI Queue — 수집폼 (awms 설비등록 폼 본뜨기). design.md §1.5 기준.
// 진입: __collectHandoff(아미맵 데이터푸쉬) / __collectByMeterNo(마스터 계기번호 입력) → 둘 다 _setColl로 합류.
// 모델: 한 주소 = 계기 pool. 맥 입력=마스터(그룹 생성), 맥 없음=슬래이브(마스터 배정). 아미고는 함체 자동.
// UI: awms 설비등록 화면(시공관리)을 본떠 마스터를 awms 폼 풀필드로 렌더. 작업자 입력=맥+사진뿐, 나머지 자동.
// 사전설정(지사·사업명·동행·작업자) = 설정페이지(localStorage). 출력: datapush_queue boxes[].masters[].slaves[].

// ── 계기번호 → 계기유형 (utils.js parseType) ──
function _collParseType(meterNo) {
    const code = (meterNo || '').substring(2, 4);
    if (code === '17') return 'E';
    if (code === '19') return 'AE';
    if (['25', '26', '27', '45', '46', '47'].includes(code)) return 'G';
    if (code === '53' || code === '55') return 'AMIGO';
    return '';
}
function _collIsAmigo(type) { return type === 'AMIGO'; }
function _collInstM(type) { return ({ E: 'HW4020', AE: 'HW4040', G: 'HW4030', AMIGO: 'HW4050' })[type] || 'HW4010'; }

// ── 통신방식 helper (awms-bridge-inject.js L1106~1138 순수함수 이식) ──
// suffix: 10=ks-plc 20=hpgp 40=LTE 70=lte_IV 90=k-dcu 92=smgw-c
function _commToSuffix(c) {
    const s = String(c || '').toUpperCase().replace(/[\s_-]/g, '');
    if (/SMGWC|SMGW/.test(s)) return '92';
    if (/LTEIV/.test(s)) return '70';
    if (s === 'LTE') return '40';
    if (/HPGP/.test(s)) return '20';
    if (/KDCU|IOTPLC/.test(s)) return '90';
    if (/KSPLC|^PLC$/.test(s)) return '10';
    return '';
}
function _macToSuffix(mac) {
    const raw = String(mac || '');
    if (/^012\d{8}$/.test(raw.replace(/\D/g, ''))) return 'LTE';
    const m = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
    if (/^847207/.test(m)) { const c = m.charAt(6); if (c === '0' || c === 'E') return '90'; if (c === 'B' || c === 'C' || c === 'D') return '10'; }
    if (/^E0AEED/.test(m)) return '10';
    if (/^44B433/.test(m) || /^0014B0/.test(m)) return '20';
    if (/^AC5E8C/.test(m)) return 'SKIP';   // 혼재 → 자동 안 함, 직접 선택
    return '';
}
// 모뎀맥 변환: LTE(자재ID G1S3 / 012숫자)만 012+끝8. PLC hex MAC은 원본 유지. (awms-bridge-inject modemTo012 이식)
function _modemTo012(v) {
    const s = String(v || '').trim();
    if (/^012\d{8}$/.test(s)) return s;
    const d = s.replace(/\D/g, '');
    if (/^012\d{8}$/.test(d)) return d;
    if (/G1S3/i.test(s) && d.length >= 8) return '012' + d.slice(-8);
    return s;
}
// 마스터 통신 suffix 추론: 맥 우선, 미판별 시 site-data 통신방식 교차. 결과 '' = 작업자 직접선택.
function _inferSuffix(type, mac, siteComm) {
    const sm = _macToSuffix(mac);
    if (sm === 'SKIP') return '';
    if (sm === 'LTE') return _collIsAmigo(type) ? '92' : '70';
    if (sm) return sm;
    return _commToSuffix(siteComm);   // 맥 미판별 → site-data 통신방식 교차
}
const _SUFFIX_COMM = { '10': 'ks-plc', '20': 'hpgp', '40': 'lte', '70': 'lte_IV', '90': 'k-dcu', '92': 'smgw-c' };
function _bungi(masterSuffix, slaveType) { return (masterSuffix === '92' && _collIsAmigo(slaveType)) ? '무선' : '0.5'; }
// 변대주 노출 = PLC 계열(ks-plc 10 / hpgp 20 / k-dcu 90)만
function _showBdju(suffix) { return suffix === '10' || suffix === '20' || suffix === '90'; }

const COMM_OPTS = [
    ['', '통신방식 선택'], ['10', 'KS-PLC'], ['20', 'HPGP'], ['40', 'LTE'], ['70', 'LTE직접'], ['90', 'K-DCU(IoT)'], ['92', '아미고'],
];

// ── 사전설정 (설정페이지 localStorage) ──
const _SETTINGS_KEY = 'amiq_settings';
function _amiqSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(_SETTINGS_KEY) || '{}'); } catch (e) {}
    return Object.assign({ jisa: '', busiName: '', busiNum: '', withYn: 'N', worker1: '', worker1Seq: '', worker2: '', worker2Seq: '', worker3: '', worker3Seq: '' }, s);
}
// awms에서 받아온 작업자 명단 (getUserList). 비면 수동입력 폴백.
let _amiqWorkerList = [];
function _parseWorkers(body) {
    let arr = Array.isArray(body) ? body : (body && (body.data || body.list || body.rows || body.result || body.userList)) || [];
    if (!Array.isArray(arr)) arr = [];
    return arr.map(o => {
        const name = o.WORKER_NAME || o.USER_NM || o.EMP_NM || o.USER_NAME || o.NAME || o.userNm || o.userName || o.name || '';
        const seq = o.WORKER_SEQ || o.USER_SEQ || o.EMP_SEQ || o.SEQ || o.userSeq || o.seq || '';
        return { name: String(name).trim(), seq: String(seq).trim() };
    }).filter(w => w.seq);
}
// awms 세션으로 작업자 명단 조회 (통신팀 mobCst1000/getUserList). 경로/응답 미확정 → 방어 파싱 + 원시응답 로그.
// 수동 [불러오기] — 작업자+사업명 둘 다 조회
window.__settingsLoadWorkers = async function () {
    if (typeof awmsEval !== 'function') { alert('awms 브릿지 없음 — 폰 앱에서 시도하세요'); return; }
    log('작업자·사업명 명단 조회…', 'warn');
    let okW = false, okB = false;
    try { okW = await _loadWorkersInto(); } catch (e) { log('작업자 조회 실패: ' + e.message, 'err'); }
    try { okB = await window.__settingsLoadBusiList(true); } catch (e) {}
    if (!okW && !okB) { alert('명단을 못 받았습니다.\nawms 세션 로그인 후 다시 시도하거나 수동입력하세요.\n(로그에 원시응답 기록됨)'); return; }
    window.__settingsOpen();   // 드롭다운으로 다시 렌더
};
// awms에서 받아온 사업명 명단 (getBusiList). 비면 수동입력 폴백.
let _amiqBusiList = [];
function _parseBusiList(body) {
    let arr = Array.isArray(body) ? body : (body && (body.data || body.list || body.rows || body.result || body.busiList)) || [];
    if (!Array.isArray(arr)) arr = [];
    return arr.map(o => {
        const name = o.BUSI_NM || o.BUSINESS_NM || o.BSNS_NM || o.busiNm || o.NAME || o.name || '';
        const num = o.BUSI_NUM || o.BUSI_NO || o.BSNS_NO || o.busiNum || o.BUSINESS_NO || o.NUM || '';
        return { name: String(name).trim(), num: String(num).trim() };
    }).filter(b => b.num || b.name);
}
// 사업명 조회 (통신팀 mobCst1000/getBusiList). 경로/응답 미확정 → 방어 파싱.
window.__settingsLoadBusiList = async function (silent) {
    if (typeof awmsEval !== 'function') { if (!silent) alert('awms 브릿지 없음 — 폰 앱에서 시도하세요'); return false; }
    const base = (typeof AWMS_BASE !== 'undefined' ? AWMS_BASE : 'https://awms.kdn.com');
    const url = base + '/ami/mob/cst/mobCst1000/getBusiList?DEPT1=3970';
    try {
        const body = await awmsEval(`fetch(${JSON.stringify(url)},{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject('HTTP '+r.status))`);
        const list = _parseBusiList(body);
        if (!list.length) { log('사업명 0건 — 응답: ' + JSON.stringify(body).slice(0, 200), 'warn'); return false; }
        _amiqBusiList = list;
        log('사업명 ' + list.length + '건 로드: ' + list.slice(0, 2).map(b => b.name).join(', ') + '…', 'ok');
        return true;
    } catch (e) { log('사업명 조회 실패: ' + e.message, 'warn'); return false; }
};
// 세션 연결 시 자동 로드 (작업자+사업명). session.js checkSession 성공 시 호출. 1회 가드.
let _amiqAutoLoaded = false;
window.__amiqAutoLoad = async function (force) {
    if (_amiqAutoLoaded && !force) return;
    if (typeof awmsEval !== 'function') return;
    log('사전설정 자동 로드(작업자·사업명)…', 'warn');
    let any = false;
    try { if (await _loadWorkersInto()) any = true; } catch (e) {}
    try { if (await window.__settingsLoadBusiList(true)) any = true; } catch (e) {}
    if (any) {
        _amiqAutoLoaded = true;
        // 사업명 1건뿐이면 설정에 자동 채움(미설정 시)
        const s = _amiqSettings();
        if (!s.busiNum && _amiqBusiList.length === 1) {
            s.busiName = _amiqBusiList[0].name; s.busiNum = _amiqBusiList[0].num;
            try { localStorage.setItem(_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
            log('사업명 자동설정: ' + s.busiName, 'ok');
        }
        // 설정창 열려있으면 새로고침
        const el = document.getElementById('collect-overlay');
        if (el && el.style.display === 'block' && document.getElementById('set-jisa')) window.__settingsOpen();
    }
};
// 작업자 명단만 조회해서 _amiqWorkerList 채움 (자동/수동 공용)
async function _loadWorkersInto() {
    const s = _amiqSettings();
    const dept2 = (typeof JISA_DEPT2 !== 'undefined' && JISA_DEPT2[s.jisa]) || '7793';
    const base = (typeof AWMS_BASE !== 'undefined' ? AWMS_BASE : 'https://awms.kdn.com');
    const url = base + '/ami/mob/cst/mobCst1000/getUserList?DEPT1=3970&DEPT2=' + dept2 + '&FLAG=M10';
    const body = await awmsEval(`fetch(${JSON.stringify(url)},{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject('HTTP '+r.status))`);
    const list = _parseWorkers(body);
    if (!list.length) { log('작업자 0건 — 응답: ' + JSON.stringify(body).slice(0, 200), 'warn'); return false; }
    _amiqWorkerList = list;
    log('작업자 ' + list.length + '명 로드', 'ok');
    return true;
}
window.__settingsOpen = function () {
    const s = _amiqSettings();
    const jisaOpts = (typeof JISA_DEPT2 !== 'undefined' ? Object.keys(JISA_DEPT2) : [])
        .map(j => `<option value="${_esc(j)}"${s.jisa === j ? ' selected' : ''}>${_esc(j)}</option>`).join('');
    const el = _collOverlay();
    const row = (label, html) => `<div style="margin-bottom:12px"><div style="font-size:12px;color:#6b7280;margin-bottom:4px">${label}</div>${html}</div>`;
    const inp = (id, val, ph) => `<input id="${id}" value="${_esc(val)}" placeholder="${ph || ''}" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">`;
    // 작업자 필드 — awms 명단 있으면 드롭다운(name/seq), 없으면 수동입력
    const hasList = _amiqWorkerList.length > 0;
    const workerField = (n, curSeq, curName) => {
        if (hasList) {
            const opts = `<option value="">선택</option>` + _amiqWorkerList.map(w => `<option value="${_esc(w.seq)}"${w.seq === curSeq ? ' selected' : ''}>${_esc(w.name)} (${_esc(w.seq)})</option>`).join('');
            return `<select id="set-w${n}sel" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">${opts}</select>`;
        }
        return `<div style="display:flex;gap:6px">${inp('set-w' + n, curName, '이름')}${inp('set-w' + n + 's', curSeq, 'SEQ')}</div>`;
    };
    el.innerHTML =
        `<div style="background:#4338ca;color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center">`
        + `<div style="font-size:15px;font-weight:700">아미큐 사전설정</div>`
        + `<button onclick="collClose()" style="background:#374151;color:#fff;padding:8px 12px;font-size:13px">닫기</button></div>`
        + `<div style="padding:16px;max-width:560px;margin:0 auto">`
        + `<div style="font-size:11px;color:#9ca3af;margin-bottom:14px">한 번 설정하면 모든 수집에 자동 적용됩니다. (지사·사업명·동행·작업자)</div>`
        + row('지사', `<select id="set-jisa" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px"><option value="">지사 선택</option>${jisaOpts}</select>`)
        + (_amiqBusiList.length
            ? row('사업명 (awms 명단)', `<select id="set-busiSel" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px"><option value="">선택</option>${_amiqBusiList.map(b => `<option value="${_esc(b.num)}"${b.num === s.busiNum ? ' selected' : ''}>${_esc(b.name)} (${_esc(b.num)})</option>`).join('')}</select>`)
            : row('사업명', inp('set-busiName', s.busiName, '예: 25년도 AMI 통신망 보강공사_강북') + inp('set-busiNum', s.busiNum, '사업번호 BUSI_NUM (없으면 빈칸)')))
        + row('동행시공 여부', `<select id="set-withYn" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px"><option value="N"${s.withYn === 'N' ? ' selected' : ''}>일반(단독)</option><option value="Y"${s.withYn === 'Y' ? ' selected' : ''}>동행시공</option></select>`)
        + `<div style="border-top:1px solid #e5e7eb;margin:16px 0 12px;padding-top:12px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:700;color:#374151">작업자</span>`
        + `<button onclick="__settingsLoadWorkers()" style="padding:7px 12px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700">awms에서 명단 불러오기</button></div>`
        + (hasList ? `<div style="font-size:11px;color:#059669;margin-bottom:8px">awms 작업자 ${_amiqWorkerList.length}명 로드됨 — 드롭다운 선택</div>` : `<div style="font-size:11px;color:#9ca3af;margin-bottom:8px">명단 불러오기 전 — 이름/SEQ 수동입력 (awms 세션 로그인 후 [불러오기])</div>`)
        + row('작업자1', workerField(1, s.worker1Seq, s.worker1))
        + row('작업자2', workerField(2, s.worker2Seq, s.worker2))
        + row('작업자3', workerField(3, s.worker3Seq, s.worker3))
        + `<button class="btn-green" style="width:100%;margin-top:8px;padding:14px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:700" onclick="__settingsSave()">저장</button>`
        + `<div style="height:40px"></div></div>`;
    el.style.display = 'block';
};
window.__settingsSave = function () {
    const g = id => { const x = document.getElementById(id); return x ? x.value.trim() : ''; };
    // 작업자 — 명단 드롭다운(seq) 있으면 거기서 이름 역추출, 없으면 수동입력 이름/SEQ
    const gw = n => {
        const sel = document.getElementById('set-w' + n + 'sel');
        if (sel) { const seq = sel.value; const w = _amiqWorkerList.find(x => x.seq === seq); return { name: w ? w.name : '', seq }; }
        return { name: g('set-w' + n), seq: g('set-w' + n + 's') };
    };
    const w1 = gw(1), w2 = gw(2), w3 = gw(3);
    // 사업명 — 명단 드롭다운(num) 있으면 거기서 이름 역추출, 없으면 수동입력
    let busiName = g('set-busiName'), busiNum = g('set-busiNum');
    const bsel = document.getElementById('set-busiSel');
    if (bsel) { busiNum = bsel.value; const b = _amiqBusiList.find(x => x.num === busiNum); busiName = b ? b.name : ''; }
    const s = {
        jisa: g('set-jisa'), busiName, busiNum, withYn: g('set-withYn'),
        worker1: w1.name, worker1Seq: w1.seq, worker2: w2.name, worker2Seq: w2.seq, worker3: w3.name, worker3Seq: w3.seq,
    };
    try { localStorage.setItem(_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
    log('사전설정 저장: ' + (s.jisa || '지사미설정') + ' / ' + (s.worker1 || '작업자미설정'), 'ok');
    collClose();
};

// 수집 세션 상태 — meters = pool(역할 동적)
let _coll = null;
// meters[i] = { meterNo, type, siteComm, suffix, bdju, role:'unassigned'|'master'|'slave', masterIdx, mac, ext, workDiv,
//               photos:{pre,mac,post1,post2}(마스터), photo(슬래이브 slot5) }

// ── 진입 1: 아미맵 데이터푸쉬 handoff ──
window.__collectHandoff = async function (key) {
    if (!key) { alert('수집 key 없음'); return; }
    if (!_db) { try { initFb(); } catch (e) {} }
    try {
        log('수집 handoff 로드: ' + key, 'warn');
        const snap = await _db.ref('collect_handoff/' + key).once('value');
        const v = snap.val();
        if (!v || !v.meters) { alert('handoff 데이터 없음: ' + key); log('handoff 비어있음', 'err'); return; }
        _setColl(v.addr || '', v.jisa || '', v.meters, '일반', key);
    } catch (e) { alert('handoff 로드 실패: ' + e.message); log('handoff 실패: ' + e.message, 'err'); }
};

// ── 진입 2: 마스터 계기번호 입력 → 그 주소 전체 (= 데이터푸쉬와 동일) ──
window.__collectByMeterNo = async function (meterNo, workMode) {
    meterNo = String(meterNo || '').trim();
    if (!meterNo) { alert('계기번호를 입력하세요'); return; }
    if (!_db) { try { initFb(); } catch (e) {} }
    log('계기번호 조회: ' + meterNo, 'warn');
    try {
        const s1 = await _db.ref('siteData/charger4eleccar').orderByChild('계기번호').equalTo(meterNo).once('value');
        const v1 = s1.val();
        if (!v1) {
            // site-data 밖 = 직접입력(현장 대부분, 80~90%). 마찰 없이 바로 그 계기로 폼 시작.
            log('직접입력(site-data 밖): ' + meterNo, 'ok');
            _setColl('', '', [{ 계기번호: meterNo }], '일반', '');
            return;
        }
        const hit = Object.values(v1)[0];
        const jibun = hit.주소 || '';
        // 지번주소(주소) 기준 그 주소 전체 — 아미맵 마커 그룹핑과 동일(도로명 오통합 방지). 정교화는 별도 세션.
        let meters = [];
        if (jibun) { const s2 = await _db.ref('siteData/charger4eleccar').orderByChild('주소').equalTo(jibun).once('value'); meters = Object.values(s2.val() || {}); }
        if (!meters.length) meters = [hit];
        _setColl(jibun || hit.도로명주소 || '', hit.지사 || '', meters, '일반', '');
    } catch (e) { alert('조회 실패: ' + e.message); log('조회 실패: ' + e.message, 'err'); }
};

// ── 수집창 진입 화면 (계기번호 입력/QR/직접입력으로 받기) ──
// [수집] 버튼 → 빈 수집창 열림 → 그 안에서 계기번호 받음. (prompt 메시지박스 아님)
// 동행시공은 별도 조회 안 함 — site-data 밖 계기는 직접입력으로 추가(영준님 2026-06-14).
window.__collectOpen = function () {
    const s = _amiqSettings();
    const setLine = (s.jisa || s.worker1)
        ? `${_esc(s.jisa || '지사미설정')}${s.busiName ? ' · ' + _esc(s.busiName) : ''}${s.worker1 ? ' · 작업자 ' + _esc(s.worker1) + (s.worker2 ? ',' + _esc(s.worker2) : '') : ''}`
        : `<span style="color:#dc2626">사전설정 없음 — [설정]에서 지사·작업자를 먼저 등록하세요</span>`;
    const el = _collOverlay();
    el.innerHTML =
        `<div style="background:#1e3a8a;color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center">`
        + `<div style="font-size:15px;font-weight:700">awms 수집</div>`
        + `<div style="display:flex;gap:6px"><button onclick="__settingsOpen()" style="background:#4f46e5;color:#fff;padding:8px 12px;font-size:13px">설정</button>`
        + `<button onclick="collClose()" style="background:#374151;color:#fff;padding:8px 12px;font-size:13px">닫기</button></div></div>`
        + `<div style="padding:16px;max-width:560px;margin:0 auto">`
        + `<div style="font-size:11px;color:#6b7280;background:#f1f5f9;border-radius:8px;padding:8px 10px;margin-bottom:12px">${setLine}</div>`
        + `<div style="font-weight:700;margin-bottom:8px">계기번호 입력/스캔 → 폼 시작</div>`
        + `<div style="display:flex;gap:6px;margin-bottom:8px">`
        + `<input id="coll-entry-no" inputmode="numeric" placeholder="계기번호 입력" style="flex:1;padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:15px" onkeydown="if(event.key==='Enter')collEntryLoad()">`
        + `<button onclick="collEntryLoad()" class="btn-primary" style="flex:0 0 70px;width:70px">시작</button></div>`
        + `<button onclick="collEntryScan()" class="btn-secondary" style="width:100%;padding:13px;margin-bottom:6px;background:#7c3aed;color:#fff">QR / 바코드 스캔</button>`
        + `<button onclick="collStartBlank()" class="btn-secondary" style="width:100%;padding:13px;margin-bottom:6px;background:#ede9fe;color:#5b21b6">빈 폼으로 시작</button>`
        + `<div style="font-size:11px;color:#9ca3af;margin-top:10px">계기번호를 입력/스캔하면 폼이 열립니다. site-data에 있으면 주소 전체·계기유형이 자동으로 채워지고, 없으면(현장 대부분) 그 계기로 바로 시작합니다.</div>`
        + `</div>`;
    el.style.display = 'block';
};
window.collEntryLoad = function () {
    const inp = document.getElementById('coll-entry-no');
    const no = inp && inp.value ? inp.value.trim() : '';
    if (!no) { alert('계기번호를 입력하세요'); return; }
    window.__collectByMeterNo(no);
};
window.collEntryScan = function () {
    _ensureQrScanner(function (ok) {
        if (!ok || !window.QrScanner) { alert('스캐너 로드 실패 — 계기번호를 직접 입력하세요'); return; }
        window.QrScanner.show(function (text) {
            const no = String(text || '').replace(/\D/g, '');
            if (!no) { alert('계기번호 인식 실패: ' + text); return; }
            const inp = document.getElementById('coll-entry-no');
            if (inp) inp.value = no;
            window.__collectByMeterNo(no);
        });
    });
};
// 직접입력 시작 — 빈 폼(계기 0건). [계기추가]로 직접 입력. (site-data 밖 현장)
window.collStartBlank = function () {
    _setColl('', '', [], '일반', '');
};

// ── QR 스캐너 동적 로드 (js/qr-scanner.js + 오버레이 마크업) ──
function _qrOverlayHtml() {
    return `<div id="qr-scan-overlay" style="display:none;position:fixed;inset:0;background:black;z-index:300000;flex-direction:column;">`
        + `<div style="display:flex;align-items:center;padding:10px 14px;background:#111;color:white;gap:8px;">`
        + `<span id="qr-cam-label" style="font-size:12px;font-weight:600;white-space:nowrap;">카메라</span>`
        + `<select id="qr-cam-select" style="flex:1;min-width:140px;padding:8px 10px;background:#374151;color:white;border:1.5px solid #6b7280;border-radius:6px;font-size:13px;font-weight:600;appearance:auto;-webkit-appearance:auto;"><option>카메라 로드 중...</option></select>`
        + `<button id="qr-close-btn" style="padding:6px 12px;background:#ef4444;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;">×</button></div>`
        + `<div style="flex:1;display:flex;align-items:center;justify-content:center;background:black;overflow:hidden;">`
        + `<div id="qr-reader" style="width:min(100vw, 100%); aspect-ratio:1/1; max-height:100%; background:black; position:relative; overflow:hidden;"></div></div>`
        + `<div id="qr-error-msg" style="display:none;padding:14px;background:#7f1d1d;color:white;font-size:13px;text-align:center;"></div>`
        + `<div style="display:flex;gap:6px;padding:8px;background:#111;">`
        + `<button id="qr-switch-btn" style="display:none;flex:1;padding:10px;background:#374151;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;">카메라 전환</button>`
        + `<button id="qr-zoom-out" style="flex:1;padding:10px;background:#374151;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;">- 줌</button>`
        + `<button id="qr-zoom-in" style="flex:1;padding:10px;background:#374151;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;">+ 줌</button>`
        + `<button id="qr-torch-btn" style="display:none;flex:1;padding:10px;background:#374151;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;">손전등</button></div></div>`;
}
function _ensureQrScanner(cb) {
    // 오버레이 마크업 먼저 (QrScanner.init이 DOM 참조)
    if (!document.getElementById('qr-scan-overlay')) {
        const d = document.createElement('div'); d.innerHTML = _qrOverlayHtml();
        document.body.appendChild(d.firstChild);
    }
    if (window.QrScanner) { try { window.QrScanner.init(); } catch (e) {} cb(true); return; }
    if (document.getElementById('qr-scanner-js')) {   // 로드 진행중 — 잠깐 대기
        let n = 0; const t = setInterval(() => { if (window.QrScanner) { clearInterval(t); try { window.QrScanner.init(); } catch (e) {} cb(true); } else if (++n > 30) { clearInterval(t); cb(false); } }, 200);
        return;
    }
    const s = document.createElement('script');
    s.id = 'qr-scanner-js';
    s.src = 'https://815dudwns.github.io/ami-work/js/qr-scanner.js?t=' + Date.now();
    s.onload = function () { try { window.QrScanner && window.QrScanner.init(); } catch (e) {} cb(!!window.QrScanner); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
}

// ── pool 구성 (handoff·계기번호·동행 공유). 역할은 전부 unassigned로 시작. ──
function _setColl(addr, jisa, rawMeters, workMode, key) {
    const set = _amiqSettings();
    const meters = (rawMeters || []).map(m => {
        const meterNo = String(m.계기번호 || m.meterNo || m.new_meter_id || '');
        const type = _collParseType(meterNo) || '';
        return {
            meterNo, type,
            siteComm: m.통신방식 || m.comm || '',
            bdju: m.변대주 || '',          // 변대주(PLC; ≠DCUID). awms 필드매핑은 TODO(미확정)
            role: 'unassigned', masterIdx: -1,
            mac: '', suffix: '', ext: 'N', workDiv: 'M1010',
            photos: { pre: '', mac: '', post1: '', post2: '' },  // 마스터 4
            photo: '',                                            // 슬래이브 1(slot5)
            _cntrClas: m.cntr_clas || '', _cntrPwr: m.cntr_pwr || '', _cha: m.cha || '',  // 동행 부가(2차)
        };
    }).filter(m => m.meterNo);
    // 지사: 설정값 우선(동행=서울본부직할), 없으면 진입데이터/site-data
    let useJisa = jisa || '';
    if (set.jisa) useJisa = set.jisa;
    if ((workMode === '동행' || set.withYn === 'Y') && !set.jisa) useJisa = '서울본부직할';
    _coll = {
        key: key || '', addr: addr || '', jisa: useJisa,
        workMode: (set.withYn === 'Y' ? '동행' : (workMode || '일반')),
        hamType: '단독', meters, settings: set,
    };
    log('수집 ' + meters.length + '건 / ' + _coll.workMode + ' (' + (addr || '') + ')', 'ok');
    renderCollect();
}

// ── 역할 조작 ──
window.collSetMac = function (i, v) {
    const m = _coll && _coll.meters[i]; if (!m) return;
    m.mac = String(v || '').trim();
    if (m.mac) {
        if (m.role !== 'master') { m.role = 'master'; m.masterIdx = -1; }
        m.suffix = _inferSuffix(m.type, m.mac, m.siteComm);  // 통신방식 자동
    }
    renderCollect();
};
window.collSetSuffix = function (i, suf) { const m = _coll && _coll.meters[i]; if (m) { m.suffix = suf; renderCollect(); } };
window.collSetExt = function (i, v) { const m = _coll && _coll.meters[i]; if (m) m.ext = v ? 'Y' : 'N'; };
window.collSetWorkDiv = function (i, v) { const m = _coll && _coll.meters[i]; if (m) m.workDiv = v; };
window.collMakeMaster = function (i) {
    const m = _coll && _coll.meters[i]; if (!m) return;
    m.role = 'master'; m.masterIdx = -1;
    m.suffix = m.suffix || _inferSuffix(m.type, m.mac, m.siteComm);
    renderCollect();
};
// 슬래이브 배정 (마스터 인덱스). masterIdx=-1 = 미할당으로
window.collAssignSlave = function (i, masterIdx) {
    const m = _coll && _coll.meters[i]; if (!m) return;
    masterIdx = parseInt(masterIdx, 10);
    if (isNaN(masterIdx) || masterIdx < 0) { m.role = 'unassigned'; m.masterIdx = -1; }
    else { m.role = 'slave'; m.masterIdx = masterIdx; m.mac = ''; }
    renderCollect();
};
// 아미고 마스터: 미할당 전부 이 마스터 슬래이브로 (무선, 함체 자동)
window.collAmigoAuto = function (mi) {
    if (!_coll) return;
    _coll.meters.forEach((m, i) => { if (i !== mi && m.role === 'unassigned') { m.role = 'slave'; m.masterIdx = mi; m.mac = ''; } });
    renderCollect();
};
window.collSetHam = function (v) { if (_coll) { _coll.hamType = v; renderCollect(); } };
window.collClose = function () { const el = document.getElementById('collect-overlay'); if (el) el.style.display = 'none'; };

// 계기 직접추가 (리스트밖 / 직접입력 현장). 계기번호 입력받아 pool에 미할당으로 추가.
// 신설/기설은 폼의 작업구분 드롭다운에서 선택(기본 신설). 맥 넣으면 마스터, 안 넣으면 슬래이브 배정.
window.collAddMeter = function () {
    if (!_coll) return;
    const no = (prompt('추가할 계기번호 입력') || '').trim();
    if (!no) return;
    const type = _collParseType(no) || '';
    _coll.meters.push({
        meterNo: no, type, siteComm: '', bdju: '', role: 'unassigned', masterIdx: -1,
        mac: '', suffix: '', ext: 'N', workDiv: 'M1010',
        photos: { pre: '', mac: '', post1: '', post2: '' }, photo: '', _extra: true,
    });
    log('계기 직접추가: ' + no, 'warn');
    renderCollect();
};

// 사진: 마스터=photos[k], 슬래이브=photo(slot5). dataURL 콜백 지원(QR 겸용).
window.collOnPhoto = function (i, k, input) {
    const f = input.files && input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => _collSetPhoto(i, k, r.result);
    r.readAsDataURL(f);
};
function _collSetPhoto(i, k, dataUrl) {
    const m = _coll && _coll.meters[i]; if (!m) return;
    if (k === 'slave') m.photo = dataUrl; else m.photos[k] = dataUrl;
    renderCollect();
}
// 모뎀맥 QR 스캔 = 맥값 + 스캔화면 사진(모뎀맥 사진) 겸용. (design.md §1.5)
window.collScanMac = function (i) {
    _ensureQrScanner(function (ok) {
        if (!ok || !window.QrScanner) { alert('스캐너 로드 실패 — 맥을 직접 입력하세요'); return; }
        window.QrScanner.show(function (text, blob) {
            const m = _coll && _coll.meters[i]; if (!m) return;
            const mac = _modemTo012(text);
            m.mac = mac;
            if (m.role !== 'master') { m.role = 'master'; m.masterIdx = -1; }
            m.suffix = _inferSuffix(m.type, m.mac, m.siteComm);
            log('맥 스캔: ' + mac, 'ok');
            if (blob) {   // 스캔 프레임 = 모뎀맥 사진 겸용
                const r = new FileReader();
                r.onload = () => { m.photos.mac = r.result; renderCollect(); };
                r.readAsDataURL(blob);
            } else { renderCollect(); }
        });
    });
};

// ── 시설유형 자동산출 ──
function _fcltyOf(masterCount, order, slaveCount, hamType) {
    if (masterCount <= 1) {
        if (hamType === '집합') return { div: '20', label: '집합기본' };
        return slaveCount > 0 ? { div: '40', label: '집합단독' } : { div: '10', label: '단독형' };
    }
    return order === 0 ? { div: '20', label: '집합기본' } : { div: '30', label: '집합추가' };
}

// ── 렌더 (awms 설비등록 폼 본뜨기) ──
function _collOverlay() {
    let el = document.getElementById('collect-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'collect-overlay';
        el.style.cssText = 'position:fixed;inset:0;z-index:90000;background:#f3f4f6;overflow-y:auto;display:none;-webkit-overflow-scrolling:touch';
        document.body.appendChild(el);
    }
    return el;
}
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// awms 폼 한 줄: 라벨(빨강*) + 값/입력
function _frow(label, valueHtml, req) {
    return `<div style="display:flex;align-items:stretch;border-bottom:1px solid #e5e7eb">`
        + `<div style="flex:0 0 96px;background:#374151;color:#fff;font-size:12px;display:flex;align-items:center;padding:8px 10px">${req ? '<span style="color:#f87171;margin-right:3px">*</span>' : ''}${_esc(label)}</div>`
        + `<div style="flex:1;padding:6px 8px;display:flex;align-items:center;gap:6px;background:#fff;min-height:42px">${valueHtml}</div></div>`;
}
function _ro(v) { return `<span style="font-size:14px;color:#111">${_esc(v || '')}</span>`; }   // 읽기전용(자동)

function _photoSlot(i, k, lbl, cur) {
    const has = !!cur;
    return `<label style="flex:1;aspect-ratio:1;border:2px dashed ${has ? '#059669' : '#cbd5e1'};border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;color:${has ? '#059669' : '#94a3b8'};background:${has ? '#ecfdf5' : '#fff'};overflow:hidden;position:relative">`
        + (has ? `<img src="${cur}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : '')
        + `<span style="position:relative;z-index:1;background:rgba(255,255,255,.7);padding:1px 3px;border-radius:3px">${_esc(lbl)}${has ? ' ✓' : ''}</span>`
        + `<input type="file" accept="image/*" style="display:none" onchange="collOnPhoto(${i},'${k}',this)"></label>`;
}

// 마스터 1개 = awms 폼 블록
function _masterBlock(m, i, masters) {
    const order = masters.indexOf(i);
    const slaves = _coll.meters.map((s, si) => (s.role === 'slave' && s.masterIdx === i ? si : -1)).filter(si => si >= 0);
    const fclty = _fcltyOf(masters.length, order, slaves.length, _coll.hamType);
    const commName = _SUFFIX_COMM[m.suffix] || '';
    const commSel = COMM_OPTS.map(([v, l]) => `<option value="${v}"${m.suffix === v ? ' selected' : ''}>${_esc(l)}</option>`).join('');
    const cnt = 1 + slaves.length;
    const modemTag = `<span style="font-size:10px;background:#2563eb;color:#fff;padding:1px 6px;border-radius:4px">마스터</span>`;

    let h = `<div class="card" style="margin:0 0 14px;padding:0;overflow:hidden;border:2px solid #2563eb;border-radius:10px">`
        + `<div style="background:#1e40af;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">`
        + `<div style="font-size:14px;font-weight:700">${_esc(m.meterNo)} ${modemTag}</div>`
        + `<div style="font-size:11px;opacity:.9">${_esc(fclty.label)}(${fclty.div})</div></div>`;

    // 시설유형 / 모뎀유형
    h += _frow('시설유형', _ro(fclty.label + '(' + fclty.div + ') · 자동'), true);
    h += _frow('모뎀유형', _ro('마스터'), true);
    // 대표계기 (자동 = 마스터계기, 단독형은 비움)
    h += _frow('대표계기', _ro(fclty.div === '10' ? '(단독형 — 없음)' : m.meterNo));
    // 함내계기수(자동) / 동행
    h += _frow('함내계기수', _ro(fclty.div === '10' ? '(단독형 — 없음)' : String(cnt)) + `<span style="font-size:11px;color:#9ca3af;margin-left:auto">동행 ${_coll.workMode === '동행' ? 'Y' : 'N'}</span>`);
    // 작업구분
    h += _frow('작업구분', `<select onchange="collSetWorkDiv(${i},this.value)" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px"><option value="M1010"${m.workDiv === 'M1010' ? ' selected' : ''}>신설</option><option value="M1030"${m.workDiv === 'M1030' ? ' selected' : ''}>기설</option></select>${m._extra ? '<span style="font-size:11px;color:#92400e;margin-left:auto">추가계기</span>' : ''}`, true);
    // 계기번호 (고정) + 계기유형(자동)
    h += _frow('계기번호', _ro(m.meterNo), true);
    h += _frow('계기유형', _ro((m.type || '?') + '타입 · 자동'), true);
    // 모뎀맥 (입력 + QR스캔)
    h += _frow('모뎀맥', `<input value="${_esc(m.mac)}" oninput="collSetMac(${i},this.value)" placeholder="모뎀맥 입력" style="flex:1;padding:9px;border:1px solid #d1d5db;border-radius:6px;font-size:14px"><button onclick="collScanMac(${i})" style="flex:0 0 56px;width:56px;padding:9px 0;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700">스캔</button>`, true);
    // 통신방식 (자동/수동)
    h += _frow('통신방식', `<select onchange="collSetSuffix(${i},this.value)" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">${commSel}</select>`
        + (commName ? `<span style="font-size:10px;color:#059669">자동</span>` : `<span style="font-size:10px;color:#dc2626">미판별</span>`), true);
    // 분기 (자동, 마스터는 비활성)
    h += _frow('분기', _ro('없음 (마스터)'));
    // 변대주 (PLC 계열만)
    if (_showBdju(m.suffix)) h += _frow('변대주', _ro(m.bdju || '(없음)'));
    // 외장형 연결장치 (AE만)
    if (m.type === 'AE') h += _frow('연결장치', `<label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" ${m.ext === 'Y' ? 'checked' : ''} onchange="collSetExt(${i},this.checked)">외장형(etype) Y/N</label>`);

    // 사진 4
    h += `<div style="padding:10px 12px;background:#f8fafc"><div style="font-size:11px;color:#6b7280;margin-bottom:6px">사진 (시공전 · 모뎀맥 · 시공후1 · 시공후2)</div>`
        + `<div style="display:flex;gap:5px">${_photoSlot(i, 'pre', '시공전', m.photos.pre)}${_photoSlot(i, 'mac', '모뎀맥', m.photos.mac)}${_photoSlot(i, 'post1', '시공후1', m.photos.post1)}${_photoSlot(i, 'post2', '시공후2', m.photos.post2)}</div></div>`;

    // 슬래이브 섹션
    h += `<div style="padding:8px 12px;border-top:1px solid #e5e7eb">`;
    if (slaves.length) {
        h += slaves.map(si => {
            const s = _coll.meters[si];
            return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;background:#f1f5f9;border-radius:8px;padding:6px">`
                + `<div style="flex:0 0 56px">${_photoSlot(si, 'slave', '계기', s.photo)}</div>`
                + `<div style="flex:1"><div style="font-size:13px;font-weight:700">${_esc(s.meterNo)} <span style="font-size:10px;color:#64748b">${_esc(s.type || '?')}타입 · 분기 ${_bungi(m.suffix, s.type)}</span></div></div>`
                + `<button onclick="collAssignSlave(${si},-1)" style="flex:0 0 auto;padding:6px 10px;background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;font-size:12px">제거</button></div>`;
        }).join('');
    }
    // SLAVE 추가 (미할당 pool에서 선택)
    const un = _coll.meters.map((s, si) => (s.role === 'unassigned' ? si : -1)).filter(si => si >= 0);
    if (un.length) {
        h += `<select onchange="if(this.value!=='')collAssignSlave(parseInt(this.value),${i});this.value=''" style="width:100%;padding:9px;border:1px dashed #94a3b8;border-radius:6px;font-size:13px;color:#475569;margin-top:2px">`
            + `<option value="">+ SLAVE 추가 (남은 계기 선택)</option>`
            + un.map(si => `<option value="${si}">▸ ${_esc(_coll.meters[si].meterNo)} (${_esc(_coll.meters[si].type || '?')})</option>`).join('') + `</select>`;
        if (_collIsAmigo(m.type)) h += `<button onclick="collAmigoAuto(${i})" style="width:100%;margin-top:6px;padding:8px;background:#e0e7ff;color:#3730a3;border:none;border-radius:6px;font-size:12px;font-weight:700">아미고 — 남은 계기 전부 이 마스터 슬래이브로(무선)</button>`;
    }
    h += `</div></div>`;
    return h;
}

function renderCollect() {
    if (!_coll) return;
    const el = _collOverlay();
    const set = _coll.settings || _amiqSettings();
    const dept2 = (typeof JISA_DEPT2 !== 'undefined' && JISA_DEPT2[_coll.jisa]) || '';
    const masters = _coll.meters.map((m, i) => (m.role === 'master' ? i : -1)).filter(i => i >= 0);
    const slaveCnt = _coll.meters.filter(m => m.role === 'slave').length;
    const unList = _coll.meters.map((m, i) => (m.role === 'unassigned' ? i : -1)).filter(i => i >= 0);

    const masterBlocks = masters.map(i => _masterBlock(_coll.meters[i], i, masters)).join('');

    // 미할당 계기 — 맥 입력(마스터) 또는 슬래이브 배정
    let unBlock = '';
    if (unList.length) {
        unBlock = `<div class="card" style="margin:0 0 14px;border-left:4px solid #fbbf24">`
            + `<div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:8px">미할당 계기 ${unList.length}건 — 모뎀 꽂은 계기에 맥 입력(=마스터), 나머지는 슬래이브 배정</div>`
            + unList.map(i => {
                const m = _coll.meters[i];
                const masterSel = masters.length
                    ? `<select onchange="if(this.value!=='')collAssignSlave(${i},this.value)" style="flex:0 0 130px;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px"><option value="">슬래이브로…</option>` + masters.map(mi => `<option value="${mi}">▸ ${_esc(_coll.meters[mi].meterNo)}</option>`).join('') + `</select>`
                    : '';
                return `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">`
                    + `<div style="flex:0 0 96px;font-size:12px;font-weight:600">${_esc(m.meterNo)}<br><span style="font-size:10px;color:#9ca3af">${_esc(m.type || '?')}타입</span></div>`
                    + `<input oninput="collSetMac(${i},this.value)" placeholder="모뎀맥 → 마스터" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">`
                    + `<button onclick="collScanMac(${i})" style="flex:0 0 50px;width:50px;padding:8px 0;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:11px">스캔</button>`
                    + masterSel + `</div>`;
            }).join('') + `</div>`;
    }

    el.innerHTML =
        // 헤더
        `<div style="background:#1e3a8a;color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center">`
        + `<div><div style="font-size:15px;font-weight:700">awms 설비등록 수집</div>`
        + `<div style="font-size:11px;opacity:.85;margin-top:2px">${_esc(_coll.addr || '')}</div></div>`
        + `<div style="display:flex;gap:6px"><button onclick="__settingsOpen()" style="background:#4f46e5;color:#fff;padding:8px 12px;font-size:13px">설정</button>`
        + `<button onclick="collClose()" style="background:#374151;color:#fff;padding:8px 12px;font-size:13px">닫기</button></div></div>`
        // 사전설정/요약 바
        + `<div style="background:#fff;padding:8px 16px;border-bottom:1px solid #e5e7eb;font-size:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">`
        + `<span><b>${_esc(_coll.jisa || '지사미설정')}</b>${dept2 ? '(' + dept2 + ')' : ''}</span>`
        + (set.busiName ? `<span style="color:#6b7280">${_esc(set.busiName)}</span>` : '')
        + `<span>작업방식 <b>${_esc(_coll.workMode)}</b></span>`
        + `<span>함체 <select onchange="collSetHam(this.value)" style="padding:4px;border:1px solid #d1d5db;border-radius:6px;font-size:12px"><option value="단독"${_coll.hamType === '단독' ? ' selected' : ''}>단독</option><option value="집합"${_coll.hamType === '집합' ? ' selected' : ''}>집합</option></select></span>`
        + (set.worker1 ? `<span style="color:#6b7280">작업자 ${_esc(set.worker1)}${set.worker2 ? ',' + _esc(set.worker2) : ''}</span>` : `<span style="color:#dc2626">작업자 미설정</span>`)
        + `<span style="margin-left:auto;color:#2563eb">마스터 ${masters.length}</span><span style="color:#6b7280">슬래이브 ${slaveCnt}</span>${unList.length ? `<span style="color:#92400e">미할당 ${unList.length}</span>` : ''}</div>`
        // 본문
        + `<div style="padding:12px;max-width:620px;margin:0 auto">`
        + unBlock
        + (masterBlocks || (unList.length ? '' : '<div class="card" style="text-align:center;color:#9ca3af;padding:30px">계기 없음</div>'))
        // 하단 버튼 (awms처럼)
        + `<div style="display:flex;gap:6px;margin-top:6px">`
        + `<button onclick="collAddMeter()" style="flex:1;padding:13px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;font-weight:700">계기추가</button>`
        + `<button class="btn-green" style="flex:2;padding:13px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:700" onclick="collSubmit()">완료 — 큐에 담기</button></div>`
        + `<div style="height:40px"></div></div>`;
    el.style.display = 'block';
}

// ── 큐에 담기: pool → boxes (마스터그룹). 시설유형 자동산출. 출력 스키마 보존(consumer=amiqueue-saveact.js). ──
window.collSubmit = async function () {
    if (!_coll || !_coll.meters.length) return;
    const masters = _coll.meters.map((m, i) => (m.role === 'master' ? i : -1)).filter(i => i >= 0);
    if (!masters.length) { alert('마스터가 없습니다.\n모뎀 꽂은 계기에 맥을 입력하면 마스터가 됩니다.'); return; }
    const un = _coll.meters.filter(m => m.role === 'unassigned');
    if (un.length && !confirm('미할당 계기 ' + un.length + '건이 있습니다(큐에서 제외됨). 계속할까요?')) return;
    const noSuffix = masters.filter(mi => !_coll.meters[mi].suffix);
    if (noSuffix.length && !confirm('통신방식 미선택 마스터 ' + noSuffix.length + '건. saveAct 오류 가능.\n계속할까요?')) return;
    const set = _coll.settings || _amiqSettings();

    const boxMasters = masters.map((mi, order) => {
        const m = _coll.meters[mi];
        const slaves = _coll.meters.filter(s => s.role === 'slave' && s.masterIdx === mi);
        const fclty = _fcltyOf(masters.length, order, slaves.length, _coll.hamType);
        const cnt = 1 + slaves.length;
        return {
            meterNo: m.meterNo, meterType: m.type, mac: m.mac,
            comm: _SUFFIX_COMM[m.suffix] || '', commSuffix: m.suffix,
            fcltyDiv: fclty.div, fcltyLabel: fclty.label,
            mbMeterId: fclty.div === '10' ? '' : m.meterNo,
            mbCnt: fclty.div === '10' ? '' : String(cnt),
            ext: m.ext || 'N', extConn: m.ext || 'N', bdju: m.bdju || '', workDiv: m.workDiv || 'M1010',
            photos: m.photos,
            slaves: slaves.map(s => ({ meterNo: s.meterNo, meterType: s.type, bungi: _bungi(m.suffix, s.type), photo: s.photo || '' })),
        };
    });
    const rec = {
        workMode: _coll.workMode, addr: _coll.addr || '', jisa: _coll.jisa || '',
        workDiv: 'M1010',
        busiName: set.busiName || '', busiNum: set.busiNum || '',
        workers: { w1: set.worker1 || '', w1Seq: set.worker1Seq || '', w2: set.worker2 || '', w2Seq: set.worker2Seq || '', w3: set.worker3 || '', w3Seq: set.worker3Seq || '' },
        createdAt: new Date().toISOString(), createdBy: 'amiqueue', createdByName: '아미큐수집',
        status: 'pending', boxes: [{ hamType: _coll.hamType, masters: boxMasters }],
    };
    if (!confirm(_coll.addr + '\n마스터 ' + masters.length + ' · 슬래이브 ' + _coll.meters.filter(m => m.role === 'slave').length + '건을 큐에 담습니다.')) return;
    try {
        const ref = await _db.ref('datapush_queue').push(rec);
        log('큐 담기 완료 → ' + ref.key, 'ok');
        if (_coll.key) { try { await _db.ref('collect_handoff/' + _coll.key).remove(); } catch (e) {} }
        _coll = null; collClose();
        if (typeof refreshQueue === 'function') refreshQueue();
        alert('큐에 담았습니다. [큐] 화면에서 확인하세요.');
    } catch (e) { alert('큐 담기 실패: ' + e.message); log('큐 담기 실패: ' + e.message, 'err'); }
};
