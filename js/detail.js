// detail.js — 상세 패널(오버레이) 로직

let currentAddress = '';
let currentMeters = [];

// 현재 정렬 모드: 'none' | 'dup' | 'maker'
let currentSortMode = 'none';

// 주소 클릭 시 상세 패널 표시
function showDetail(address, meters) {
    currentAddress = address;
    currentMeters = meters;

    // 어드민 사진등록 버튼에 현재 주소 전달
    const adminBtn = document.getElementById('admin-upload-btn');
    if (adminBtn) adminBtn.href = `admin.html?addr=${encodeURIComponent(address)}`;

    const status = workStatus[address] || { state: 'pending', checkedMeters: [], reason: '' };
    status.checkedMeters = status.checkedMeters || [];

    // 주소 텍스트 추출 — 더러운 값(undefined/null/"-") 거름
    const DIRTY_RE = /^\s*(undefined|null|-)(\s+(undefined|null|-))*\s*$/i;
    const isUsable = (s) => {
        if (s == null) return false;
        const t = String(s).trim();
        return !!t && !DIRTY_RE.test(t);
    };
    const pick = (...vals) => vals.find(isUsable) || '';
    const jibunAddr = pick(meters[0] && meters[0].주소, address);
    const roadAddr  = pick(meters[0] && meters[0].도로명주소);

    // 헤더 = 도로명 우선(있으면), 없으면 지번
    // 화면에 보이는 텍스트 = data-copy 속성 (계기번호 복사와 동일 패턴)
    const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const COPY_ICON_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const headerAddr = roadAddr || jibunAddr;
    document.getElementById('detail-address').innerHTML =
        `<span>${esc(headerAddr)}</span>` +
        `<button class="copy-btn" data-copy="${esc(headerAddr)}" title="주소 복사" style="margin-left:6px;vertical-align:middle;">${COPY_ICON_SVG}</button>`;

    // 좌표정확도가 approximate인 계기가 하나라도 있으면 "주소 오류" 표시
    const hasApproximate = meters.some(m => m.좌표정확도 === 'approximate');
    const errorTag = hasApproximate
        ? ' <span style="color:#ef4444;font-size:12px;">(주소 오류)</span>'
        : '';

    // 도로명/지번 라인 — 헤더와 다를 때만 노출 (중복 표시 방지)
    let roadLine = '';
    if (roadAddr && roadAddr !== headerAddr) {
        roadLine = `📍 <span>${esc(roadAddr)}</span>` +
            `<button class="copy-btn" data-copy="${esc(roadAddr)}" title="도로명 복사" style="margin-left:6px;vertical-align:middle;">${COPY_ICON_SVG}</button>` +
            errorTag;
    } else if (hasApproximate) {
        roadLine = errorTag;
    }
    let jibunLine = '';
    if (jibunAddr && jibunAddr !== headerAddr) {
        const br = roadLine ? '<br>' : '';
        jibunLine = `${br}<span style="color:#9ca3af;">🏠 ${esc(jibunAddr)}</span>` +
            `<button class="copy-btn" data-copy="${esc(jibunAddr)}" title="지번 복사" style="margin-left:6px;vertical-align:middle;">${COPY_ICON_SVG}</button>`;
    }
    document.getElementById('detail-road-address').innerHTML = roadLine + jibunLine;

    // 주소 복사 핸들러 — copy-btn 클래스 + data-copy 속성 (계기번호와 동일 패턴)
    document.querySelectorAll('#detail-address .copy-btn, #detail-road-address .copy-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const v = btn.dataset.copy;
            if (v) copyMeterNo(v);
        };
    });

    // 상태 색상 바 업데이트 (기능 3)
    updateStatusBar(status.state);

    // 지도 앱 버튼 3개 — 도로명주소로 검색
    document.getElementById('tmap-btn').onclick = () => {
        window.location.href = `tmap://search?name=${encodeURIComponent(roadAddr)}`;
    };
    document.getElementById('naver-btn').onclick = () => {
        window.location.href = `nmap://search?query=${encodeURIComponent(roadAddr)}`;
    };
    document.getElementById('kakao-btn').onclick = () => {
        window.location.href = `kakaomap://search?q=${encodeURIComponent(roadAddr)}`;
    };

    const btnComplete = document.getElementById('btn-complete');
    const btnHold = document.getElementById('btn-hold');
    const btnFail = document.getElementById('btn-fail');

    // 완료 상태면 초기화 버튼으로 전환
    if (status.state === 'complete') {
        btnComplete.textContent = '🔄 초기화';
        btnComplete.className = 'action-btn reset';
        btnComplete.onclick = () => resetStatus();
    } else {
        btnComplete.textContent = '✅ 완료';
        btnComplete.className = 'action-btn complete';
        btnComplete.onclick = () => { updateStatus('complete'); closeDetail(); };
    }

    // 보류 상태면 초기화 버튼으로 전환
    if (status.state === 'hold') {
        btnHold.textContent = '🔄 초기화';
        btnHold.className = 'action-btn reset';
        btnHold.onclick = () => resetStatus();
    } else {
        btnHold.textContent = '⏸️ 보류';
        btnHold.className = 'action-btn hold';
        btnHold.onclick = () => { updateStatus('hold'); closeDetail(); };
    }

    // 불가 상태면 초기화 버튼으로 전환
    if (status.state === 'fail') {
        btnFail.textContent = '🔄 초기화';
        btnFail.className = 'action-btn reset';
        btnFail.onclick = () => resetStatus();
    } else {
        btnFail.textContent = '❌ 불가';
        btnFail.className = 'action-btn fail';
        btnFail.onclick = () => {
            const failInput = document.getElementById('fail-reason');
            const reason = failInput.value.trim();
            if (!reason) {
                failInput.style.borderColor = '#ef4444';
                return;
            }
            failInput.style.borderColor = '';
            updateStatus('fail');
            closeDetail();
        };
    }

    // 현재 상태에 맞는 버튼 활성화
    [btnComplete, btnHold, btnFail].forEach(btn => btn.classList.remove('active'));
    if (status.state === 'complete') btnComplete.classList.add('active');
    if (status.state === 'hold') btnHold.classList.add('active');
    if (status.state === 'fail') btnFail.classList.add('active');

    const failInput = document.getElementById('fail-reason');
    failInput.value = status.reason || '';
    failInput.style.borderColor = '';
    failInput.oninput = (e) => {
        if (e.target.value.trim()) e.target.style.borderColor = '';
        // 입력 중: 로컬만 저장
        if (!workStatus[currentAddress]) {
            workStatus[currentAddress] = { state: 'pending', checkedMeters: [], reason: '' };
        }
        workStatus[currentAddress].reason = e.target.value;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
    };
    // blur/Enter 시 이벤트 큐에 추가
    const flushFailReason = () => {
        const session = authGetSession();
        const state = workStatus[currentAddress]?.state || 'pending';
        if (state !== 'pending') {
            saveStateEvent(
                currentAddress,
                state,
                failInput.value.trim(),
                session ? session.id   : '',
                session ? session.name : ''
            );
        }
    };
    failInput.addEventListener('blur', flushFailReason);
    failInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { flushFailReason(); failInput.blur(); } });

    // 작업자 정보 표시 (기능 4)
    // 디버그: showDetail에서 읽어온 status 확인
    console.log('[showDetail] status:', {
        state:         status.state,
        updatedByName: status.updatedByName,
        updatedAt:     status.updatedAt,
    });
    updateWorkerInfo(status);

    // 변대주(전산화/DCUID)가 모두 같은 경우 공통 표시
    // - 영문자 포함: DCU 케이스 → 끝 2자리(차수+번호) 강조 + 복사 시 절단
    // - 숫자만: LTE 케이스 (DCU 미사용) → 강조 없음 + 전체 복사
    const allSameDcu = meters.length > 0 && meters.every(m => m.DCUID === meters[0].DCUID);
    const commonPoleEl = document.getElementById('common-pole');
    const hasDcuId = !!meters[0].DCUID;
    if (allSameDcu && hasDcuId) {
        const dcu = meters[0].DCUID;
        const isDcuType = /[A-Za-z]/.test(dcu);
        let dcuHtml, copyVal;
        if (isDcuType) {
            const dcuMain = dcu.slice(0, -2);
            dcuHtml = `<span>${dcuMain}</span><span class="seg-dup">${dcu.slice(-2)}</span>`;
            copyVal = dcuMain;
        } else {
            dcuHtml = `<span>${dcu}</span>`;
            copyVal = dcu;
        }
        const poleCopyBtn = `<button class="copy-btn pole-copy-btn" data-copy="${copyVal}" title="전산화번호 복사" style="margin-left:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
        commonPoleEl.innerHTML = `변대주 ${dcuHtml}${poleCopyBtn}`;
        commonPoleEl.style.display = 'block';
        commonPoleEl.querySelector('.pole-copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            copyMeterNo(copyVal);
        });
    } else {
        commonPoleEl.style.display = 'none';
    }

    // 재작업 알림 (rework=true) — 상단에 표시
    const reworkEl = document.getElementById('rework-notice');
    if (reworkEl) {
        if (status.rework === true) {
            const prevName = status.previousCompleteBy || '';
            const prevAt = status.previousCompleteAt || '';
            let prevDate = '';
            if (prevAt) {
                try {
                    const d = new Date(prevAt);
                    prevDate = kstDayLabel(d);
                } catch (e) { prevDate = prevAt; }
            }
            reworkEl.innerHTML = `재작업 — 이전 완료: ${prevName} ${prevDate}`;
            reworkEl.style.display = 'block';
        } else {
            reworkEl.style.display = 'none';
        }
    }

    // 패널 열릴 때 검색창 초기화
    const searchEl = document.getElementById('meter-search');
    if (searchEl) { searchEl.value = ''; }

    // 패널 열릴 때 정렬 상태 초기화 + 버튼 UI 동기화
    currentSortMode = 'none';
    updateSortBtnUI();

    // 계기 목록 렌더링
    renderMetersList();

    document.getElementById('fullpage-overlay').classList.add('active');
}

// 상태 색상 바 업데이트 (기능 3)
function updateStatusBar(state) {
    const bar = document.getElementById('status-bar');
    if (!bar) return;

    const colorMap = {
        complete: '#10b981',
        hold:     '#3b82f6',
        fail:     '#ef4444',
    };

    if (state === 'pending' || !colorMap[state]) {
        bar.style.background = 'transparent';
    } else {
        bar.style.background = colorMap[state];
    }
}

// 작업자 정보 표시 업데이트 (기능 4)
function updateWorkerInfo(status) {
    const workerEl = document.getElementById('worker-info');
    if (!workerEl) return;

    // pending이거나 작업자 정보 없으면 숨김
    if (
        status.state === 'pending' ||
        !status.updatedByName ||
        !status.updatedAt
    ) {
        workerEl.style.display = 'none';
        workerEl.textContent = '';
        return;
    }

    // updatedAt을 "M월 D일" 형식으로 변환
    let dateStr = '';
    try {
        const d = new Date(status.updatedAt);
        dateStr = kstDayLabel(d);
    } catch (e) {
        dateStr = status.updatedAt;
    }

    workerEl.textContent = `${status.updatedByName} / ${dateStr} 작업`;
    workerEl.style.display = 'block';
}

// ── 계기 목록 렌더링 ─────────────────────────────────────────

// 현재 정렬 모드에 따라 계기 목록을 정렬해서 반환
function getSortedMeters() {
    const meters = currentMeters;
    if (currentSortMode === 'dup') {
        // 뒤 2자리 기준 그룹 정렬 (같은 뒤2자리끼리 인접)
        return [...meters].sort((a, b) => {
            const sa = a.계기번호.slice(-2);
            const sb = b.계기번호.slice(-2);
            if (sa !== sb) return sa.localeCompare(sb);
            return meters.indexOf(a) - meters.indexOf(b); // 그룹 내 원래 순서 유지
        });
    }
    if (currentSortMode === 'maker') {
        // 앞 2자리 기준 그룹 정렬 (같은 메이커 코드끼리 인접)
        return [...meters].sort((a, b) => {
            const pa = a.계기번호.slice(0, 2);
            const pb = b.계기번호.slice(0, 2);
            if (pa !== pb) return pa.localeCompare(pb);
            return meters.indexOf(a) - meters.indexOf(b); // 그룹 내 원래 순서 유지
        });
    }
    // 'none': 원래 순서
    return meters;
}

// 계기 개별 불가 토글
function toggleMeterFail(meterNumber) {
    if (!workStatus[currentAddress]) {
        workStatus[currentAddress] = { state: 'pending', checkedMeters: [], reason: '' };
    }
    const status = workStatus[currentAddress];
    if (!status.failedMeters) status.failedMeters = {};

    if (status.failedMeters[meterNumber] !== undefined) {
        // 이미 불가 → 해제
        delete status.failedMeters[meterNumber];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
        renderMetersList();
    } else {
        // 불가 처리 → 일단 빈 사유로 등록하고 입력창 표시 (renderMetersList에서 처리)
        status.failedMeters[meterNumber] = '';
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
        renderMetersList();
        // 렌더링 후 해당 입력창에 포커스
        setTimeout(() => {
            const input = document.querySelector(`.meter-fail-input[data-meter="${meterNumber}"]`);
            if (input) input.focus();
        }, 50);
    }
}

// 계기 불가 사유 저장
function saveMeterFailReason(meterNumber, reason) {
    if (!workStatus[currentAddress]) return;
    const status = workStatus[currentAddress];
    if (!status.failedMeters) status.failedMeters = {};
    status.failedMeters[meterNumber] = reason;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
}

// 추가된 계기(added_meters)를 currentMeters에 가짜 객체로 합쳐서 함께 표시
function getMetersWithAdded() {
    const base = currentMeters || [];
    const status = workStatus[currentAddress] || {};
    const added = status.added_meters || {};
    const addedList = Object.values(added).map(a => ({
        계기번호: a.meter_id,
        계기타입: parseType(a.meter_id) || '?',
        주소: currentAddress,
        도로명주소: base[0]?.도로명주소 || '',
        DCUID: '',
        category: base[0]?.category || '실효',
        __added: true,
        __added_meta: a,
    }));
    return base.concat(addedList);
}

// 계기 목록 HTML 생성 및 렌더링
function renderMetersList() {
    const meters = getMetersWithAdded();
    // currentMeters를 임시로 합친 배열로 교체 (정렬 함수가 currentMeters 참조)
    const origCurrent = currentMeters;
    currentMeters = meters;
    const sortedMeters = getSortedMeters();
    currentMeters = origCurrent;
    const status = workStatus[currentAddress] || { state: 'pending', checkedMeters: [], reason: '' };
    // 큰 글씨(공통) 영역에 표시되었는지 — DCUID 기준으로 판단
    const allSameDcu = meters.length > 0 && meters.every(m => m.DCUID === meters[0].DCUID);
    const commonDcuShown = allSameDcu && !!meters[0].DCUID;
    const failedMeters = status.failedMeters || {};

    // 뒤 2자리 중복 그룹 계산 (중복 계기번호 색상 구분용)
    const suffix2Map = {};
    meters.forEach(m => {
        const s = m.계기번호.slice(-2);
        if (!suffix2Map[s]) suffix2Map[s] = [];
        suffix2Map[s].push(m.계기번호);
    });
    // suffix → 그룹 인덱스 (0-based)
    const dupGroupIndex = {};
    let gIdx = 0;
    Object.entries(suffix2Map).forEach(([s, nos]) => {
        if (nos.length > 1) dupGroupIndex[s] = gIdx++;
    });
    // 그룹 인덱스 → CSS 클래스 방식 (인라인 스타일 대신 dup-row-N 클래스 사용)
    function rowClass(s2) {
        if (dupGroupIndex[s2] === undefined) return '';
        return `dup-row-${dupGroupIndex[s2] % 10}`;
    }

    // 검색 필터
    const searchVal = (document.getElementById('meter-search')?.value || '').replace(/\D/g, '');
    const filtered = (searchVal.length >= 2)
        ? sortedMeters.filter(m => m.계기번호.includes(searchVal))
        : sortedMeters;

    const metersList = document.getElementById('meters-list');
    metersList.innerHTML = filtered.map(meter => {
        const checked = (status.checkedMeters || []).includes(meter.계기번호) ? 'checked' : '';
        const parsedType = parseType(meter.계기번호) || meter.계기타입;
        const detailParts = [];
        // DCUID 큰 글씨 — 공통 표시 안 될 때만 개별 표시
        // 영문자 포함: DCU 케이스 → 끝 2자리 강조 + 복사 시 절단
        // 숫자만: LTE 케이스 → 강조 없음 + 전체 복사
        if (!commonDcuShown && meter.DCUID) {
            const dcu = meter.DCUID;
            const isDcuType = /[A-Za-z]/.test(dcu);
            let pHtml, copyVal;
            if (isDcuType) {
                const dcuMain = dcu.slice(0, -2);
                pHtml = `<span>${dcuMain}</span><span class="seg-dup">${dcu.slice(-2)}</span>`;
                copyVal = dcuMain;
            } else {
                pHtml = `<span>${dcu}</span>`;
                copyVal = dcu;
            }
            const pCopyBtn = `<button class="copy-btn pole-copy-btn" data-copy="${copyVal}" title="전산화번호 복사" style="margin-left:3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
            detailParts.push(`변대주 ${pHtml}${pCopyBtn}`);
        }
        // 상호 (있을 때)
        if (meter.상호 && meter.상호 !== '0') detailParts.push(`상호 ${meter.상호}`);
        // 공동주택명 (상호와 다를 때만)
        if (meter.공동주택명 && meter.공동주택명 !== meter.상호) detailParts.push(meter.공동주택명);
        // 작은 글씨 영역
        const subParts = [];
        // 1) 통신방식 (빨강) · 변대주 한글명 · 인입주
        if (meter.통신방식) subParts.push(`<span class="comm-type">${meter.통신방식}</span>`);
        if (meter.변대주) subParts.push(`변대주 ${meter.변대주}`);
        if (meter.인입주) subParts.push(`인입주 ${meter.인입주}`);
        // 2) 사업차수 (신·전)
        if (meter['사업차수']) {
            const prev = meter['사업차수_전'];
            subParts.push(prev && prev !== meter['사업차수'] ? `차수 ${meter['사업차수']}(전 ${prev})` : `차수 ${meter['사업차수']}`);
        }
        // 3) 이전 통신 (항상) · 이전 계기 (신과 다를 때만)
        if (meter['통신방식_전']) subParts.push(`이전통신 ${meter['통신방식_전']}`);
        if (meter['계기타입_전'] && meter['계기타입_전'] !== meter.계기타입) subParts.push(`이전계기 ${meter['계기타입_전']}`);
        // 4) 고객번호
        if (meter.고객번호) subParts.push(`고객 ${meter.고객번호}`);
        // 5) 실효 미사용 컬럼 살리기 (값 있고 의미 있을 때만)
        if (meter.검기만료년월) subParts.push(`검기만료 ${meter.검기만료년월}`);
        if (meter.교체사유) subParts.push(`사유 ${meter.교체사유}`);
        if (meter.DCU장애여부 && meter.DCU장애여부 !== '정상') {
            subParts.push(`<span style="color:#dc2626;font-weight:700;">DCU ${meter.DCU장애여부}</span>`);
        }
        if (meter.계기교체일) subParts.push(`교체일 ${meter.계기교체일}`);
        // 6) SKT 전용 필드 (category=skt일 때 + 값 있을 때만)
        if (meter.category === 'skt') {
            if (meter.실효년월)        subParts.push(`실효 ${meter.실효년월}`);
            if (meter.skt_작업결과)    subParts.push(`SKT결과 ${meter.skt_작업결과}`);
            if (meter.skt_불가사유)    subParts.push(`SKT사유 ${meter.skt_불가사유}`);
            if (meter.skt_kdn_작업일)  subParts.push(`KDN작업일 ${meter.skt_kdn_작업일}`);
            if (meter.skt_kdn_이력)    subParts.push(`이력 ${meter.skt_kdn_이력}`);
            if (meter.skt_비고)        subParts.push(`비고 ${meter.skt_비고}`);
        }
        // 7) TOU 전용 필드 (category=tou일 때)
        if (meter.category === 'tou') {
            if (meter.tou_source)       subParts.push(`${meter.tou_source}`);
            if (meter.LP != null && meter.LP !== '' && meter.LP !== '#N/A')
                subParts.push(`LP ${meter.LP}`);
            if (meter.시공일 && meter.시공일 !== '#N/A')
                subParts.push(`시공일 ${meter.시공일}`);
            if (meter.계기타입_xlsx && meter.계기타입_xlsx !== meter.계기타입)
                subParts.push(`원본타입 ${meter.계기타입_xlsx}`);
            if (meter.고객번호)         subParts.push(`고객 ${meter.고객번호}`);
            if (meter.본부)             subParts.push(`${meter.본부}`);
        }
        const subDetails = subParts.length ? `<div class="meter-sub-details">${subParts.join(' · ')}</div>` : '';
        const details = detailParts.join(', ');

        // 계기번호 4구간 색상 분리
        const no = meter.계기번호;
        const s2 = no.slice(-2);
        const isDup = dupGroupIndex[s2] !== undefined;
        const noHtml = `<span class="meter-no-seg">` +
            `<span class="seg-maker">${no.slice(0, 2)}</span>` +
            `<span class="seg-type">${no.slice(2, 4)}</span>` +
            `<span class="seg-mid">${no.slice(4, -2)}</span>` +
            `<span class="${isDup ? 'seg-dup' : 'seg-last'}">${s2}</span>` +
            `</span>`;

        const copyBtn = `<button class="copy-btn" data-copy="${meter.계기번호}" title="계기번호 복사"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;

        // 개별 불가 처리 상태
        const isFailed = failedMeters[meter.계기번호] !== undefined;
        const failReason = failedMeters[meter.계기번호] || '';
        const failBtnClass = isFailed ? 'meter-fail-btn active' : 'meter-fail-btn';
        const failBtnLabel = isFailed ? '불가해제' : '불가';
        const failInputHtml = isFailed
            ? `<div class="meter-fail-input-wrap">
                 <input type="text" class="meter-fail-input"
                        data-meter="${meter.계기번호}"
                        placeholder="불가 사유 입력 후 엔터"
                        value="${failReason.replace(/"/g, '&quot;')}">
               </div>`
            : '';

        // 추가된 계기 (admin이 + 계기 추가로 등록한 것)
        const isAdded = !!meter.__added;
        const addedMeta = meter.__added_meta || {};
        const addedBadge = isAdded
            ? `<span style="background:#ede9fe;color:#6d28d9;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-right:6px;">추가</span>`
            : '';
        const addedRemoveBtn = isAdded
            ? `<button class="meter-add-remove-btn" data-meter="${meter.계기번호}" title="추가 계기 삭제" style="margin-left:6px;background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;">삭제</button>`
            : '';
        const addedInfo = isAdded
            ? `<div class="meter-sub-details" style="color:#7c3aed;">추가: ${(addedMeta.added_by_name || addedMeta.added_by || '?')}${addedMeta.mfg_ym ? ' · 제조 ' + addedMeta.mfg_ym : ''}</div>`
            : '';

        // 불가 처리된 계기는 취소선 클래스 추가
        let itemClass = isFailed
            ? `meter-item ${rowClass(s2)} meter-item-failed`
            : `meter-item ${rowClass(s2)}`;
        if (isAdded) itemClass += ' meter-item-added';

        return `
            <div class="${itemClass}">
                <input type="checkbox" class="meter-checkbox"
                       data-meter="${meter.계기번호}" ${checked}>
                <div class="meter-info">
                    ${addedBadge}<span class="meter-type">${parsedType}</span>
                    ${noHtml}${copyBtn}${addedRemoveBtn}
                    <button class="${failBtnClass}" data-meter="${meter.계기번호}">${failBtnLabel}</button>
                    ${details ? `<div class="meter-details">${details}</div>` : ''}
                    ${subDetails}
                    ${addedInfo}
                    ${failInputHtml}
                </div>
            </div>
        `;
    }).join('');

    // 체크박스, 복사 버튼, 개별 불가 버튼/입력창 이벤트 바인딩
    setTimeout(() => {
        document.querySelectorAll('.meter-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                toggleMeterCheck(e.target.dataset.meter);
            });
        });
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyMeterNo(btn.dataset.copy);
            });
        });

        // 개별 불가 버튼 클릭
        document.querySelectorAll('.meter-fail-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMeterFail(btn.dataset.meter);
            });
        });

        // 추가 계기 삭제 버튼
        document.querySelectorAll('.meter-add-remove-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const m = btn.dataset.meter;
                if (!confirm(`추가 계기 ${m}를 삭제할까요?`)) return;
                try {
                    await removeAddedMeter(currentAddress, m);
                    renderMetersList();
                    if (typeof updateMarkerColor === 'function') updateMarkerColor(currentAddress);
                } catch (err) {
                    alert('삭제 실패: ' + err.message);
                }
            });
        });

        // 불가 사유 입력창 — 엔터 또는 포커스아웃 시 저장
        document.querySelectorAll('.meter-fail-input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    saveMeterFailReason(input.dataset.meter, input.value.trim());
                    input.blur();
                }
            });
            input.addEventListener('blur', (e) => {
                saveMeterFailReason(input.dataset.meter, input.value.trim());
            });
        });

        // 계기 검색 — 입력 시 목록으로 자동 스크롤
        const searchInput = document.getElementById('meter-search');
        if (searchInput) {
            searchInput.oninput = () => {
                renderMetersList();
                setTimeout(() => {
                    const actionsEl = document.querySelector('.overlay-actions');
                    if (actionsEl) actionsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
            };
        }
    }, 100);
}

// 정렬 버튼 토글 — 같은 버튼을 다시 누르면 원래 순서(none)로 복귀
function toggleSort(mode) {
    currentSortMode = (currentSortMode === mode) ? 'none' : mode;
    updateSortBtnUI();
    renderMetersList();
}

// 정렬 버튼 활성화 UI 업데이트
function updateSortBtnUI() {
    const dupBtn = document.getElementById('sort-btn-dup');
    const makerBtn = document.getElementById('sort-btn-maker');
    if (!dupBtn || !makerBtn) return;
    dupBtn.classList.toggle('active', currentSortMode === 'dup');
    makerBtn.classList.toggle('active', currentSortMode === 'maker');
}

// 상세 패널 닫기
function closeDetail() {
    document.getElementById('fullpage-overlay').classList.remove('active');
}

// 주소의 작업 상태 업데이트 후 마커 색상 갱신
function updateStatus(state) {
    const session = authGetSession();
    const reason = (document.getElementById('fail-reason')?.value || '').trim();
    saveStateEvent(
        currentAddress,
        state,
        state === 'fail' ? reason : '',
        session ? session.id   : '',
        session ? session.name : ''
    );
    updateMarkerColor(currentAddress);
}

// 주소의 작업 상태 초기화 (pending으로 되돌리기) — 체크박스는 유지
function resetStatus() {
    if (!workStatus[currentAddress]) return;

    // state만 pending으로 (체크박스/불가 유지)
    saveStateEvent(currentAddress, 'pending', '', '', '');

    updateMarkerColor(currentAddress);
    showDetail(currentAddress, currentMeters);
}

// 계기 체크 토글
function toggleMeterCheck(meterNumber) {
    if (!workStatus[currentAddress]) {
        workStatus[currentAddress] = { state: 'pending', checkedMeters: [], reason: '' };
    }
    const checkedMeters = workStatus[currentAddress].checkedMeters || [];
    const isChecked = checkedMeters.includes(meterNumber);
    saveCheckEvent(currentAddress, meterNumber, !isChecked);
}

// ── 계기 추가 모달 (admin 전용) ───────────────────────────────
function openAddMeterModal() {
    if (!currentAddress) return;
    document.getElementById('add-meter-addr').textContent = currentAddress;
    document.getElementById('add-meter-input').value = '';
    document.getElementById('add-meter-toast').style.display = 'none';
    document.getElementById('add-meter-overlay').style.display = 'flex';
    // 알파벳 보조 버튼 핸들러 (한 번만 바인딩되도록 매번 재할당)
    document.querySelectorAll('.add-meter-alpha-btn').forEach(btn => {
        btn.onclick = () => {
            const inp = document.getElementById('add-meter-input');
            const ch = btn.dataset.ch;
            if (ch === 'BS') {
                inp.value = inp.value.slice(0, -1);
            } else if (inp.value.length < 11) {
                inp.value = inp.value + ch;
            }
            inp.focus();
        };
    });
    setTimeout(() => document.getElementById('add-meter-input').focus(), 100);
}

function closeAddMeterModal() {
    document.getElementById('add-meter-overlay').style.display = 'none';
}

function showAddMeterToast(msg) {
    const t = document.getElementById('add-meter-toast');
    t.textContent = msg;
    t.style.display = 'block';
}

// QR 스캐너 호출 — 종로앱과 동일한 QrScanner 모듈
function openAddMeterQr() {
    if (typeof QrScanner === 'undefined') {
        return showAddMeterToast('QR 스캐너 로드 실패');
    }
    QrScanner.show((text /*, photoBlob */) => {
        const raw = String(text || '');
        // 신형 QR 포맷: "PID:127825 YYMM:24.11 MID:07530057365"
        const midMatch = raw.match(/MID\s*[:：]?\s*([A-Za-z0-9]+)/i);
        let meterId = '';
        if (midMatch) {
            meterId = String(midMatch[1]).toUpperCase();
            if (meterId.length > 11) meterId = meterId.slice(0, 11);
        } else {
            // 구형 폴백
            const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            meterId = cleaned.length >= 11 ? cleaned.slice(0, 11) : cleaned;
        }
        document.getElementById('add-meter-input').value = meterId;
    });
}

async function saveNewMeter() {
    const input = document.getElementById('add-meter-input');
    const meterId = (input.value || '').trim().toUpperCase();

    if (!meterId || meterId.length !== 11) {
        return showAddMeterToast('계기번호 11자리 확인');
    }
    // 중복 체크 (기존 + 추가)
    const allMeters = getMetersWithAdded();
    if (allMeters.some(m => m.계기번호 === meterId)) {
        return showAddMeterToast('이미 등록된 계기번호');
    }

    try {
        await saveAddedMeter(currentAddress, meterId, {});
        closeAddMeterModal();
        renderMetersList();
        if (typeof updateMarkerColor === 'function') updateMarkerColor(currentAddress);
    } catch (e) {
        showAddMeterToast('저장 실패: ' + e.message);
    }
}
