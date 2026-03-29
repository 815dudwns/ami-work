// detail.js — 상세 패널(오버레이) 로직

let currentAddress = '';
let currentMeters = [];

// 주소 클릭 시 상세 패널 표시
function showDetail(address, meters) {
    currentAddress = address;
    currentMeters = meters;

    const status = workStatus[address] || { state: 'pending', checkedMeters: [], reason: '' };
    status.checkedMeters = status.checkedMeters || [];

    document.getElementById('detail-address').textContent = address;
    document.getElementById('detail-road-address').textContent = '📍 ' + meters[0].도로명주소;

    // 티맵 길안내 버튼 (도로명주소로 검색)
    document.getElementById('tmap-btn').onclick = () => {
        const roadAddr = meters[0].도로명주소;
        window.location.href = `tmap://search?name=${encodeURIComponent(roadAddr)}`;
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

    // 변대주가 모두 같은 경우 공통 표시
    const allSamePole = meters.length > 0 && meters.every(m => m.변대주 === meters[0].변대주);
    const commonPoleEl = document.getElementById('common-pole');
    if (allSamePole && meters[0].변대주) {
        commonPoleEl.textContent = `변대주 ${meters[0].변대주}`;
        commonPoleEl.style.display = 'block';
    } else {
        commonPoleEl.style.display = 'none';
    }

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

    // 계기 목록 HTML 생성
    const metersList = document.getElementById('meters-list');
    metersList.innerHTML = meters.map(meter => {
        const checked = status.checkedMeters.includes(meter.계기번호) ? 'checked' : '';
        const parsedType = parseType(meter.계기번호) || meter.계기타입;
        const detailParts = [];
        if (!allSamePole && meter.변대주) detailParts.push(`변대주 ${meter.변대주}`);
        if (meter.상호 && meter.상호 !== '0') detailParts.push(`상호 ${meter.상호}`);
        const details = detailParts.join(', ');

        // 계기번호 4구간 색상 분리
        const no = meter.계기번호;
        const s2 = no.slice(-2);
        const isDup = dupGroupIndex[s2] !== undefined;
        const seg4Style = isDup ? 'class="seg seg-dup"' : 'class="seg"';
        const noHtml = `<span class="meter-no-seg">` +
            `<span class="seg">${no.slice(0, 2)}</span>` +
            `<span class="seg seg-type">${no.slice(2, 4)}</span>` +
            `<span class="seg">${no.slice(4, -2)}</span>` +
            `<span ${seg4Style}>${s2}</span>` +
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

    document.getElementById('fullpage-overlay').classList.add('active');
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
    workStatus[currentAddress].state = state;
    saveStatus(workStatus);
    updateMarkerColor(currentAddress);
}

// 주소의 작업 상태 초기화 (pending으로 되돌리기)
function resetStatus() {
    if (!workStatus[currentAddress]) return;
    workStatus[currentAddress].state = 'pending';
    workStatus[currentAddress].checkedMeters = [];
    workStatus[currentAddress].reason = '';
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
