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
        // awms 통신팀 getUserList 실측: USER_NM(이름) / USER_ID(=WORKER_SEQ, 우영준 273584)
        const name = o.USER_NM || o.WORKER_NAME || o.EMP_NM || o.USER_NAME || o.NAME || o.userNm || o.userName || o.name || '';
        const seq = o.USER_ID || o.WORKER_SEQ || o.USER_SEQ || o.EMP_SEQ || o.SEQ || o.userSeq || o.seq || '';
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
    _amiqRawBusiList = arr;
    if (arr.length) _logRawObj('getBusiList[0]', arr[0]);
    return arr.map(o => {
        // awms 통신팀 getBusiList 실측: CONS_NM(사업명) / CONS_NO(사업번호, BUSI_NUM=C11G250023)
        const name = o.CONS_NM || o.BUSI_NM || o.BUSINESS_NM || o.BSNS_NM || o.busiNm || o.NAME || o.name || '';
        const num = o.CONS_NO || o.BUSI_NUM || o.BUSI_NO || o.BSNS_NO || o.busiNum || o.BUSINESS_NO || o.NUM || '';
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
// ── 진단: getUserWorkGroup/getBusiList 원시 응답 키=값 그대로 노출 (영준님 지시 2026-07-27) ──
// 공사명 필드가 어느 키인지 아직 실측 전 — 알려진 키만 라벨 병기, 모르는 키는 이름 그대로 노출한다.
const _WORKGROUP_LABELS = {
    WORKER1_SEQ: '작업자1', WORKER2_SEQ: '작업자2', WORKER3_SEQ: '작업자3',
    DEPT1: '부서1', DEPT2: '부서2(지사)',
    CONS_NO: '공사(사업)번호', BUSI_NUM: '공사(사업)번호', CONS_NM: '공사명',
};
let _amiqRawWorkGroup = null;   // getUserWorkGroup 원시 레코드(키 그대로, 파싱 전)
let _amiqRawBusiList = [];      // getBusiList 원시 배열(키 그대로, 파싱 전)
function _logRawObj(tag, obj) {
    if (!obj || typeof obj !== 'object') { log(tag + ' — 값 없음', 'warn'); return; }
    const lines = Object.keys(obj).map(k => k + (_WORKGROUP_LABELS[k] ? '(' + _WORKGROUP_LABELS[k] + ')' : '') + ' = ' + obj[k]);
    log(tag + ' 원시응답(' + lines.length + '키): ' + lines.join(' / '), 'ok');
}
// awms 공사설정 현재값 조회 (getUserWorkGroup) — 지금 awms에 지정된 작업자1/2/3 SEQ + 공사 관련 키 전부.
async function _loadCurrentConfig() {
    const base = (typeof AWMS_BASE !== 'undefined' ? AWMS_BASE : 'https://awms.kdn.com');
    const url = base + '/ami/mob/cst/mobCst1000/getUserWorkGroup?DEPT1=3970';
    const body = await awmsEval(`fetch(${JSON.stringify(url)},{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject('HTTP '+r.status))`);
    const arr = Array.isArray(body) ? body : (body && (body.data || body.list)) || [];
    const rec = (Array.isArray(arr) && arr[0]) || null;
    _amiqRawWorkGroup = rec;
    _logRawObj('getUserWorkGroup', rec);
    return rec;
}
// 세션 연결 시 자동 로드 — awms 공사설정의 "현재 설정값"을 그대로 미러(작업자·사업명). 1회 가드.
let _amiqAutoLoaded = false;
window.__amiqAutoLoad = async function (force) {
    if (_amiqAutoLoaded && !force) return;
    if (typeof awmsEval !== 'function') return;
    log('사전설정 자동 로드(awms 현재 공사설정)…', 'warn');
    let okList = false;
    try { okList = await _loadWorkersInto(); } catch (e) {}     // 전체명단(SEQ→이름 매핑용)
    try { await window.__settingsLoadBusiList(true); } catch (e) {}
    const s = _amiqSettings();
    let changed = false;
    // 작업자 = awms 공사설정 현재값(getUserWorkGroup) 그대로
    try {
        const cfg = await _loadCurrentConfig();
        if (cfg) {
            const nameOf = seq => { seq = String(seq || ''); const w = _amiqWorkerList.find(x => x.seq === seq); return w ? w.name : ''; };
            s.worker1Seq = String(cfg.WORKER1_SEQ || ''); s.worker1 = nameOf(cfg.WORKER1_SEQ);
            s.worker2Seq = String(cfg.WORKER2_SEQ || ''); s.worker2 = nameOf(cfg.WORKER2_SEQ);
            s.worker3Seq = String(cfg.WORKER3_SEQ || ''); s.worker3 = nameOf(cfg.WORKER3_SEQ);
            changed = true;
            log('현재 공사설정 작업자: ' + [s.worker1 + '(' + s.worker1Seq + ')', s.worker2, s.worker3].filter(x => x && !x.endsWith('()')).join(', '), 'ok');
        }
    } catch (e) { log('공사설정 조회 실패: ' + e.message, 'warn'); }
    // 사업명 = 사업번호 형식(C로 시작 = saveAct BUSI_NUM) 우선 자동선택(미설정 시)
    if (_amiqBusiList.length && !s.busiNum) {
        const pick = _amiqBusiList.find(b => /^C/i.test(b.num)) || _amiqBusiList[0];
        s.busiName = pick.name; s.busiNum = pick.num; changed = true;
        log('사업명 자동: ' + s.busiName + ' (' + s.busiNum + ')', 'ok');
    }
    if (changed || okList) {
        try { localStorage.setItem(_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
        _amiqAutoLoaded = true;
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
// 진단 섹션 HTML — getUserWorkGroup/getBusiList 원시 키=값 그대로 (공사명 필드 실측 확정용, 영준님 지시 2026-07-27)
function _renderRawDiag(s) {
    const dept2 = (typeof JISA_DEPT2 !== 'undefined' && JISA_DEPT2[s.jisa]) || '7793';
    const kv = (k, v) => {
        const label = _WORKGROUP_LABELS[k] ? '(' + _WORKGROUP_LABELS[k] + ')' : '';
        let extra = '';
        if (/^WORKER\d_SEQ$/.test(k)) {
            const seq = String(v || '');
            const w = _amiqWorkerList.find(x => x.seq === seq);
            extra = seq ? (w ? ' &rarr; <b>' + _esc(w.name) + '</b>' : ' &rarr; <span style="color:#dc2626">(명단에 없음 — DEPT2=' + _esc(dept2) + ' 명단 기준)</span>') : '';
        }
        return `<div style="font-family:monospace;font-size:12px;padding:3px 0;border-bottom:1px solid #f3f4f6">${_esc(k)}${_esc(label)} = ${_esc(String(v))}${extra}</div>`;
    };
    const wgHtml = _amiqRawWorkGroup
        ? Object.keys(_amiqRawWorkGroup).map(k => kv(k, _amiqRawWorkGroup[k])).join('')
        : `<div style="font-size:12px;color:#9ca3af">아직 조회 안 됨 — [awms에서 명단 불러오기] 또는 세션연결 자동로드 후 표시됩니다.</div>`;
    const busiHtml = _amiqRawBusiList.length
        ? _amiqRawBusiList.slice(0, 5).map((o, i) =>
            `<div style="margin:6px 0;padding-bottom:6px;border-bottom:1px solid #e5e7eb"><div style="font-size:11px;color:#6b7280;margin-bottom:2px">#${i + 1}</div>`
            + Object.keys(o).map(k => kv(k, o[k])).join('') + `</div>`
          ).join('')
        : `<div style="font-size:12px;color:#9ca3af">아직 조회 안 됨</div>`;
    return `<div style="border-top:1px solid #e5e7eb;margin:16px 0 12px;padding-top:12px">`
        + `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:13px;font-weight:700;color:#374151">진단 — awms 저장값 원문 (getUserWorkGroup)</span>`
        + `<button onclick="__settingsReloadDiag()" style="padding:6px 10px;background:#6366f1;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700">다시 조회</button></div>`
        + `<div style="background:#f9fafb;border-radius:8px;padding:8px 10px;margin-bottom:14px">${wgHtml}</div>`
        + `<div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:8px">진단 — getBusiList 원문 (최대 5건, 공사번호&harr;공사명 대응 확인용)</div>`
        + `<div style="background:#f9fafb;border-radius:8px;padding:8px 10px">${busiHtml}</div>`
        + `</div>`;
}
// 진단 섹션 [다시 조회] — getUserWorkGroup + getBusiList 원시응답 재조회 후 재렌더
window.__settingsReloadDiag = async function () {
    if (typeof awmsEval !== 'function') { alert('awms 브릿지 없음 — 폰 앱에서 시도하세요'); return; }
    log('진단 재조회(getUserWorkGroup/getBusiList)…', 'warn');
    try { await _loadCurrentConfig(); } catch (e) { log('getUserWorkGroup 조회 실패: ' + e.message, 'err'); }
    try { await window.__settingsLoadBusiList(true); } catch (e) {}
    window.__settingsOpen();
};
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
        + _renderRawDiag(s)
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
// [수집] 버튼 → 바로 빈 마스터 폼(마스터 카드에 번호입력+QR 내장). 진입화면 제거(영준님 2026-06-14).
// site-data 자동채움(주소/통신/변대주)은 마스터 번호 입력/스캔 시 _lookupMaster가 수행.
window.__collectOpen = function () {
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

// ── 수집 세션 (단일 마스터 + 슬래이브 사진들). 드래그 매칭(영준님 2026-06-14). ──
// _coll = { addr,jisa,workMode,key,hamType,settings,
//   master:{meterNo,type,mac,suffix,ext,bdju,siteComm,workDiv,slots:{pre,mac,post1,post2}},  // slots[k]={url}
//   slaves:[{meterNo,type,photo}] }  // 사진 1장 = 슬래이브 1개
function _setColl(addr, jisa, rawMeters, workMode, key) {
    const set = _amiqSettings();
    const noOf = r => String(r.계기번호 || r.meterNo || r.new_meter_id || '');
    const raws = (rawMeters || []).filter(r => noOf(r));   // 번호 있는 계기만
    const firstRaw = raws[0] || {};
    const firstNo = noOf(firstRaw);
    let useJisa = jisa || '';
    if (set.jisa) useJisa = set.jisa;
    if ((workMode === '동행' || set.withYn === 'Y') && !set.jisa) useJisa = '서울본부직할';
    const type = _collParseType(firstNo) || '';
    const siteComm = firstRaw.통신방식 || firstRaw.comm || '';
    _coll = {
        key: key || '', addr: addr || '', jisa: useJisa,
        workMode: (set.withYn === 'Y' ? '동행' : (workMode || '일반')),
        hamType: '단독', settings: set,
        master: {
            meterNo: firstNo, type, siteComm, bdju: firstRaw.변대주 || '',
            mac: '', suffix: _inferSuffix(type, '', siteComm), ext: 'N', workDiv: 'M1010',
            slots: { pre: null, mac: null, post1: null, post2: null },
        },
        // 지도에서 마스터 고르면 그 주소 나머지 계기 = 슬래이브로 따라옴(번호 세팅, 사진은 현장 매칭)
        slaves: raws.slice(1).map(r => { const no = noOf(r); return { meterNo: no, type: _collParseType(no) || '', photo: '', incl: true }; }),
    };
    log('수집 마스터 ' + (firstNo || '(직접입력)') + ' + 슬래이브 ' + Math.max(0, raws.length - 1) + ' / ' + _coll.workMode, 'ok');
    renderCollect();
}

// ── 마스터 필드 (input은 oninput=값만 저장 → 타이핑 focus 보존, onblur=렌더로 표시 갱신) ──
window.collMSetNo = function (v) { if (!_coll) return; const m = _coll.master; m.meterNo = String(v || '').trim(); m.type = _collParseType(m.meterNo) || ''; m.suffix = _inferSuffix(m.type, m.mac, m.siteComm); if (m.meterNo.length >= 11) _lookupMaster(m.meterNo); };
window.collMSetMac = function (v) { if (!_coll) return; const m = _coll.master; m.mac = String(v || '').trim(); m.suffix = _inferSuffix(m.type, m.mac, m.siteComm); };
window.collMBlur = function () { renderCollect(); };
window.collMSetSuffix = function (v) { if (_coll) { _coll.master.suffix = v; renderCollect(); } };
window.collMSetExt = function (c) { if (_coll) _coll.master.ext = c ? 'Y' : 'N'; };
window.collMSetWorkDiv = function (v) { if (_coll) _coll.master.workDiv = v; };
// 작업방식/함체 = 탭 한방에 토글 (영준님 2026-06-14)
window.collToggleMode = function () { if (_coll) { _coll.workMode = _coll.workMode === '일반' ? '동행' : '일반'; renderCollect(); } };
window.collToggleHam = function () { if (_coll) { _coll.hamType = _coll.hamType === '단독' ? '집합' : '단독'; renderCollect(); } };
window.collClose = function () { const el = document.getElementById('collect-overlay'); if (el) el.style.display = 'none'; };

// 마스터 계기번호 → site-data 자동채움(주소·통신·변대주·지사). 최신 호출만 반영.
let _lookupSeq = 0;
function _lookupMaster(no) {
    if (!no || no.length < 11 || !_db) return;
    const seq = ++_lookupSeq;
    _db.ref('siteData/charger4eleccar').orderByChild('계기번호').equalTo(no).once('value').then(s => {
        if (seq !== _lookupSeq) return;
        const val = s.val(); if (!val) return;
        const hit = Object.values(val)[0];
        const m = _coll && _coll.master; if (!m || m.meterNo !== no) return;
        if (!_coll.addr) _coll.addr = hit.주소 || hit.도로명주소 || '';
        m.siteComm = hit.통신방식 || ''; m.bdju = hit.변대주 || '';
        if (!m.mac) m.suffix = _inferSuffix(m.type, '', m.siteComm);
        if (!(_coll.settings && _coll.settings.jisa) && hit.지사) _coll.jisa = hit.지사;
        log('site-data 자동채움: ' + (_coll.addr || no), 'ok');
        renderCollect();
    }).catch(() => {});
}
// 마스터 계기번호 QR 스캔
window.collScanMNo = function () {
    _ensureQrScanner(function (ok) {
        if (!ok || !window.QrScanner) { alert('스캐너 실패 — 번호 직접입력'); return; }
        window.QrScanner.show(function (text) {
            const no = String(text || '').replace(/\D/g, ''); if (!no || !_coll) return;
            const m = _coll.master; m.meterNo = no; m.type = _collParseType(no) || '';
            m.suffix = _inferSuffix(m.type, m.mac, m.siteComm);
            log('마스터 번호 스캔: ' + no, 'ok');
            renderCollect(); _lookupMaster(no);
        });
    });
};

// 마스터 모뎀맥 QR (맥값 + 스캔화면=모뎀맥 사진 겸용)
window.collScanMac = function () {
    _ensureQrScanner(function (ok) {
        if (!ok || !window.QrScanner) { alert('스캐너 로드 실패 — 맥 직접입력'); return; }
        window.QrScanner.show(function (text, blob) {
            if (!_coll) return; const m = _coll.master;
            m.mac = _modemTo012(text); m.suffix = _inferSuffix(m.type, m.mac, m.siteComm);
            log('맥 스캔: ' + m.mac, 'ok');
            if (blob) { const r = new FileReader(); r.onload = () => { m.slots.mac = { url: r.result }; renderCollect(); }; r.readAsDataURL(blob); }
            else renderCollect();
        });
    });
};
// 마스터 사진 막 올리기(다중) → 빈 슬롯부터 순서대로 자동배치(선택순)
window.collMUpload = function (input) {
    const files = [...(input.files || [])]; if (!files.length) return;
    const n = Math.min(files.length, 8); let done = 0; const imgs = new Array(n);
    files.slice(0, n).forEach((f, i) => { const r = new FileReader(); r.onload = () => { imgs[i] = { url: r.result }; if (++done === n) _placeMasterPhotos(imgs); }; r.readAsDataURL(f); });
    input.value = '';
};
function _placeMasterPhotos(imgs) {
    const m = _coll.master; let idx = 0;
    ['pre', 'mac', 'post1', 'post2'].forEach(k => { if (!m.slots[k] && idx < imgs.length) m.slots[k] = imgs[idx++]; });
    renderCollect();
}
window.collMClearSlot = function (k) { if (_coll) { _coll.master.slots[k] = null; renderCollect(); } };

// ── 슬래이브 (사진 = 각 계기). 일괄/개별 업로드, 번호 입력/QR, 삭제, 드래그 reorder ──
window.collSUpload = function (input) {
    const files = [...(input.files || [])]; if (!files.length) return;
    let done = 0; const arr = new Array(files.length);
    files.forEach((f, i) => { const r = new FileReader(); r.onload = () => { arr[i] = { meterNo: '', type: '', photo: r.result, incl: true }; if (++done === files.length) { _coll.slaves.push(...arr.filter(Boolean)); renderCollect(); } }; r.readAsDataURL(f); });
    input.value = '';
};
window.collSSetNo = function (i, v) { if (!_coll) return; const s = _coll.slaves[i]; if (s) { s.meterNo = String(v || '').trim(); s.type = _collParseType(s.meterNo) || ''; } };
window.collSScan = function (i) { _ensureQrScanner(function (ok) { if (!ok || !window.QrScanner) { alert('스캐너 실패'); return; } window.QrScanner.show(function (text) { const no = String(text || '').replace(/\D/g, ''); if (no && _coll && _coll.slaves[i]) { _coll.slaves[i].meterNo = no; _coll.slaves[i].type = _collParseType(no) || ''; renderCollect(); } }); }); };
window.collSDel = function (i) { if (!_coll) return; _coll.slaves.splice(i, 1); renderCollect(); };
// 계기번호 먼저 — 빈 카드(사진 슬롯 빈) 추가. 사진은 나중에 그 카드 슬롯 탭/드래그로.
window.collSAddNo = function () { if (!_coll) return; _coll.slaves.push({ meterNo: '', type: '', photo: '', incl: true }); renderCollect(); };
window.collSToggleIncl = function (i) { if (_coll && _coll.slaves[i]) { _coll.slaves[i].incl = !_coll.slaves[i].incl; renderCollect(); } };
// 빈 카드에 사진 채우기 (사진 슬롯 탭 → 개별 선택)
window.collSSetPhoto = function (i, input) { const f = input.files && input.files[0]; if (!f || !_coll) return; const r = new FileReader(); r.onload = () => { if (_coll.slaves[i]) { _coll.slaves[i].photo = r.result; renderCollect(); } }; r.readAsDataURL(f); input.value = ''; };
// 이 슬래이브를 마스터로 승격 (어느게 마스터인지 현장서 정함 — 큐보내기는 마스터 미지정). 기존 마스터는 슬래이브로.
window.collSMakeMaster = function (i) {
    if (!_coll) return; const s = _coll.slaves[i]; if (!s) return;
    const m = _coll.master;
    if (m.meterNo) _coll.slaves.push({ meterNo: m.meterNo, type: m.type, photo: (m.slots.post1 && m.slots.post1.url) || '', incl: true });
    m.meterNo = s.meterNo; m.type = s.type; m.siteComm = ''; m.bdju = '';
    m.suffix = _inferSuffix(m.type, m.mac, m.siteComm);
    if (s.photo && !m.slots.post1) m.slots.post1 = { url: s.photo };   // 슬래이브 계기사진 → 마스터 계기슬롯
    _coll.slaves.splice(i, 1);
    _lookupMaster(m.meterNo);
    log('마스터 변경 → ' + m.meterNo, 'ok');
    renderCollect();
};

// ── 포인터 드래그 (마스터 슬롯 swap / 슬래이브 reorder). touch-action은 드래그 요소(.mslot.filled/.scard-handle)에만 → 페이지 스크롤 보존. ──
let _drag = null;
function _dragInit() {
    if (_dragInit._done) return; _dragInit._done = true;
    document.addEventListener('pointerdown', e => {
        if (_drag) { try { if (_drag.ghost) _drag.ghost.remove(); } catch (x) {} _drag = null; }   // 이전 잔존 정리(안전망 — stuck 방지)
        const ov = document.getElementById('collect-overlay'); if (!ov || ov.style.display !== 'block' || !_coll) return;
        const slot = e.target.closest('.mslot.filled');
        const sh = e.target.closest('.scard-handle');
        if (slot) _startDrag(e, { type: 'mslot', key: slot.dataset.slot }, slot, slot.querySelector('img'));
        else if (sh) { const card = sh.closest('.scard'); if (card) _startDrag(e, { type: 'sreorder', idx: +card.dataset.si }, card, sh.querySelector('img')); }
    });
    document.addEventListener('pointermove', e => {
        if (!_drag) return; e.preventDefault();
        _moveGhost(e.clientX, e.clientY);
        _hot(e.clientX, e.clientY, _drag.type === 'mslot' ? '.mslot' : '.scard');
    });
    // 드래그 종료 — swap/reorder 중 에러가 나도 _drag를 반드시 null로(finally) → stuck으로 터치 전체 마비되는 것 방지
    const end = e => {
        if (!_drag) return;
        const d = _drag;
        try {
            const t = _hot(e.clientX, e.clientY, d.type === 'mslot' ? '.mslot' : '.scard');
            if (t && _coll) {
                if (d.type === 'mslot') { const to = t.dataset.slot, fr = d.key; const s = _coll.master.slots; const tmp = s[to]; s[to] = s[fr]; s[fr] = tmp; }
                else { const to = +t.dataset.si, fr = d.idx; if (to !== fr && !isNaN(to) && _coll.slaves[fr]) { const a = _coll.slaves; const mv = a.splice(fr, 1)[0]; a.splice(to, 0, mv); } }
            }
        } catch (err) { try { log('드래그 오류: ' + err.message, 'err'); } catch (x) {} }
        finally {
            try { if (d.ghost) d.ghost.remove(); } catch (x) {}
            document.querySelectorAll('.drag-src').forEach(x => x.classList.remove('drag-src'));
            document.querySelectorAll('.drop-hot').forEach(x => x.classList.remove('drop-hot'));
            _drag = null;
        }
        renderCollect();
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
}
function _startDrag(e, payload, srcEl, img) {
    e.preventDefault();
    const r = srcEl.getBoundingClientRect();
    const g = document.createElement('div');
    g.style.cssText = 'position:fixed;width:' + Math.min(r.width, 80) + 'px;height:' + Math.min(r.height, 80) + 'px;border-radius:8px;overflow:hidden;pointer-events:none;z-index:99999;transform:translate(-50%,-50%);box-shadow:0 6px 16px rgba(0,0,0,.35);border:2px solid #2563eb;background:#fff';
    if (img) g.innerHTML = '<img src="' + img.src + '" style="width:100%;height:100%;object-fit:cover">';
    document.body.appendChild(g);
    srcEl.classList.add('drag-src');
    _drag = Object.assign({ ghost: g, src: srcEl }, payload);
    _moveGhost(e.clientX, e.clientY);
}
function _moveGhost(x, y) { if (_drag && _drag.ghost) { _drag.ghost.style.left = x + 'px'; _drag.ghost.style.top = y + 'px'; } }
function _hot(x, y, sel) {
    let hot = null;
    document.querySelectorAll('#collect-overlay ' + sel).forEach(s => { const r = s.getBoundingClientRect(); s.classList.remove('drop-hot'); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hot = s; });
    if (hot) hot.classList.add('drop-hot');
    return hot;
}

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

// 마스터 사진 슬롯(드롭존+드래그 swap). cur={url}|null
function _mslotHtml(k, lbl) {
    const cur = _coll.master.slots[k];
    return `<div class="mslot${cur ? ' filled' : ''}" data-slot="${k}" style="flex:1;aspect-ratio:1;border:2px ${cur ? 'solid #059669' : 'dashed #cbd5e1'};border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;color:${cur ? '#059669' : '#94a3b8'};background:${cur ? '#ecfdf5' : '#f8fafc'};overflow:hidden;position:relative;${cur ? 'touch-action:none;cursor:grab' : ''}">`
        + (cur ? `<img src="${cur.url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none">` : '')
        + `<span class="lbl" style="position:relative;z-index:1;background:rgba(255,255,255,.8);padding:1px 4px;border-radius:3px;font-weight:700">${_esc(lbl)}${cur ? ' ✓' : ''}</span>`
        + (cur ? `<button onclick="collMClearSlot('${k}')" style="position:absolute;top:2px;right:2px;z-index:3;width:18px;height:18px;line-height:1;padding:0;background:rgba(220,38,38,.92);color:#fff;border:none;border-radius:9px;font-size:11px">×</button>` : '')
        + `</div>`;
}

function renderCollect() {
    if (!_coll) return;
    _dragInit();
    const el = _collOverlay();
    const set = _coll.settings || _amiqSettings();
    const dept2 = (typeof JISA_DEPT2 !== 'undefined' && JISA_DEPT2[_coll.jisa]) || '';
    const m = _coll.master;
    const fclty = _fcltyOf(1, 0, _coll.slaves.length, _coll.hamType);
    const commName = _SUFFIX_COMM[m.suffix] || '';
    const commSel = COMM_OPTS.map(([v, l]) => `<option value="${v}"${m.suffix === v ? ' selected' : ''}>${_esc(l)}</option>`).join('');

    // 마스터 카드 (계기번호+맥+QR+통신 / 4슬롯 드래그 / 막올리기)
    const master = `<div class="card" style="margin:0 0 12px;padding:0;overflow:hidden;border:2px solid #2563eb;border-radius:10px">`
        + `<div style="background:#1e40af;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">`
        + `<div style="font-size:14px;font-weight:700">마스터</div><div style="font-size:11px;opacity:.9">${_esc(fclty.label)}(${fclty.div})</div></div>`
        + `<div style="display:flex;gap:6px;padding:8px 10px;align-items:center">`
        + `<input value="${_esc(m.meterNo)}" oninput="collMSetNo(this.value)" onblur="collMBlur()" placeholder="마스터 계기번호" inputmode="numeric" style="flex:1;padding:9px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;font-weight:700">`
        + `<button onclick="collScanMNo()" style="flex:0 0 50px;padding:9px 0;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700">QR</button>`
        + `<span style="font-size:11px;color:#6b7280">${_esc(m.type || '?')}타입</span></div>`
        + `<div style="display:flex;gap:6px;padding:0 10px 8px;align-items:center">`
        + `<input value="${_esc(m.mac)}" oninput="collMSetMac(this.value)" onblur="collMBlur()" placeholder="모뎀맥" style="flex:1;padding:9px;border:1px solid #d1d5db;border-radius:6px;font-size:14px">`
        + `<button onclick="collScanMac()" style="flex:0 0 50px;padding:9px 0;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700">QR</button>`
        + `<select onchange="collMSetSuffix(this.value)" style="flex:0 0 90px;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px">${commSel}</select></div>`
        + (commName ? '' : `<div style="font-size:10px;color:#dc2626;padding:0 10px 6px">통신방식 미판별 — 직접 선택</div>`)
        + (m.type === 'AE' ? `<div style="padding:0 10px 8px"><label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" ${m.ext === 'Y' ? 'checked' : ''} onchange="collMSetExt(this.checked)">외장형 연결장치(etype)</label></div>` : '')
        + (_showBdju(m.suffix) && m.bdju ? `<div style="font-size:11px;color:#6b7280;padding:0 10px 6px">변대주 ${_esc(m.bdju)}</div>` : '')
        + `<div style="padding:8px 10px;background:#f8fafc">`
        + `<div style="font-size:11px;color:#6b7280;margin-bottom:6px">마스터 사진 — 4장 올리면 자동배치, 슬롯끼리 끌어 순서변경</div>`
        + `<div style="display:flex;gap:5px">${_mslotHtml('pre', '시공전')}${_mslotHtml('mac', '모뎀맥')}${_mslotHtml('post1', '계기')}${_mslotHtml('post2', '전체')}</div>`
        + `<label style="display:block;margin-top:7px;padding:9px;background:#ede9fe;color:#5b21b6;border-radius:8px;font-size:12px;font-weight:700;text-align:center">+ 마스터 사진 막 올리기<input type="file" accept="image/*" multiple style="display:none" onchange="collMUpload(this)"></label>`
        + `</div></div>`;

    // 슬래이브 (사진 = 각 계기. 드래그 reorder + 번호 + 삭제)
    let slaves = `<div style="font-size:13px;font-weight:700;color:#374151;margin:0 2px 6px">슬래이브 ${_coll.slaves.length}건 <span style="font-weight:400;color:#9ca3af;font-size:11px">— 사진=각 계기, 끌어서 순서변경 / 계기번호 입력</span></div>`;
    slaves += _coll.slaves.map((s, i) =>
        `<div class="scard" data-si="${i}" style="display:flex;gap:10px;align-items:center;background:#fff;border:1px solid ${s.incl !== false ? '#e5e7eb' : '#d1d5db'};border-radius:10px;padding:7px;margin-bottom:7px;${s.incl !== false ? '' : 'opacity:.5;'}">`
        + (s.photo
            ? `<div class="scard-handle" style="flex:0 0 74px;height:74px;border-radius:8px;overflow:hidden;touch-action:none;cursor:grab;position:relative;background:#000"><img src="${s.photo}" style="width:100%;height:100%;object-fit:cover;pointer-events:none"></div>`
            : `<label style="flex:0 0 74px;height:74px;border:2px dashed #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;background:#f8fafc">사진<input type="file" accept="image/*" style="display:none" onchange="collSSetPhoto(${i},this)"></label>`)
        + `<div style="flex:1;display:flex;flex-direction:column;gap:5px">`
        + `<div style="display:flex;gap:6px"><input value="${_esc(s.meterNo)}" oninput="collSSetNo(${i},this.value)" placeholder="계기번호" inputmode="numeric" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:15px;font-weight:700">`
        + `<button onclick="collSScan(${i})" style="flex:0 0 42px;padding:8px 0;background:#7c3aed;color:#fff;border:none;border-radius:6px;font-size:11px">QR</button></div>`
        + `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;color:#9ca3af">${_esc(s.type || '?')}타입 · 분기 ${_bungi(m.suffix, s.type)}</span>`
        + `<button onclick="collSMakeMaster(${i})" style="font-size:10px;padding:3px 8px;background:#dbeafe;color:#1e40af;border:none;border-radius:5px;font-weight:700">마스터로</button></div></div>`
        + `<div style="flex:0 0 auto;display:flex;flex-direction:column;gap:5px;align-items:center">`
        + `<button onclick="collSDel(${i})" style="width:26px;height:26px;padding:0;background:#fee2e2;color:#b91c1c;border:none;border-radius:13px;font-size:14px">×</button>`
        + `<button onclick="collSToggleIncl(${i})" style="font-size:9px;padding:3px 6px;background:${s.incl !== false ? '#dcfce7' : '#f3f4f6'};color:${s.incl !== false ? '#15803d' : '#9ca3af'};border:none;border-radius:6px;font-weight:700;white-space:nowrap">${s.incl !== false ? '포함' : '제외'}</button>`
        + `</div></div>`
    ).join('');
    slaves += `<div style="display:flex;gap:6px;margin-bottom:6px">`
        + `<label style="flex:1;padding:11px;background:#4338ca;color:#fff;border-radius:8px;font-size:12px;font-weight:700;text-align:center">사진 한꺼번에<input type="file" accept="image/*" multiple style="display:none" onchange="collSUpload(this)"></label>`
        + `<label style="flex:1;padding:11px;background:#e0e7ff;color:#3730a3;border-radius:8px;font-size:12px;font-weight:700;text-align:center">사진 하나씩<input type="file" accept="image/*" style="display:none" onchange="collSUpload(this)"></label>`
        + `<button onclick="collSAddNo()" style="flex:1;padding:11px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;font-size:12px;font-weight:700">+ 계기번호</button></div>`;

    el.innerHTML =
        `<div style="background:#1e3a8a;color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center">`
        + `<div><div style="font-size:15px;font-weight:700">awms 설비등록 수집</div><div style="font-size:11px;opacity:.85;margin-top:2px">${_esc(_coll.addr || '직접입력')}</div></div>`
        + `<div style="display:flex;gap:6px"><button onclick="__settingsOpen()" style="background:#4f46e5;color:#fff;padding:8px 12px;font-size:13px">설정</button><button onclick="collClose()" style="background:#374151;color:#fff;padding:8px 12px;font-size:13px">닫기</button></div></div>`
        + `<div style="background:#fff;padding:8px 16px;border-bottom:1px solid #e5e7eb;font-size:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">`
        + `<span><b>${_esc(_coll.jisa || '지사미설정')}</b>${dept2 ? '(' + dept2 + ')' : ''}</span>`
        + (set.busiName ? `<span style="color:#6b7280">${_esc(set.busiName)}</span>` : '')
        + `<span onclick="collToggleMode()" style="cursor:pointer;background:#eef2ff;color:#3730a3;padding:3px 9px;border-radius:12px;user-select:none">작업방식 <b>${_esc(_coll.workMode)}</b></span>`
        + `<span onclick="collToggleHam()" style="cursor:pointer;background:#eef2ff;color:#3730a3;padding:3px 9px;border-radius:12px;user-select:none">함체 <b>${_esc(_coll.hamType)}</b></span>`
        + (set.worker1 ? `<span style="color:#6b7280">작업자 ${_esc(set.worker1)}${set.worker2 ? ',' + _esc(set.worker2) : ''}</span>` : `<span style="color:#dc2626">작업자 미설정</span>`)
        + `</div>`
        + `<div style="padding:12px;max-width:620px;margin:0 auto">`
        + master + slaves
        + `<button class="btn-green" style="width:100%;margin-top:6px;padding:14px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:15px" onclick="collSubmit()">완료 — 큐에 담기</button>`
        + `<div style="height:40px"></div></div>`;
    el.style.display = 'block';
}

// ── 큐에 담기: pool → boxes (마스터그룹). 시설유형 자동산출. 출력 스키마 보존(consumer=amiqueue-saveact.js). ──
window.collSubmit = async function () {
    if (!_coll) return;
    const m = _coll.master;
    if (!m.meterNo) { alert('마스터 계기번호를 입력하세요'); return; }
    if (!m.suffix && !confirm('통신방식 미선택. saveAct 오류 가능.\n계속할까요?')) return;
    const inclSlaves = _coll.slaves.filter(s => s.incl !== false);   // 이번 그룹
    const restSlaves = _coll.slaves.filter(s => s.incl === false);   // 남길 것(다음 마스터)
    const noNo = inclSlaves.filter(s => !s.meterNo);
    if (noNo.length && !confirm('계기번호 없는 슬래이브 ' + noNo.length + '건. 계속할까요?')) return;
    const set = _coll.settings || _amiqSettings();
    const slaveCnt = inclSlaves.length;
    const fclty = _fcltyOf(1, 0, slaveCnt, _coll.hamType);
    const cnt = 1 + slaveCnt;
    const ph = k => (m.slots[k] && m.slots[k].url) || '';   // slots[k]={url} → dataURL
    const boxMaster = {
        meterNo: m.meterNo, meterType: m.type, mac: m.mac,
        comm: _SUFFIX_COMM[m.suffix] || '', commSuffix: m.suffix,
        fcltyDiv: fclty.div, fcltyLabel: fclty.label,
        mbMeterId: fclty.div === '10' ? '' : m.meterNo,
        mbCnt: fclty.div === '10' ? '' : String(cnt),
        ext: m.ext || 'N', extConn: m.ext || 'N', bdju: m.bdju || '', workDiv: m.workDiv || 'M1010',
        photos: { pre: ph('pre'), mac: ph('mac'), post1: ph('post1'), post2: ph('post2') },
        slaves: inclSlaves.map(s => ({ meterNo: s.meterNo, meterType: s.type, bungi: _bungi(m.suffix, s.type), photo: s.photo || '' })),
    };
    const rec = {
        workMode: _coll.workMode, addr: _coll.addr || '', jisa: _coll.jisa || '', workDiv: m.workDiv || 'M1010',
        busiName: set.busiName || '', busiNum: set.busiNum || '',
        workers: { w1: set.worker1 || '', w1Seq: set.worker1Seq || '', w2: set.worker2 || '', w2Seq: set.worker2Seq || '', w3: set.worker3 || '', w3Seq: set.worker3Seq || '' },
        createdAt: new Date().toISOString(), createdBy: 'amiqueue', createdByName: '아미큐수집',
        status: 'pending', boxes: [{ hamType: _coll.hamType, masters: [boxMaster] }],
    };
    if (!confirm((_coll.addr || m.meterNo) + '\n마스터 ' + m.meterNo + ' · 슬래이브 ' + slaveCnt + '건 큐에 담습니다.' + (restSlaves.length ? '\n(남은 ' + restSlaves.length + '건은 유지 — 다음 마스터로 계속)' : ''))) return;
    try {
        const ref = await _db.ref('datapush_queue').push(rec);
        log('큐 담기 완료 → ' + ref.key + ' (슬래이브 ' + slaveCnt + ')', 'ok');
        if (typeof refreshQueue === 'function') refreshQueue();
        if (restSlaves.length) {
            // 남은 계기로 계속 — 마스터 리셋, 남은 슬래이브만 유지(다시 포함 상태로)
            restSlaves.forEach(s => { s.incl = true; });
            _coll.master = { meterNo: '', type: '', siteComm: '', bdju: '', mac: '', suffix: '', ext: 'N', workDiv: 'M1010', slots: { pre: null, mac: null, post1: null, post2: null } };
            _coll.slaves = restSlaves;
            log('남은 ' + restSlaves.length + '건으로 계속 — 다음 마스터 지정', 'warn');
            renderCollect();
            alert('담았습니다. 남은 ' + restSlaves.length + '건이 슬래이브로 남아있습니다.\n다음 마스터를 [마스터로] 또는 번호 입력으로 지정하세요.');
        } else {
            if (_coll.key) { try { await _db.ref('collect_handoff/' + _coll.key).remove(); } catch (e) {} }
            _coll = null; collClose();
            alert('큐에 담았습니다. [큐] 화면에서 확인하세요.');
        }
    } catch (e) { alert('큐 담기 실패: ' + e.message); log('큐 담기 실패: ' + e.message, 'err'); }
};

// collect.js 로드 완료 시점에 이미 awms 세션이 연결돼 있으면 자동로드 트리거.
// (app.js checkSession이 collect 동적로드보다 먼저 끝난 경우 — session.js의 호출은 그때 __amiqAutoLoad 미정의라 스킵됨)
try { if (typeof isSessionOK === 'function' && isSessionOK() && typeof window.__amiqAutoLoad === 'function') { window.__amiqAutoLoad(); } } catch (e) {}
