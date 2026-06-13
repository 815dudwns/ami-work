// 종로 Firebase 큐 + awms 완료 동기화

// ─────────────────────────────────────────────
// _friendlyError — 원본 에러 문자열 → {label, hint}
//   표시용 변환. 원본(raw)은 Firebase에 그대로 저장(덮어쓰지 않음).
//   queue.js, app.js 양쪽에서 사용 가능한 전역 함수.
// ─────────────────────────────────────────────
function _friendlyError(rawMsg) {
    if (!rawMsg) return { label: '미분류 오류', hint: '로그 확인' };
    const s = String(rawMsg).toLowerCase();
    if (s.includes('500') || s.includes('키부족') || s.includes('getdetail')) {
        return { label: '신설 저장 실패 — 서버 500 (getDetail 키부족)', hint: '재등록 시 대부분 해결' };
    }
    if (s.includes('계기 없음') || s.includes('해당 계기')) {
        return { label: 'awms에 계기 미등록', hint: '계기번호 확인' };
    }
    if (s.includes('cntr_no') || s.includes('계약')) {
        return { label: '계약정보(CNTR_NO) 없음', hint: '주소·계기 확인' };
    }
    if (s.includes('봉인')) {
        return { label: '봉인번호 없음 — 세션 만료 가능', hint: 'awms 재로그인' };
    }
    if (s.includes('failed to fetch') || s.includes('fetch') || s.includes('네트워크') || s.includes('networkerror')) {
        return { label: '네트워크 끊김', hint: '통신 확인' };
    }
    return { label: '미분류 오류', hint: '로그 확인' };
}

let _db = null;
let _queue = [];  // {addr, meter, rep, status:'pending'|'err'|'done', err?, site}
let _completedNewMeters = new Set();  // syncCompleted에서 채움
let _siteMap = {};         // 계기번호 → site-data(도로명주소/계약종별/계약전력 등)
let _dateFilter = 'all';   // 날짜별 보기 필터

// 지침 칸 라벨
const FIELD_LABEL = { whme_day: '주간', whme_mngt: '야간', dm_mt_day: '최대전력', var_day: '무효' };

// ─────────────────────────────────────────────
// site-data 로더 — 계기번호→도로명주소/계약종별/계약전력 (앱 시작 1회, 메모리 캐시)
//   jongno-site-data.json (9651건) github pages fetch. 실패해도 큐 정상(도로명만 생략).
// ─────────────────────────────────────────────
async function loadSiteMap() {
    try {
        const r = await fetch('https://815dudwns.github.io/jongno-combined/data/jongno-site-data.json', { cache: 'force-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const arr = await r.json();
        _siteMap = {};
        for (const s of (Array.isArray(arr) ? arr : [])) {
            if (s && s.계기번호) _siteMap[String(s.계기번호).trim()] = s;
        }
        log(`site-data 로드: ${Object.keys(_siteMap).length}건`, 'ok');
    } catch (e) {
        log('site-data 로드 실패(도로명 생략): ' + e.message, 'warn');
    }
}

// KST 날짜키
function _dateKey(ms) {
    return ms ? new Date(ms).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
}
// 지침값 표기 — 주간/야간/최대전력/무효 라벨
function _fmtReadings(rep) {
    const rvs = rep.removal_values;
    if (rvs && typeof rvs === 'object') {
        const parts = [];
        for (const k of ['whme_day', 'whme_mngt', 'dm_mt_day', 'var_day']) {
            if (rvs[k] != null && rvs[k] !== '') parts.push(`${FIELD_LABEL[k]} <b>${escapeHtml(rvs[k])}</b>`);
        }
        if (parts.length) return parts.join(' · ');
    }
    return rep.removal_value != null ? `주간 <b>${escapeHtml(rep.removal_value)}</b>` : '-';
}

function initFb() {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    _db = firebase.database(app);
    log('Firebase 연결 [JS:remote-r4 찾기진단] ' + firebaseConfig.databaseURL.split('/').pop(), 'ok');
}

// ─────────────────────────────────────────────
// refreshQueue — 큐 탭 진입/새로고침 시 호출
// ─────────────────────────────────────────────
async function refreshQueue() {
    // ★ 새로고침마다 세션 재확인 — awms 로그인 직후 즉시 반영 (영준님 지적: 새로고침=세션 재확인).
    //   _sessionOK·세션바 UI는 checkSession에서만 갱신되므로, 이게 없으면 로그인해도 5분 주기까지 "세션 없음" 잔존.
    if (typeof checkSession === 'function') await checkSession();
    const ok = await syncCompleted();   // 1. awms 완료 수신 (세션+완료대조)
    if (!ok) {
        // [구현 3] 캐시 깜빡임 수정:
        //   _queue가 이미 차 있으면(캐시 즉시렌더로 채워진 상태) 비우지 않고 유지.
        //   안전성: 등록(runOne/_runBatch)은 isSessionOK() 가드로 세션 없으면 막히므로
        //   캐시 표시를 유지해도 중복 등록 위험 없음. 캐시의 done/pending 표시는
        //   지난 완료대조 기준이라 표시용으로 충분.
        if (_queue.length > 0) {
            // 캐시 상태 유지 + 안내만 표시
            log('awms 미연결 — 화면은 캐시 표시 중 (awms 로그인하면 최신 반영)', 'warn');
            // 세션바에 안내 메시지 추가 (updateSessionBar 있으면 활용)
            if (typeof setSessionBarMsg === 'function') {
                setSessionBarMsg('awms 세션 없음 — 큐 화면은 캐시 기준 (로그인 후 새로고침)');
            }
            return;
        }
        // _queue가 비어있을 때만 기존대로 빈 화면
        _queue = [];
        if (typeof renderQueue === 'function') renderQueue();
        log('awms 로그인 + 완료대조 필요 — 큐 숨김(중복 방지)', 'warn');
        return;
    }
    await loadQueue();       // 2. 큐 갱신 (완료대조 통과 = 안 올라간 것만)
}

// ─────────────────────────────────────────────
// djb2 해시 — rows 내용 기반 변화 감지 (dedup)
// ─────────────────────────────────────────────
function _djb2Hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
        h = h >>> 0;  // 32비트 양수 유지
    }
    return h.toString(16);
}

// ─────────────────────────────────────────────
// syncCompleted — awms workStep=28 완료목록 수신
//   (a) 변화시만 ami-work awmscomplete/ 에 PUT (dedup)
//   (b) _completedNewMeters Set 갱신 → loadQueue에서 중복 제외
// ─────────────────────────────────────────────
async function syncCompleted() {
    try {
        const rows = await _fetchAllCompleted();
        if (!rows) return false;  // 세션 없음/완료대조 실패 → 큐 표시 보류(중복 방지)

        // dedup: rows 내용 해시 계산 — count가 아니라 content(WORK_STEP·WHM_NO·CREMO_WHM_NO) 기반
        const rowsHash = _djb2Hash(JSON.stringify(rows));
        const lastHash = localStorage.getItem('awmsq_last_pushed_hash');
        const changed = (rowsHash !== lastHash);

        if (!changed) {
            log('완료목록 변화 없음 — PUT 생략', 'ok');
        } else {
            // (a) ami-work DB에 PUT (raw fetch — SDK는 ami-jongno용)
            const payload = {
                at: Date.now(),
                busiKey: '397820263153',
                title: '14차',
                count: rows.length,
                total: (rows[0] && rows[0].CNT) || rows.length,  // 서버 보고 총건수
                rows,
            };
            // 고정키 latest로 덮어쓰기 — 매번 c{타임스탬프} 새 키 생성하던 940KB 누적 종료.
            // 종로 sync-meter-from-awms.html은 shallow로 최신 키 1개만 읽으므로 호환 유지(키 1개=항상 latest).
            const putUrl = `${AWMS_WORK_DB}/awmscomplete/latest.json`;
            try {
                const pr = await fetch(putUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (pr.ok) {
                    log(`awmscomplete PUT 완료: ${rows.length}건`, 'ok');
                    // PUT 성공 시에만 해시 저장 — 실패 시 저장 안 함 → 다음 syncCompleted에서 재시도
                    localStorage.setItem('awmsq_last_pushed_hash', rowsHash);
                } else {
                    log(`awmscomplete PUT 실패: HTTP ${pr.status}`, 'warn');
                }
            } catch (e) {
                log('awmscomplete PUT 오류: ' + e.message, 'warn');
            }

        }

        // (b) 완료/임시저장 계기 Set — changed 여부와 무관하게 항상 갱신
        //   ★ dedup 스킵 경로에서도 Set 재구성 필수 — 비워두면 loadQueue가 전 항목을 pending으로 오판
        _completedNewMeters = new Set();
        rows.forEach(r => {
            if (r.WHM_NO) _completedNewMeters.add(String(r.WHM_NO).trim());
            if (r.CREMO_WHM_NO) _completedNewMeters.add(String(r.CREMO_WHM_NO).trim());
        });
        log(`완료 Set 갱신: ${_completedNewMeters.size}건`);

        // changed일 때 awmsDoneMeters PUT (Set 갱신 후 정확한 값으로)
        if (changed) {
            try {
                await fetch(`${AWMS_WORK_DB}/awmsDoneMeters.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([..._completedNewMeters])
                });
            } catch (e) { /* 통계용 보조 — 실패해도 큐 동작 무관 */ }
        }

        // 조회 성공 = awms 세션 살아있음 → 세션바/isSessionOK 갱신 (앱시작 시 false 고정 해소)
        _sessionOK = true;
        if (!_sessionInfo) _sessionInfo = { userName: 'awms 연결됨' };
        if (typeof updateSessionBar === 'function') updateSessionBar();
        return true;  // 세션+완료대조 성공

    } catch (e) {
        // awmsEval reject는 이 catch로 올 수 없음 (_fetchAllCompleted에서 처리)
        log('syncCompleted 예외: ' + e.message, 'err');
        return false;
    }
}

// awms workStep=28 전체 페이지 수집 (1000건 단위)
// 세션 없으면 조용히 null 반환 + 상태바 업데이트
async function _fetchAllCompleted() {
    const ROW_COUNT = 1000;
    const all = [];

    try {
        // 전차수 getBusiList → 각 차수 완료(28) 수집 — 중복등록 제외용(14차 고정 아님, 모든 차수 커버)
        const busiList = await awmsEval(`fetch('/ami/mob/mtr/mobMtr1000/getBusiList?DEPT1=3970',{credentials:'include'}).then(r=>r.json())`);
        const conss = (Array.isArray(busiList) ? busiList : []).map(b => b.CONS_NO).filter(Boolean);
        for (const cons of conss) {
            let page = 1;
            while (page <= 30) {
                const expr = `fetch('/ami/mob/mtr/mobMtr1000/getMainList?FLAG=1&DEPT1=3970&busiKey=${cons}&searchVal=&sortKey=&workStep=25,28&pPageNo=${page}&pRowCount=${ROW_COUNT}',{credentials:'include'}).then(r=>r.json())`;
                const data = await awmsEval(expr);
                // 응답 정규화: 배열/{data}/{list} 형태 모두 처리
                const arr = Array.isArray(data) ? data
                    : (data && Array.isArray(data.data)) ? data.data
                    : (data && Array.isArray(data.list)) ? data.list
                    : null;
                if (!arr || arr.length === 0) break;
                all.push(...arr);
                if (arr.length < ROW_COUNT) break;
                page++;
            }
        }
        return all;
    } catch (e) {
        // AwmsQ 브릿지 없음(웹 미리보기) 또는 세션 만료
        const msg = e.message && e.message.includes('AwmsQ 브릿지 없음')
            ? '웹 미리보기 모드 — awms 완료 수신 생략'
            : '세션 만료 — awms 열어 로그인';
        setSessionBarMsg(`awms 세션: 없음 — ${msg}`);
        log('syncCompleted skip: ' + msg, 'warn');
        return null;
    }
}

// ─────────────────────────────────────────────
// _buildQueueFrom — workStatus 객체(ws)로 _queue 구성 + renderQueue
//   캐시 즉시 렌더 및 라이브 갱신 양쪽에서 공유
// ─────────────────────────────────────────────
function _buildQueueFrom(ws) {
    const items = [];
    for (const [addr, v] of Object.entries(ws)) {
        const reps = v.replacement_list || {};
        for (const [meter, rep] of Object.entries(reps)) {
            if (rep.source) continue;                  // import류(source 태그: awms/kepco_jungong 등)는 큐 제외 — 우리 실작업(source 없음)만 등록 대상
            if (!rep.new_meter_id) continue;           // 신계기 없으면 미완성(실작업 아님)
            // 상태 = awms 라이브 대조. 등록돼도 안 사라지고 '등록완료'로 표시(영준님 지시).
            const inAwms = _completedNewMeters.has(String(meter).trim()) || _completedNewMeters.has(String(rep.new_meter_id).trim());
            const status = rep.awms_error ? 'err' : (inAwms ? 'done' : 'pending');
            items.push({
                addr, meter, rep,
                status,
                err: rep.awms_error || null,
                site: _siteMap[String(meter).trim()] || {},
            });
        }
    }
    // 정렬: 실패(0) → 대기(1) → 완료(2), 그 안에서 daily_seq 오름차순
    const rank = s => (s === 'err' ? 0 : s === 'pending' ? 1 : 2);
    items.sort((a, b) => rank(a.status) - rank(b.status) || (a.rep.daily_seq || 0) - (b.rep.daily_seq || 0));
    _queue = items;
    renderQueue();
    const c = s => items.filter(i => i.status === s).length;
    log(`큐 구성: 대기 ${c('pending')} / 실패 ${c('err')} / 완료 ${c('done')}`, 'ok');
}

// ─────────────────────────────────────────────
// loadQueue — ami-jongno workStatus/jongno 읽어 큐 구성
// ─────────────────────────────────────────────
async function loadQueue() {
    if (!_db) initFb();
    log('동기화 큐 조회 중...');
    const snap = await _db.ref('workStatus/jongno').once('value');
    const ws = snap.val() || {};

    _buildQueueFrom(ws);
    log('큐 조회 완료', 'ok');

    // 캐시 저장 — 다음 앱 시작 시 즉시 렌더용 (표시 전용)
    try {
        localStorage.setItem('awmsq_cache_completed', JSON.stringify([..._completedNewMeters]));
        localStorage.setItem('awmsq_cache_workstatus', JSON.stringify(ws));
    } catch (e) {
        // QuotaExceededError 등 — 조용히 스킵 (캐시 저장 실패해도 라이브 동작 무관)
        log('캐시 저장 스킵(용량 부족): ' + e.message, 'warn');
    }
}

// ─────────────────────────────────────────────
// renderQueue — 큐 카드 렌더링 + 요약 업데이트
// ─────────────────────────────────────────────
// KST 월키 (예: "2026년 6월")
function _monthKey(ms) {
    return ms ? new Date(ms).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long' }) : '-';
}
// 가용 날짜(오름차순) / 날짜→월
function _qDates() {
    // dateKey("2026. 6. 10.") → 대표 ms 매핑 후 시간순 정렬.
    // (문자열 sort는 일 자릿수 때문에 "6. 10."이 "6. 8."보다 앞서는 버그 → 오늘이 최신자리에서 밀림)
    const m = new Map();
    _queue.forEach(i => {
        const ms = (i && i.rep && i.rep.replaced_at) || 0;
        const k = _dateKey(ms);
        if (!m.has(k) || ms < m.get(k)) m.set(k, ms);
    });
    return Array.from(m.keys()).sort((a, b) => m.get(a) - m.get(b));
}
function _qMonthOf(dk) { const it = _queue.find(i => _dateKey(i.rep.replaced_at) === dk); return it ? _monthKey(it.rep.replaced_at) : ''; }

// ◀ 날짜 ▶ 이동
function _navDate(dir) {
    const dates = _qDates();
    if (!dates.length) return;
    if (_dateFilter === 'all') { _dateFilter = dates[dates.length - 1]; renderQueue(); return; }  // 전체→최신부터
    let idx = dates.indexOf(_dateFilter);
    if (idx < 0) idx = dates.length - 1;
    idx = Math.max(0, Math.min(dates.length - 1, idx + dir));
    _dateFilter = dates[idx];
    renderQueue();
}

// 날짜바 (동적 생성) — 월 드롭다운 + ◀ 날짜 ▶
function _ensureDateBar() {
    let bar = document.getElementById('date-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'date-bar';
        bar.style.cssText = 'padding:8px 12px;display:flex;gap:6px;align-items:center';
        bar.innerHTML =
            '<select id="month-select" style="padding:8px;border-radius:8px;border:1px solid #d1d5db;font-size:13px"></select>'
            + '<button id="date-prev" style="padding:6px 14px;border:none;border-radius:8px;background:#e5e7eb;font-size:16px;font-weight:700">◀</button>'
            + '<div id="date-label" style="flex:1;text-align:center;font-size:14px;font-weight:700;color:#1f2937"></div>'
            + '<button id="date-next" style="padding:6px 14px;border:none;border-radius:8px;background:#e5e7eb;font-size:16px;font-weight:700">▶</button>';
        const list = document.getElementById('queue-list');
        if (list && list.parentNode) list.parentNode.insertBefore(bar, list);
        document.getElementById('date-prev').onclick = function () { _navDate(-1); };
        document.getElementById('date-next').onclick = function () { _navDate(1); };
        document.getElementById('month-select').onchange = function () {
            const v = this.value;
            if (v === 'all') { _dateFilter = 'all'; }
            else { const inM = _qDates().filter(d => _qMonthOf(d) === v); _dateFilter = inM.length ? inM[inM.length - 1] : 'all'; }
            renderQueue();
        };
    }
    const dates = _qDates();
    const months = Array.from(new Set(dates.map(d => _qMonthOf(d))));
    // 월 select
    const msel = document.getElementById('month-select');
    if (msel) {
        msel.innerHTML = '<option value="all">전체</option>' + months.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('');
        msel.value = (_dateFilter !== 'all' && _qMonthOf(_dateFilter)) ? _qMonthOf(_dateFilter) : 'all';
    }
    // 날짜 라벨 + 버튼 활성
    const cnt = _dateFilter === 'all' ? _queue.length : _queue.filter(i => _dateKey(i.rep.replaced_at) === _dateFilter).length;
    const lbl = document.getElementById('date-label');
    if (lbl) lbl.textContent = (_dateFilter === 'all' ? '전체' : _dateFilter) + ' (' + cnt + ')';
    const idx = dates.indexOf(_dateFilter);
    const prev = document.getElementById('date-prev'), next = document.getElementById('date-next');
    if (prev) { prev.disabled = (_dateFilter !== 'all' && idx <= 0) || !dates.length; prev.style.opacity = prev.disabled ? '0.35' : '1'; }
    if (next) { next.disabled = (_dateFilter === 'all') || (idx >= dates.length - 1); next.style.opacity = next.disabled ? '0.35' : '1'; }
}

// 선택 등록 컨트롤 (전체선택 + 선택 등록 버튼) — 시퀀스 앞 체크박스로 고른 것만 전송
function _ensureSelectControls() {
    let bar = document.getElementById('select-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'select-bar';
        bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:0 12px 8px';
        bar.innerHTML =
            '<label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:#374151">'
            + '<input type="checkbox" id="q-check-all" checked style="width:18px;height:18px"> 전체</label>'
            + '<button id="btn-run-selected" class="btn-green" style="flex:1;padding:10px;font-weight:700">선택 등록</button>';
        const btnAll = document.getElementById('btn-run-all');
        if (btnAll && btnAll.parentNode) {
            btnAll.parentNode.insertBefore(bar, btnAll);
        } else {
            const list = document.getElementById('queue-list');
            if (list && list.parentNode) list.parentNode.insertBefore(bar, list);
        }
        document.getElementById('q-check-all').onchange = function () {
            document.querySelectorAll('.q-check').forEach(c => { c.checked = this.checked; });
        };
        document.getElementById('btn-run-selected').onclick = function () {
            if (typeof runSelected === 'function') runSelected();
        };
    }
}

function renderQueue() {
    _ensureDateBar();
    _ensureSelectControls();

    // 날짜 필터 적용
    const shown = _dateFilter === 'all' ? _queue : _queue.filter(i => _dateKey(i.rep.replaced_at) === _dateFilter);

    const cnt = s => shown.filter(i => i.status === s).length;
    const elPending = document.getElementById('stat-pending');
    const elErr = document.getElementById('stat-err');
    const elDone = document.getElementById('stat-done');
    const btnAll = document.getElementById('btn-run-all');
    if (elPending) elPending.textContent = cnt('pending');
    if (elErr) elErr.textContent = cnt('err');
    if (elDone) elDone.textContent = cnt('done');
    if (btnAll) {
        // 선택 날짜 표시 — 어느 날짜를 일괄등록하는지 명확히 (전체↔날짜 카운트 같아도 라벨로 구분)
        const dLabel = _dateFilter === 'all' ? '전체' : _dateFilter.replace(/\s+/g, '').replace(/\.$/, '');
        const activeCnt = cnt('pending') + cnt('err');
        btnAll.disabled = activeCnt === 0 || !isSessionOK();
        btnAll.textContent = `[${dLabel}] 일괄 등록 (대기 ${cnt('pending')} + 실패 ${cnt('err')}건)`;
    }

    const list = document.getElementById('queue-list');
    if (!list) return;
    if (!shown.length) {
        list.innerHTML = '<div class="card" style="text-align:center;color:#9ca3af;padding:30px">표시할 항목 없음</div>';
        return;
    }

    // 상태별 색상
    const STY = {
        err:     { bd: '#dc2626', bg: 'rgba(220,38,38,.06)',  bdg: 'badge-err',     txt: '실패' },
        pending: { bd: '#d97706', bg: 'rgba(217,119,6,.06)',  bdg: 'badge-pending', txt: '대기' },
        done:    { bd: '#059669', bg: 'rgba(5,150,105,.08)',  bdg: '',              txt: '등록완료' },
    };

    list.innerHTML = shown.slice(0, 200).map(i => {
        const s = STY[i.status] || STY.pending;
        // 선택 등록용 체크박스 — 완료건 제외(대기/실패만 등록 대상)
        const chk = i.status === 'done' ? ''
            : `<input type="checkbox" class="q-check" data-addr="${escapeAttr(i.addr)}" data-meter="${escapeAttr(i.meter)}" checked style="width:20px;height:20px;flex-shrink:0">`;
        const ts = i.rep.replaced_at
            ? new Date(i.rep.replaced_at).toLocaleString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })
            : '-';
        const road = i.site && i.site.도로명주소 ? escapeHtml(i.site.도로명주소) : '';
        const jibun = escapeHtml(i.addr);
        const badgeCls = s.bdg || '';
        const badge = `<span class="badge ${badgeCls}" style="${i.status === 'done' ? 'background:#059669;color:#fff' : ''}">${s.txt}</span>`;
        const seq = i.rep.daily_seq != null ? `<span style="color:#1d4ed8;font-weight:700">#${escapeHtml(i.rep.daily_seq)}</span> ` : '';
        let errMsg = '';
        if (i.err) {
            const fe = _friendlyError(i.err);
            errMsg = `<div class="meta" style="color:#dc2626;font-weight:700">${escapeHtml(fe.label)}</div>`
                   + `<div class="meta" style="color:#9ca3af;font-size:12px">${escapeHtml(fe.hint)}</div>`;
        }
        // 등록 버튼: 완료면 숨김, 대기/실패면 등록
        const action = i.status === 'done'
            ? `<span style="color:#059669;font-weight:700;font-size:12px">완료</span>`
            : `<button class="btn-primary" style="padding:6px 12px;width:auto"
                 onclick="runOne('${escapeAttr(i.addr)}', '${escapeAttr(i.meter)}')">${i.status === 'err' ? '재등록' : '등록'}</button>`;
        return `
            <div class="queue-item" style="border-left:4px solid ${s.bd};background:${s.bg}">
                <div class="addr" style="font-size:15px;display:flex;align-items:center;gap:6px">${chk}${seq}${escapeHtml(i.meter)} <span style="color:#9ca3af">→</span> ${escapeHtml(i.rep.new_meter_id)} ${badge}</div>
                <div class="meta">
                    지침 ${_fmtReadings(i.rep)}<br>
                    ${road ? road + '<br><span style="color:#9ca3af">' + jibun + '</span>' : jibun}<br>
                    작업자 ${escapeHtml(i.rep.worker || '-')} · ${ts}
                </div>
                ${errMsg}
                <div class="actions">${action}</div>
            </div>`;
    }).join('');
}

async function loadDoneToday() {
    try {
        const snap = await _db.ref('workStatus/jongno').once('value');
        const ws = snap.val() || {};
        const todayMs = new Date();
        todayMs.setHours(0, 0, 0, 0);
        let cnt = 0;
        for (const v of Object.values(ws)) {
            const reps = v.replacement_list || {};
            for (const rep of Object.values(reps)) {
                if (rep.awms_synced === true && (rep.awms_synced_at || 0) >= todayMs.getTime()) cnt++;
            }
        }
        const el = document.getElementById('stat-done');
        if (el) el.textContent = cnt;
    } catch (e) {
        // ignore
    }
}

// 등록 성공 즉시 완료 반영 — _completedNewMeters에 추가(다음 syncCompleted 전까지 '완료' 표시)
function markDoneLocal(meter, newMeter) {
    if (meter) _completedNewMeters.add(String(meter).trim());
    if (newMeter) _completedNewMeters.add(String(newMeter).trim());
}

async function markSynced(addr, meter, awmsResp) {
    const upd = {
        awms_synced: true,
        awms_synced_at: Date.now(),
        awms_response: awmsResp || null,
        awms_error: null,
    };
    await _db.ref(`workStatus/jongno/${addr}/replacement_list/${meter}`).update(upd);
}

async function markError(addr, meter, errMsg) {
    await _db.ref(`workStatus/jongno/${addr}/replacement_list/${meter}`).update({
        awms_error: String(errMsg).slice(0, 500),
        awms_error_at: Date.now(),
    });
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "\\'"); }
