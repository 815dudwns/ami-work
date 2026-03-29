// detail.js — 상세 패널(오버레이) 로직

let currentAddress = '';
let currentMeters = [];

// 현재 정렬 모드: 'none' | 'dup' | 'maker'
let currentSortMode = 'none';

// 주소 클릭 시 상세 패널 표시
function showDetail(address, meters) {
    currentAddress = address;
    currentMeters = meters;

    const status = workStatus[address] || { state: 'pending', checkedMeters: [], reason: '' };
    status.checkedMeters = status.checkedMeters || [];

    document.getElementById('detail-address').textContent = address;

    // 좌표정확도가 approximate인 계기가 하나라도 있으면 "주소 오류" 표시
    const hasApproximate = meters.some(m => m.좌표정확도 === 'approximate');
    const errorTag = hasApproximate
        ? ' <span style="color:#ef4444;font-size:12px;">(주소 오류)</span>'
        : '';
    document.getElementById('detail-road-address').innerHTML = '📍 ' + meters[0].도로명주소 + errorTag;

    // 상태 색상 바 업데이트 (기능 3)
    updateStatusBar(status.state);

    // 지도 앱 버튼 3개 — 도로명주소로 검색
    const roadAddr = meters[0].도로명주소;
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

    btnHold.onclick = () => { updateStatus('hold'); closeDetail(); };
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
        if (!workStatus[currentAddress]) {
            workStatus[currentAddress] = { state: 'pending', checkedMeters: [], reason: '' };
        }
        workStatus[currentAddress].reason = e.target.value;
        saveStatus(workStatus);
    };

    // 작업자 정보 표시 (기능 4)
    updateWorkerInfo(status);

    // 변대주가 모두 같은 경우 공통 표시
    const allSamePole = meters.length > 0 && meters.every(m => m.변대주 === meters[0].변대주);
    const commonPoleEl = document.getElementById('common-pole');
    if (allSamePole && meters[0].변대주 && meters[0].변대주 !== '0') {
        const poleText = meters[0].변대주;
        const poleCopyBtn = `<button class="copy-btn pole-copy-btn" data-copy="${poleText}" title="변대주 복사" style="margin-left:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
        commonPoleEl.innerHTML = `변대주 ${poleText}${poleCopyBtn}`;
        commonPoleEl.style.display = 'block';
        // 공통 변대주 복사 버튼 이벤트 바인딩
        commonPoleEl.querySelector('.pole-copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            copyMeterNo(poleText);
        });
    } else {
        commonPoleEl.style.display = 'none';
    }

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
        const month = d.getMonth() + 1;
        const day = d.getDate();
        dateStr = `${month}월 ${day}일`;
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

// 계기 목록 HTML 생성 및 렌더링
function renderMetersList() {
    const meters = currentMeters;
    const sortedMeters = getSortedMeters();
    const status = workStatus[currentAddress] || { state: 'pending', checkedMeters: [], reason: '' };
    const allSamePole = meters.length > 0 && meters.every(m => m.변대주 === meters[0].변대주);

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

    const metersList = document.getElementById('meters-list');
    metersList.innerHTML = sortedMeters.map(meter => {
        const checked = (status.checkedMeters || []).includes(meter.계기번호) ? 'checked' : '';
        const parsedType = parseType(meter.계기번호) || meter.계기타입;
        const detailParts = [];
        // 변대주가 있고 공통 표시 영역에 없는 경우만 개별 표시 (복사 버튼 포함)
        if (!allSamePole && meter.변대주 && meter.변대주 !== '0') {
            const pCopyBtn = `<button class="copy-btn pole-copy-btn" data-copy="${meter.변대주}" title="변대주 복사" style="margin-left:3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
            detailParts.push(`변대주 ${meter.변대주}${pCopyBtn}`);
        }
        if (meter.상호 && meter.상호 !== '0') detailParts.push(`상호 ${meter.상호}`);
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
        return `
            <div class="meter-item ${rowClass(s2)}">
                <input type="checkbox" class="meter-checkbox"
                       data-meter="${meter.계기번호}" ${checked}>
                <div class="meter-info">
                    <span class="meter-type">${parsedType}</span>
                    ${noHtml}${copyBtn}
                    ${details ? `<div class="meter-details">${details}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // 체크박스 및 복사 버튼 이벤트 바인딩
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
    if (!workStatus[currentAddress]) {
        workStatus[currentAddress] = { state: 'pending', checkedMeters: [], reason: '' };
    }

    // 작업자 정보 기록 (기능 2)
    const session = authGetSession();
    workStatus[currentAddress].state = state;
    workStatus[currentAddress].updatedBy     = session ? session.id   : '';
    workStatus[currentAddress].updatedByName = session ? session.name : '';
    workStatus[currentAddress].updatedAt     = new Date().toISOString();

    saveStatus(workStatus);
    updateMarkerColor(currentAddress);
}

// 주소의 작업 상태 초기화 (pending으로 되돌리기)
function resetStatus() {
    if (!workStatus[currentAddress]) return;
    workStatus[currentAddress].state = 'pending';
    workStatus[currentAddress].checkedMeters = [];
    workStatus[currentAddress].reason = '';
    // 작업자 정보도 초기화
    workStatus[currentAddress].updatedBy     = '';
    workStatus[currentAddress].updatedByName = '';
    workStatus[currentAddress].updatedAt     = '';
    saveStatus(workStatus);
    updateMarkerColor(currentAddress);
    showDetail(currentAddress, currentMeters);
}

// 계기 체크 토글
function toggleMeterCheck(meterNumber) {
    if (!workStatus[currentAddress]) {
        workStatus[currentAddress] = { state: 'pending', checkedMeters: [], reason: '' };
    }

    const checkedMeters = workStatus[currentAddress].checkedMeters || [];
    workStatus[currentAddress].checkedMeters = checkedMeters;
    const idx = checkedMeters.indexOf(meterNumber);

    if (idx > -1) {
        checkedMeters.splice(idx, 1);
    } else {
        checkedMeters.push(meterNumber);
    }

    saveStatus(workStatus);
}
