// 종로 Firebase 큐 + awms 완료 동기화

// ─────────────────────────────────────────────
// _friendlyError — 원본 에러 문자열 → {label, hint}
//   표시용 변환. 원본(raw)은 Firebase에 그대로 저장(덮어쓰지 않음).
//   queue.js, app.js 양쪽에서 사용 가능한 전역 함수.
// ─────────────────────────────────────────────
function _friendlyError(rawMsg) {
    if (!rawMsg) return { label: '미분류 오류', hint: '로그 확인' };
    const s = String(rawMsg).toLowerCase();
    // awms 임시저장(WORK_STEP 25) — 계기큐 재등록 불가, awms에서 직접 완료해야 함
    if (s.includes('임시저장')) {
        return { label: 'awms 임시저장(미완료)', hint: 'awms에서 완료 처리 필요' };
    }
    // 타이밍성 키부족(철거직후 awms 신설베이스 미반영) — 강행금지로 명확히 throw됨. 재등록하면 해결.
    if (s.includes('키부족') || s.includes('미반영') || s.includes('getdetail')) {
        return { label: 'awms 신설베이스 미반영(타이밍)', hint: '철거는 저장됨 — 30초 후 재등록' };
    }
    // 키부족이 아닌 순수 500 — 다른 원인이므로 뭉뚱그리지 말 것(raw 확인 유도).
    if (s.includes('500')) {
        return { label: '신설 저장 실패 — 서버 500(원인 미상)', hint: 'raw 로그 확인' };
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
let _queue = [];  // {addr, meter, rep, status:'pending'|'err'|'done', err?, site, draft, quarantine}
let _completedNewMeters = new Set();  // syncCompleted에서 채움 (awms 완료 28) — 현 계정·전차수
let _awmsDraftMeters = new Set();     // awms 임시저장(WORK_STEP=25) — 실패로 표시, 전체올리기 제외
let _persistedDone = new Set();       // awmsDoneMeters(ami-work DB) 누적 — 계정 무관 영구 완료목록
let _siteMap = {};         // 계기번호 → site-data(도로명주소/계약종별/계약전력 등)
let _dateFilter = 'all';   // 날짜별 보기 필터
let _activeTab = 'queue';  // 'queue' | 'quarantine' — 탭 상태

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
  // 새로고침 버튼 시각 피드백 (영준님: "새로고침에 액션이 없노") — 누르면 '조회 중' + 비활성, 끝나면 복원.
  const _btnR = document.getElementById('btn-refresh');
  const _btnRTxt = _btnR ? _btnR.textContent : '';
  if (_btnR) { _btnR.disabled = true; _btnR.textContent = '조회 중…'; }
  try {
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
  } finally {
    if (_btnR) { _btnR.disabled = false; _btnR.textContent = _btnRTxt || '새로고침'; }
  }
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

        // (b-0) awmsDoneMeters GET — 계정 무관 영구 누적 완료목록 (_persistedDone)
        //   _completedNewMeters 재구성 전에 먼저 GET해 기존 누적 확보.
        //   실패 시: 최초 로드면 빈 Set 유지, 이전 성공 이력 있으면 마지막 값 유지(과감 중복 방지).
        let existingPersistedArr = null;
        try {
            const pRes = await fetch(`${AWMS_WORK_DB}/awmsDoneMeters.json`);
            if (pRes.ok) {
                const pData = await pRes.json();
                if (pData != null) {
                    const raw = Array.isArray(pData) ? pData : Object.values(pData);
                    existingPersistedArr = raw.map(x => String(x).trim()).filter(Boolean);
                    _persistedDone = new Set(existingPersistedArr);
                    log(`awmsDoneMeters 로드: ${_persistedDone.size}건 (계정 무관 누적)`, 'ok');
                } else {
                    // DB 노드 null = 아직 없음 → 빈 Set
                    existingPersistedArr = [];
                    _persistedDone = new Set();
                }
            } else {
                log(`awmsDoneMeters GET 실패: HTTP ${pRes.status} — 이전 _persistedDone 유지`, 'warn');
                // existingPersistedArr = null → 아래 merge PUT 생략
            }
        } catch (e) {
            log('awmsDoneMeters GET 오류 — 이전 _persistedDone 유지: ' + e.message, 'warn');
            // _persistedDone 그대로 유지 (이미 이전 성공값 또는 초기 빈 Set)
        }

        // (b) 완료/임시저장 계기 Set — changed 여부와 무관하게 항상 갱신
        //   ★ dedup 스킵 경로에서도 Set 재구성 필수 — 비워두면 loadQueue가 전 항목을 pending으로 오판
        //   ★ WORK_STEP 분리: 28=완료(_completedNewMeters), 25=awms 임시저장(_awmsDraftMeters)
        //   25를 완료로 섞으면 awms 미완료(임시저장)건이 '완료'로 오판됨 → 분리 필수
        _completedNewMeters = new Set();
        _awmsDraftMeters = new Set();
        rows.forEach(r => {
            const step = String(r.WORK_STEP || '').trim();
            const tgt = (step === '25') ? _awmsDraftMeters : _completedNewMeters;  // 25 외(28)는 완료
            if (r.WHM_NO) tgt.add(String(r.WHM_NO).trim());
            if (r.CREMO_WHM_NO) tgt.add(String(r.CREMO_WHM_NO).trim());
        });
        log(`완료(현계정) ${_completedNewMeters.size} / awms임시저장(25) ${_awmsDraftMeters.size}건`);

        // changed일 때 awmsDoneMeters merge PUT (덮어쓰기 금지 → 기존 누적 합집합)
        //   existingPersistedArr이 null이면 GET 실패 → PUT 생략(덮어쓰기 위험 방지)
        if (changed && existingPersistedArr !== null) {
            try {
                // 기존 누적(existingPersistedArr) ∪ 현 계정 완료(28)(_completedNewMeters) 합집합
                const merged = new Set([...existingPersistedArr, ..._completedNewMeters]);
                await fetch(`${AWMS_WORK_DB}/awmsDoneMeters.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([...merged])
                });
                // PUT 성공 → _persistedDone도 최신 합집합으로 갱신
                _persistedDone = merged;
                log(`awmsDoneMeters merge PUT: ${merged.size}건 (누적 영구 저장)`, 'ok');
            } catch (e) {
                log('awmsDoneMeters merge PUT 오류(큐 동작 무관): ' + e.message, 'warn');
            }
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
            if (rep.draft) continue;                   // 종로앱 임시저장(미완성) — 큐 제외
            // 상태 = awms 라이브 대조. 등록돼도 안 사라지고 '등록완료'로 표시(영준님 지시).
            const m = String(meter).trim(), nm = String(rep.new_meter_id).trim();
            // inAwms: 현 계정 완료(28) OR 계정 무관 영구 누적(awmsDoneMeters) — 어느 계정에서 완료해도 done
            const inAwms = _completedNewMeters.has(m) || _completedNewMeters.has(nm)
                || _persistedDone.has(m) || _persistedDone.has(nm);                            // awms 완료(28)
            const inAwms25 = _awmsDraftMeters.has(m) || _awmsDraftMeters.has(nm);              // awms 임시저장(25)
            // 28 우선: 완료면 done. 완료 아니고 25면 실패(awms서 완료해야 — 재등록 불가). awms_error는 항상 실패.
            const status = rep.awms_error ? 'err' : (inAwms ? 'done' : (inAwms25 ? 'err' : 'pending'));
            const isAwmsDraft = inAwms25 && !inAwms;
            items.push({
                addr, meter, rep,
                status,
                quarantine: rep.quarantine === true,
                awmsDraft: isAwmsDraft,   // 전체올리기 제외용(awms서 완료해야 하므로 재등록 무의미)
                err: rep.awms_error || (isAwmsDraft ? 'awms 임시저장(WORK_STEP 25) — awms에서 완료 필요' : null),
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
        localStorage.setItem('awmsq_cache_draft25', JSON.stringify([..._awmsDraftMeters]));
        localStorage.setItem('awmsq_cache_workstatus', JSON.stringify(ws));
    } catch (e) {
        // QuotaExceededError 등 — 조용히 스킵 (캐시 저장 실패해도 라이브 동작 무관)
        log('캐시 저장 스킵(용량 부족): ' + e.message, 'warn');
    }
}

// ─────────────────────────────────────────────
// 탭 전환 (큐 / 격리)
// ─────────────────────────────────────────────
function switchTab(tab) {
    _activeTab = tab;
    // 탭 버튼 active 클래스 토글
    const btnQ = document.getElementById('tab-btn-queue');
    const btnQr = document.getElementById('tab-btn-quarantine');
    if (btnQ) btnQ.className = tab === 'queue' ? 'tab-btn tab-btn-active' : 'tab-btn';
    if (btnQr) btnQr.className = tab === 'quarantine' ? 'tab-btn tab-btn-active' : 'tab-btn';
    // 날짜필터·선택등록 컨트롤: 큐 탭에서만 표시
    const dateBar = document.getElementById('date-bar');
    const selectBar = document.getElementById('select-bar');
    const btnAll = document.getElementById('btn-run-all');
    if (dateBar) dateBar.style.display = tab === 'queue' ? '' : 'none';
    if (selectBar) selectBar.style.display = tab === 'queue' ? '' : 'none';
    if (btnAll) btnAll.style.display = tab === 'queue' ? '' : 'none';
    renderQueue();
}
window.switchTab = switchTab;

// 탭 네비 바 (동적 생성) — .container 최상단에 삽입 (btn-run-all, date-bar, queue-list 위)
function _ensureTabBar() {
    if (document.getElementById('tab-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'tab-bar';
    bar.style.cssText = 'display:flex;gap:0;padding:8px 12px 0;border-bottom:2px solid #e5e7eb;background:#fff;margin-bottom:8px;';

    // 인라인 스타일 — 탭 버튼 공통
    const btnBase = 'padding:8px 18px;font-size:14px;font-weight:700;border:none;border-bottom:2px solid transparent;'
        + 'margin-bottom:-2px;background:none;cursor:pointer;color:#6b7280;';
    const btnActive = btnBase + 'color:#1d4ed8;border-bottom-color:#1d4ed8;background:none;';

    bar.innerHTML =
        `<button id="tab-btn-queue" class="tab-btn tab-btn-active" style="${btnActive}" onclick="switchTab('queue')">큐</button>`
        + `<button id="tab-btn-quarantine" class="tab-btn" style="${btnBase}" onclick="switchTab('quarantine')">격리 (<span id="quarantine-count">0</span>)</button>`;

    // .container 첫 자식 앞에 삽입 (awms열기/새로고침 버튼행 위)
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(bar, container.firstChild);
    } else {
        // 폴백: queue-list 앞
        const list = document.getElementById('queue-list');
        if (list && list.parentNode) list.parentNode.insertBefore(bar, list);
    }

    // active 스타일 CSS 주입 (동적 active 클래스용 — 인라인보다 우선)
    if (!document.getElementById('tab-style')) {
        const style = document.createElement('style');
        style.id = 'tab-style';
        style.textContent = '.tab-btn{padding:8px 18px;font-size:14px;font-weight:700;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;background:none;cursor:pointer;color:#6b7280;}'
            + '.tab-btn-active{color:#1d4ed8!important;border-bottom-color:#1d4ed8!important;}';
        document.head.appendChild(style);
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
    // 세션 없으면 선택등록 버튼 비활성화 (생성 후에도 매번 갱신 — 동적생성이라 updateSessionBar가 못 잡는 케이스 보강)
    const _btnSel = document.getElementById('btn-run-selected');
    if (_btnSel) _btnSel.disabled = (typeof isSessionOK === 'function') && !isSessionOK();
}

function renderQueue() {
    _ensureTabBar();
    _ensureDateBar();
    _ensureSelectControls();

    // 격리 카운트 배지 갱신
    const qCount = _queue.filter(i => i.quarantine).length;
    const qcEl = document.getElementById('quarantine-count');
    if (qcEl) qcEl.textContent = qCount;

    // 탭에 따라 렌더 대상 분기
    const isQuarantineTab = _activeTab === 'quarantine';

    // 큐 탭: 격리 아닌 항목 + 날짜 필터 / 격리 탭: quarantine=true 항목
    let inTab;
    if (isQuarantineTab) {
        inTab = _queue.filter(i => i.quarantine);
    } else {
        const nonQuar = _queue.filter(i => !i.quarantine);
        inTab = _dateFilter === 'all' ? nonQuar : nonQuar.filter(i => _dateKey(i.rep.replaced_at) === _dateFilter);
    }

    // 날짜필터·선택등록·일괄버튼 큐 탭에서만 활성
    const dateBar = document.getElementById('date-bar');
    const selectBar = document.getElementById('select-bar');
    const btnAll = document.getElementById('btn-run-all');
    if (dateBar) dateBar.style.display = isQuarantineTab ? 'none' : '';
    if (selectBar) selectBar.style.display = isQuarantineTab ? 'none' : '';
    if (btnAll) btnAll.style.display = isQuarantineTab ? 'none' : '';

    // 요약 카운트 (큐 탭 기준 — 비격리 항목 기준)
    const queueItems = _queue.filter(i => !i.quarantine);
    const shownForCount = _dateFilter === 'all' ? queueItems : queueItems.filter(i => _dateKey(i.rep.replaced_at) === _dateFilter);
    const cnt = s => shownForCount.filter(i => i.status === s).length;
    const elPending = document.getElementById('stat-pending');
    const elErr = document.getElementById('stat-err');
    const elDone = document.getElementById('stat-done');
    if (elPending) elPending.textContent = cnt('pending');
    if (elErr) elErr.textContent = cnt('err');
    if (elDone) elDone.textContent = cnt('done');
    if (btnAll && !isQuarantineTab) {
        const dLabel = _dateFilter === 'all' ? '전체' : _dateFilter.replace(/\s+/g, '').replace(/\.$/, '');
        const activeCnt = cnt('pending') + cnt('err');
        btnAll.disabled = activeCnt === 0 || !isSessionOK();
        btnAll.textContent = `[${dLabel}] 일괄 등록 (대기 ${cnt('pending')} + 실패 ${cnt('err')}건)`;
    }

    const list = document.getElementById('queue-list');
    if (!list) return;
    if (!inTab.length) {
        list.innerHTML = `<div class="card" style="text-align:center;color:#9ca3af;padding:30px">${isQuarantineTab ? '격리된 항목 없음' : '표시할 항목 없음'}</div>`;
        return;
    }

    // 상태별 색상
    const STY = {
        err:     { bd: '#dc2626', bg: 'rgba(220,38,38,.06)',  bdg: 'badge-err',     txt: '실패' },
        pending: { bd: '#d97706', bg: 'rgba(217,119,6,.06)',  bdg: 'badge-pending', txt: '대기' },
        done:    { bd: '#059669', bg: 'rgba(5,150,105,.08)',  bdg: '',              txt: '등록완료' },
    };

    list.innerHTML = inTab.slice(0, 200).map(i => {
        const s = STY[i.status] || STY.pending;
        // 선택 등록용 체크박스 — 완료건/격리탭 제외
        const chk = (i.status === 'done' || isQuarantineTab) ? ''
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
        // 등록/격리/복귀 버튼
        const _noSess = (typeof isSessionOK === 'function') && !isSessionOK();
        let actionBtns = '';
        if (isQuarantineTab) {
            // 격리 탭: 복귀 버튼만
            actionBtns = `<button class="btn-primary" style="padding:6px 12px;width:auto;background:#6b7280"
                onclick="unquarantineOne('${escapeAttr(i.addr)}', '${escapeAttr(i.meter)}')">복귀</button>`;
        } else if (i.status === 'done') {
            actionBtns = `<span style="color:#059669;font-weight:700;font-size:12px">완료</span>`;
        } else {
            // 큐 탭: 등록/재등록 + 격리 버튼
            const quarBtn = `<button style="padding:6px 10px;width:auto;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;color:#374151;font-size:13px"
                onclick="quarantineOne('${escapeAttr(i.addr)}', '${escapeAttr(i.meter)}')">격리</button>`;
            if (i.awmsDraft) {
                // awms 임시저장(25)은 awms에서 완료해야 함 → 계기큐 등록 막고 격리만(재등록하면 또 걸림)
                actionBtns = quarBtn;
            } else {
                const regBtn = `<button class="btn-primary" style="padding:6px 12px;width:auto" ${_noSess ? 'disabled' : ''}
                    onclick="runOne('${escapeAttr(i.addr)}', '${escapeAttr(i.meter)}')">${i.status === 'err' ? '재등록' : '등록'}</button>`;
                actionBtns = regBtn + ' ' + quarBtn;
            }
        }
        return `
            <div class="queue-item" style="border-left:4px solid ${s.bd};background:${s.bg}">
                <div class="addr" style="font-size:15px;display:flex;align-items:center;gap:6px">${chk}${seq}${escapeHtml(i.meter)} <span style="color:#9ca3af">→</span> ${escapeHtml(i.rep.new_meter_id)} ${badge}</div>
                <div class="meta">
                    지침 ${_fmtReadings(i.rep)}<br>
                    ${road ? road + '<br><span style="color:#9ca3af">' + jibun + '</span>' : jibun}<br>
                    작업자 ${escapeHtml(i.rep.worker || '-')} · ${ts}
                </div>
                ${errMsg}
                <div class="actions">${actionBtns}</div>
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
    // 봉인 DB 저장 — registerReplacement가 awms_seal을 리턴한 경우만 기록 (폴백·주입 공통)
    //   구조: {account, seal_no, seal_no2, cons_no} — app.py _db_seal_max·awms_seal_map과 필드명 일치
    //   주입 모드에서는 app.py 전송 흐름도 동일 구조로 기록하므로 같은 mid에 두 번 쓰일 수 있음 — 마지막 쓰기 우선(무해)
    if (awmsResp && awmsResp.awms_seal) {
        upd.awms_seal = awmsResp.awms_seal;
    }
    await _db.ref(`workStatus/jongno/${addr}/replacement_list/${meter}`).update(upd);
}

async function markError(addr, meter, errMsg) {
    await _db.ref(`workStatus/jongno/${addr}/replacement_list/${meter}`).update({
        awms_error: String(errMsg).slice(0, 500),
        awms_error_at: Date.now(),
    });
}

// ─────────────────────────────────────────────
// quarantineOne / unquarantineOne — 수동 격리 토글 (Firebase 저장)
//   ref 패턴 = markError와 동일: raw addr (인코딩 없음), SDK .update()
// ─────────────────────────────────────────────
async function quarantineOne(addr, meter) {
    try {
        await _db.ref(`workStatus/jongno/${addr}/replacement_list/${meter}`).update({ quarantine: true });
        // 로컬 _queue 즉시 반영
        const item = _queue.find(i => i.addr === addr && i.meter === meter);
        if (item) { item.quarantine = true; item.rep.quarantine = true; }
        renderQueue();
        log(`격리: ${meter} (${addr})`, 'ok');
    } catch (e) {
        log(`격리 실패: ${e.message}`, 'err');
        alert('격리 저장 실패: ' + e.message);
    }
}

async function unquarantineOne(addr, meter) {
    try {
        await _db.ref(`workStatus/jongno/${addr}/replacement_list/${meter}`).update({ quarantine: false });
        // 로컬 _queue 즉시 반영
        const item = _queue.find(i => i.addr === addr && i.meter === meter);
        if (item) { item.quarantine = false; item.rep.quarantine = false; }
        renderQueue();
        log(`격리 해제: ${meter} (${addr})`, 'ok');
    } catch (e) {
        log(`격리 해제 실패: ${e.message}`, 'err');
        alert('격리 해제 실패: ' + e.message);
    }
}

window.quarantineOne = quarantineOne;
window.unquarantineOne = unquarantineOne;

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "\\'"); }
