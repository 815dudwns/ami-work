// detail.js — 상세 패널(오버레이) 로직

let currentAddress = '';
let currentMeters = [];
// 합친 마커(같은 좌표 여러 지번)의 구성 지번 전체. 단일이면 [currentAddress]. — 표시용
let currentAddresses = [];
// 이 패널이 읽고 쓰는 workStatus 키. 한 주소가 마커 여러 개로 갈리면 주소와 다르다.
//   ★workStatus 접근은 반드시 이쪽을 쓴다. currentAddress는 화면 표시 전용.
let currentStatusKey = '';
let currentStatusKeys = [];

// 현재 정렬 모드: 'none' | 'dup' | 'maker'
let currentSortMode = 'none';

// ── 변대주 공통 표시 판정 (큰 글씨 블록) ──────────────────────────────────
//   ★예전엔 DCUID 만 봤다. 그래서 LTE 개소(DCU 를 안 쓰니 DCUID 가 원본에도 없다)는
//     블록이 통째로 안 뜨고 **변대주까지 같이 사라졌다**(영준님 지적 2026-08-19,
//     합동 종로 4마커). 전산화번호가 있으면 DCUID 가 없어도 띄운다.
//   ※두 값을 함께 비교한다 — 전산화번호만 보면 PLC+K-DCU 가 섞인 마커(명륜3가 1-1054)가
//     '같다'로 뭉쳐진다. 그 마커는 계기마다 DCU 가 달라 개별 표시로 내려가는 게 맞다.
//   ※값이 빈 계기가 섞여 있으면(원천에 없는 1건) 공통으로 보지 않는다 — 나머지와 같다는
//     근거가 없다. 그 마커는 계기별로 각자 찍힌다.
function poleIdOf(m) {
    return `${(m && m.변대주전산화) || ''}|${(m && m.DCUID) || ''}`;
}
function isPoleCommon(meters) {
    if (!meters || !meters.length) return false;
    if (!(meters[0].변대주전산화 || meters[0].DCUID)) return false;
    return meters.every(m => poleIdOf(m) === poleIdOf(meters[0]));
}

// 변대주 한 줄의 HTML — { html, copyVal }.
//   ★새 형식(전산화번호 + 괄호 전주명)은 **변대주전산화 필드가 있을 때만** 쓴다.
//     실효·재방문·고압은 그 필드가 없다(site-data 10,404건 전부). 그 경우 예전 그대로 그린다.
//     종로맵(jongno-combined/js/detail.js)과 형식·복사값을 맞춘 것이다.
function poleDisplay(m, iconSvg, btnStyle) {
    const poleNo = (m && m.변대주전산화) || '';
    const dcu = (m && m.DCUID) || '';
    let valHtml, copyVal;
    if (poleNo) {
        // DCU 차수(끝 2자리)는 전산화번호에 이어 붙은 형태일 때만 회색으로 뗀다. LTE 는 없다.
        const tail = (dcu && dcu.indexOf(poleNo) === 0 && dcu.length === poleNo.length + 2)
            ? `<span class="seg-dup">${dcu.slice(-2)}</span>` : '';
        valHtml = `<span>${poleNo}</span>${tail}`;
        copyVal = poleNo;
    } else if (/[A-Za-z]/.test(dcu)) {
        const dcuMain = dcu.slice(0, -2);
        valHtml = `<span>${dcuMain}</span><span class="seg-dup">${dcu.slice(-2)}</span>`;
        copyVal = dcuMain;
    } else {
        valHtml = `<span>${dcu}</span>`;
        copyVal = dcu;
    }
    // 괄호 안 전주명 — 종로맵과 같은 보조 표기(흐리게). 전산화번호가 있을 때만 붙인다.
    const nameHtml = (poleNo && m.변대주)
        ? ` <span style="opacity:0.7;font-weight:normal;">(${m.변대주})</span>` : '';
    const btn = `<button class="copy-btn pole-copy-btn" data-copy="${copyVal}" title="변대주 전산화번호 복사" style="${btnStyle}">${iconSvg}</button>`;
    return { html: `${valHtml}${nameHtml}${btn}`, copyVal };
}

// ── LP 수신 이력 한 줄 요약 (SKT 중계기) ──────────────────────────────────
//   영준님 지시 2026-08-21 "디테일에 표로 넣지 말고 그냥 말로."
//   회차 x LP1/LP2 표를 그렸다가 걷어냈다 — 지도에 올린 41건은 전부 미작업이라 표가
//   사실상 빈칸이었다(38건은 7회 전부 빈값). 내용이 있는 건 3건뿐인데 7행짜리 표를
//   41건 전부에 그리고 폰에서 가로 스크롤까지 붙일 값어치가 없었다.
//   ★데이터(lp_이력)는 그대로 둔다. 완료건이 들어오거나 회차가 쌓이면 다시 쓸 수 있다.
//
//   판정은 회차마다 **LP1·LP2 중 좋은 쪽**으로 본다 — 한쪽만 값이 있는 개소가 많아
//   하나만 보면 오판한다. ★'9/24'·'36/96' 은 정상이다(24개 중 9개라 미달로 보이지만
//   한전이 정상으로 판정한 실증이 있다). 실패는 '0/24' 뿐이다.
//   -> { text, bad } 를 돌려준다. bad(0수신)일 때만 빨강으로 그린다.
function lpSummary(meter) {
    const rows = meter && meter.lp_이력;
    if (!Array.isArray(rows) || !rows.length) return null;

    // '260612' -> '06/12'. 원본 표기를 그대로 내보내지 않는다.
    const label = (v) => {
        const s = String(v || '');
        return s.length === 6 ? `${s.slice(2, 4)}/${s.slice(4)}` : s;
    };

    const verdict = rows.map(r => {
        const vals = [r.lp1, r.lp2].map(v => String(v == null ? '' : v).trim()).filter(Boolean);
        if (!vals.length) return { state: '수신없음', value: '' };
        const ok = vals.find(v => v !== '0/24');
        return ok ? { state: '정상', value: ok } : { state: '0수신', value: '0/24' };
    });

    // 한 번도 안 붙은 개소 — 그 자체가 정보다(현재 41건 중 38건)
    if (verdict.every(v => v.state === '수신없음')) return { text: 'LP 수신 이력 없음', bad: false };

    const last = verdict[verdict.length - 1];
    if (last.state === '정상') {
        return { text: `LP 정상 ${last.value} (${label(rows[rows.length - 1].회차)})`, bad: false };
    }

    // 지금 상태가 언제부터 이어지는지 — 같은 판정이 연속된 첫 회차까지 거슬러 올라간다.
    let i = verdict.length - 1;
    while (i > 0 && verdict[i - 1].state === last.state) i--;
    return {
        text: `LP ${last.state} — ${label(rows[i].회차)}부터 ${verdict.length - i}회 연속`,
        bad: last.state === '0수신',
    };
}

// 주소 클릭 시 상세 패널 표시
function showDetail(address, meters, addresses, statusKeys) {
    currentAddress = address;
    currentMeters = meters;
    currentAddresses = (addresses && addresses.length) ? addresses : [address];
    currentStatusKeys = (statusKeys && statusKeys.length) ? statusKeys : currentAddresses;
    // 대표 키 — 클릭한 지번에 대응하는 키를 우선 고른다(없으면 첫 키).
    currentStatusKey = currentStatusKeys.find(k => addressOfStatusKey(k) === address) || currentStatusKeys[0];

    // 어드민 사진등록 버튼에 현재 주소 전달
    const adminBtn = document.getElementById('admin-upload-btn');
    if (adminBtn) adminBtn.href = `admin.html?addr=${encodeURIComponent(address)}`;

    // awms수집 버튼 — 이 주소 계기풀을 아미큐 앱으로 연동(handoff write + 딥링크)
    // 노출은 관리자만 (map.html 초기 isAdmin 블록에서 display 제어). 여기선 동작만 연결.
    const collectBtn = document.getElementById('awms-collect-btn');
    if (collectBtn) collectBtn.onclick = () => collectToAmiqueue(address, meters);

    const status = workStatus[currentStatusKey] || { state: 'pending', checkedMeters: [], reason: '' };
    status.checkedMeters = status.checkedMeters || [];

    // 주소 텍스트 추출 — 더러운 값(undefined/null/"-") 거름
    const DIRTY_RE = /^\s*(undefined|null|-)(\s+(undefined|null|-))*\s*$/i;
    const isUsable = (s) => {
        if (s == null) return false;
        const t = String(s).trim();
        return !!t && !DIRTY_RE.test(t);
    };
    const pick = (...vals) => vals.find(isUsable) || '';
    // 지번 — 합동시공은 원문 주소가 '도로명 4(창동 676-32,1층좌)' 꼴이라 그대로 쓰면 읽기 나쁘다.
    //   카카오가 확인해 준 지번주소가 있으면 그것을 먼저 쓰고, 없으면 예전대로 원문을 쓴다.
    //   (다른 데이터셋에는 지번주소 필드가 없어 동작이 그대로다. 동호수는 계기별 상세줄에 나온다.)
    const jibunAddr = pick(meters[0] && meters[0].지번주소, meters[0] && meters[0].주소, address);
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
        if (!workStatus[currentStatusKey]) {
            workStatus[currentStatusKey] = { state: 'pending', checkedMeters: [], reason: '' };
        }
        workStatus[currentStatusKey].reason = e.target.value;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
    };
    // blur/Enter 시 이벤트 큐에 추가
    const flushFailReason = () => {
        const session = authGetSession();
        const state = workStatus[currentStatusKey]?.state || 'pending';
        if (state !== 'pending') {
            saveStateEvent(
                currentStatusKey,
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
    const commonPoleEl = document.getElementById('common-pole');
    if (isPoleCommon(meters)) {
        const POLE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        const pole = poleDisplay(meters[0], POLE_ICON, 'margin-left:6px;');
        // 라벨 '변대주' + 전산화번호 + 차수(회색) + (전주명) + 통신방식.
        //   전주명 괄호는 종로맵과 형식을 맞춘 것이다(영준님 지적 2026-08-19).
        //   통신방식은 대장에서 확정된 값이다.
        const commTxt = meters[0].통신방식
            ? `<span style="margin-left:10px;color:#dc2626;">${meters[0].통신방식}</span>` : '';
        commonPoleEl.innerHTML = `변대주 ${pole.html}${commTxt}`;
        commonPoleEl.style.display = 'block';
        commonPoleEl.querySelector('.pole-copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            copyMeterNo(pole.copyVal);
        });
    } else {
        commonPoleEl.style.display = 'none';
    }

    // DCU 철거예정 표기 — 큰 글씨 공통줄에 '변대주명 + 판정'을 한 줄 더 붙인다.
    //   (영준님 지시 2026-08-02: 변대주 값 안이 아니라 위 큰 글씨에)
    //   판정은 data 의 dcu_철거예정 필드('DCU 철거예정 개소 LTE 시설' | 'DCU 유지').
    //   DCUID 가 없어 위 블록이 숨겨진 경우에도 태그가 있으면 줄을 살린다.
    const dcuTag = meters.find(m => m.dcu_철거예정)?.dcu_철거예정 || '';
    if (dcuTag) {
        // ★DCU 는 변대주에 붙는다 — 철거예정 판정도 변대주 기준이므로 인입주를 쓰면 안 된다
        //   (영준님 2026-08-12). 인입주를 먼저 보던 탓에 다른 전주 이름이 태그 옆에 찍혔다.
        const poleName = meters.find(m => m.변대주);
        const nameTxt = (poleName && poleName.변대주) || '';
        const isRemove = dcuTag.indexOf('철거') !== -1;
        const tagHtml =
            `<div style="margin-top:${commonPoleEl.style.display === 'block' ? '4px' : '0'};` +
            `color:${isRemove ? '#b91c1c' : '#1d4ed8'};">` +
            `${nameTxt ? nameTxt + ' ' : ''}${dcuTag}</div>`;
        commonPoleEl.innerHTML += tagHtml;
        commonPoleEl.style.display = 'block';
    }

    // 재작업 알림 (rework=true) — 상단에 표시
    const reworkEl = document.getElementById('rework-notice');
    if (reworkEl) {
        if (status.rework === true) {
            // 이전 완료자: 이름 우선, 없으면 ID를 계정명으로 변환
            const prevRaw = status.previousCompleteByName || status.previousCompleteBy || '';
            let prevName = prevRaw;
            if (typeof ACCOUNTS !== 'undefined') {
                const acc = ACCOUNTS.find(a => a.id === prevRaw);
                if (acc) prevName = acc.name;
            }
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
            // 장애 데이터셋은 한 레코드가 MAC 그룹이라 계기번호가 없다 — 널가드 필수.
            const sa = String(a.계기번호 || '').slice(-2);
            const sb = String(b.계기번호 || '').slice(-2);
            if (sa !== sb) return sa.localeCompare(sb);
            return meters.indexOf(a) - meters.indexOf(b); // 그룹 내 원래 순서 유지
        });
    }
    if (currentSortMode === 'maker') {
        // 앞 2자리 기준 그룹 정렬 (같은 메이커 코드끼리 인접)
        return [...meters].sort((a, b) => {
            const pa = String(a.계기번호 || '').slice(0, 2);
            const pb = String(b.계기번호 || '').slice(0, 2);
            if (pa !== pb) return pa.localeCompare(pb);
            return meters.indexOf(a) - meters.indexOf(b); // 그룹 내 원래 순서 유지
        });
    }
    // 'none': 원래 순서
    return meters;
}

// 계기 개별 불가 토글
function toggleMeterFail(meterNumber) {
    if (!workStatus[currentStatusKey]) {
        workStatus[currentStatusKey] = { state: 'pending', checkedMeters: [], reason: '' };
    }
    const status = workStatus[currentStatusKey];
    if (!status.failedMeters) status.failedMeters = {};

    if (status.failedMeters[meterNumber] !== undefined) {
        // 이미 불가 → 해제
        delete status.failedMeters[meterNumber];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
        // Firebase 동기화: 불가 해제 이벤트
        if (typeof addEvent === 'function') {
            addEvent({ type: 'meterFail', address: currentStatusKey, meter: meterNumber, failed: false, ts: Date.now() });
        }
        if (typeof flushEventQueueDebounced === 'function') flushEventQueueDebounced();
        renderMetersList();
    } else {
        // 불가 처리 → 일단 빈 사유로 등록하고 입력창 표시 (renderMetersList에서 처리)
        status.failedMeters[meterNumber] = '';
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
        // Firebase 동기화: 불가 설정 이벤트 (사유는 saveMeterFailReason에서 갱신)
        if (typeof addEvent === 'function') {
            addEvent({ type: 'meterFail', address: currentStatusKey, meter: meterNumber, reason: '', failed: true, ts: Date.now() });
        }
        if (typeof flushEventQueueDebounced === 'function') flushEventQueueDebounced();
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
    if (!workStatus[currentStatusKey]) return;
    const status = workStatus[currentStatusKey];
    if (!status.failedMeters) status.failedMeters = {};
    status.failedMeters[meterNumber] = reason;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workStatus));
    // Firebase 동기화: 사유 갱신 이벤트
    if (typeof addEvent === 'function') {
        addEvent({ type: 'meterFail', address: currentStatusKey, meter: meterNumber, reason: reason, failed: true, ts: Date.now() });
    }
    if (typeof flushEventQueueDebounced === 'function') flushEventQueueDebounced();
}

// 추가된 계기(added_meters)를 currentMeters에 가짜 객체로 합쳐서 함께 표시
function getMetersWithAdded() {
    const base = currentMeters || [];
    const status = workStatus[currentStatusKey] || {};
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
    // 관리자 여부 (추가계기 삭제 등 관리자 전용 UI 제어)
    const isAdmin = (typeof authGetSession === 'function') && ((authGetSession() || {}).role === 'admin');
    const meters = getMetersWithAdded();
    // currentMeters를 임시로 합친 배열로 교체 (정렬 함수가 currentMeters 참조)
    const origCurrent = currentMeters;
    currentMeters = meters;
    const sortedMeters = getSortedMeters();
    currentMeters = origCurrent;
    const status = workStatus[currentStatusKey] || { state: 'pending', checkedMeters: [], reason: '' };
    // 큰 글씨(공통) 영역에 표시되었는지 — 위 showDetail 과 **같은 판정**을 쓴다(isPoleCommon).
    //   따로 계산하면 둘이 어긋나 변대주가 두 번 나오거나 아예 사라진다.
    const commonDcuShown = isPoleCommon(meters);
    const failedMeters = status.failedMeters || {};

    // 뒤 2자리 중복 그룹 계산 (중복 계기번호 색상 구분용)
    const suffix2Map = {};
    meters.forEach(m => {
        if (!m.계기번호) return;            // 장애(MAC 그룹) 레코드는 계기번호가 없다
        const s = String(m.계기번호).slice(-2);
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
        ? sortedMeters.filter(m => String(m.계기번호 || '').includes(searchVal))
        : sortedMeters;

    const metersList = document.getElementById('meters-list');
    metersList.innerHTML = filtered.map(meter => {
        // 장애 데이터셋은 단위가 다르다 — 한 레코드가 **모뎀 MAC 그룹**이라 계기 한 줄이 아니라
        //   MAC 헤더 + 그 밑 계기 트리를 그린다. 같은 주소에 MAC 이 둘이면 트리가 둘 생긴다
        //   (영준님 지시 2026-08-31 "맥이 여러개면 모달 안에 트리가 두개").
        //   계기목록에는 시트2(모뎀작업리스트)에서 끌어온 **정상 계기까지** 들어 있고,
        //   장애 시트에 있던 것만 `장애:true` 다 — 정상은 정상으로 두고 장애만 색을 준다.
        if (meter.category === '장애') {
            // 같은 주소에 MAC 이 여럿이면 트리가 여럿 그려진다. 몇 번째 MAC 인지 넘겨
            //   MAC 뒤 2자리에 색을 갈라 붙인다(영준님 지시 2026-09-01).
            const jIdx = filtered.filter(m => m.category === '장애').indexOf(meter);
            const jTot = filtered.filter(m => m.category === '장애').length;
            return jangaeTreeHtml(meter, jIdx, jTot);
        }
        const checked = (status.checkedMeters || []).includes(meter.계기번호) ? 'checked' : '';
        const parsedType = parseType(meter.계기번호) || meter.계기타입;
        const detailParts = [];
        // 변대주/DCU 큰 글씨 — 공통 표시 안 될 때만 개별 표시.
        //   ★조건이 공통 블록과 같아야 한다(전산화번호 또는 DCUID). DCUID 만 보면 LTE 개소가
        //     공통에서도 개별에서도 빠져 변대주가 어디에도 안 나온다(영준님 지적 2026-08-19).
        //   전산화번호가 있으면 라벨도 '변대주'로 맞춘다 — 실제로 그리는 값이 변대주이기 때문.
        //   없으면 예전 그대로 'DCU ID'(영문자면 끝 2자리 강조 + 복사 시 절단, 숫자만이면 전체).
        if (!commonDcuShown && (meter.변대주전산화 || meter.DCUID)) {
            const P_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
            const p = poleDisplay(meter, P_ICON, 'margin-left:3px;');
            detailParts.push(`${meter.변대주전산화 ? '변대주' : 'DCU ID'} ${p.html}`);
        }
        // 상호 (있을 때)
        if (meter.상호 && meter.상호 !== '0') detailParts.push(`상호 ${meter.상호}`);
        // 공동주택명 (상호와 다를 때만)
        if (meter.공동주택명 && meter.공동주택명 !== meter.상호) detailParts.push(meter.공동주택명);
        // 합친 마커: 이 계기의 지번이 대표 지번과 다를 때만 노출 (도로명 같고 지번 다른 케이스).
        //   기존 도로명/지번 표시는 그대로, 주택명·상호 밑에 "다른 지번"만 추가.
        //   (renderMetersList는 무인자 — 전역 currentAddress 기준, 주변 코드 따라 esc 없음)
        if (meter.주소 && meter.주소 !== currentAddress) {
            detailParts.push(`<span style="color:#9ca3af;">지번 ${meter.주소}</span>`);
        }
        // 작은 글씨 영역
        const subParts = [];
        // 1) 통신방식 (빨강) · 변대주 한글명 · 인입주
        if (meter.통신방식) subParts.push(`<span class="comm-type">${meter.통신방식}</span>`);
        // 변대주 — 이름 + 전산화번호.
        //   2026-08-06 에 번호를 뺀 것은 **큰 글씨(상위)에서 강등**한다는 뜻이었고, 디테일에는
        //   있어야 한다(영준님 2026-08-12 정정). 그때 문제였던 "대장에서 이름으로 찾은 번호가
        //   16% 어긋난다"는 여기 해당하지 않는다 — 아래 값은 별도 소스가 아니라 **DCUID 에서
        //   끝 2자리(DCU 차수)를 뗀 도출값**이라 DCU ID 줄과 항상 정합한다.
        //   ★숫자형 DCUID 는 전산화번호가 아니라 LTE 회선번호(012 생략)라 붙이지 않는다.
        if (meter.변대주) {
            const dcuRaw = meter.DCUID || '';
            // 전산화번호 — 변대주전산화(합동 종로)가 있으면 그것을 쓴다. LTE 는 DCUID 가 없어
            //   예전 방식(DCUID 에서 끝 2자리 절단)으로는 번호가 아예 안 나왔다.
            //   그 필드가 없는 실효·재방문·고압은 예전 그대로 도출값을 쓴다.
            const bdjuNo = meter.변대주전산화 || (/[A-Za-z]/.test(dcuRaw) ? dcuRaw.slice(0, -2) : '');
            subParts.push(`변대주 ${meter.변대주}${bdjuNo ? ` (${bdjuNo})` : ''}`);
        }
        // DCU 상태(회선상태·장애여부) 표시는 뺐다 — 영준님 2026-08-12: 우리 대상은 원본이
        //   'DCU 장애여부 = 정상' 으로 걸러 받은 개소라 다 정상이고, 확정적으로 받은 것은
        //   3번 시트(철거/유지 판정)뿐이다. 그 판정은 위 큰 글씨에 이미 나온다.
        //   필드(dcu_회선상태·dcu_장애여부)는 데이터에 남겨 두었다 — 필요하면 되살린다.
        // 인입주 — 변대주 줄과 같은 형식(이름 + 전산화번호). 전산화번호가 실린 데이터셋만 붙는다.
        //   ★DCU 판정에는 절대 쓰지 않는다. DCU 는 변대주에 붙는다(영준님 2026-08-12 확정,
        //     아래 dcu_철거예정 줄 주석 참조). 여기는 표시 전용이다.
        if (meter.인입주) {
            const inNo = meter.인입주전산화 || '';
            subParts.push(`인입주 ${meter.인입주}${inNo ? ` (${inNo})` : ''}`);
        }
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
        // 합동은 교체사유가 전 건 '합동시공' 고정이라, 아래 10)의 '합동시공·모뎀미시공' 과
        //   겹쳐 "사유 합동시공 · 합동시공·모뎀미시공" 으로 두 번 나왔다. 강조된 쪽만 남긴다.
        if (meter.교체사유 && meter.category !== '합동') subParts.push(`사유 ${meter.교체사유}`);
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
        // LP 수신 이력 — 표가 아니라 **한 줄 문장**이다(영준님 2026-08-21 "그냥 말로").
        //   카테고리가 아니라 lp_이력 필드 유무로 건다 — 나중에 다른 리스트가 LP 를 싣고
        //   들어와도 그대로 나온다. 실효·재방문·고압·합동은 필드가 없어 아무것도 안 그린다.
        const lp = lpSummary(meter);
        if (lp) subParts.push(lp.bad ? `<span style="color:#dc2626;">${lp.text}</span>` : lp.text);
        // 7) TOU 전용 필드 (category=tou일 때)
        if (meter.category === 'tou') {
            if (meter.재 || meter.tou_type === 'rework')
                subParts.push('<span style="color:#dc2626;font-weight:700;">재</span>');
            // 6/9 엑셀 디테일
            if (meter.통신방식)         subParts.push(`${meter.통신방식}`);
            if (meter.제조사 && meter.제조사 !== '제조사정보 없음') subParts.push(`${meter.제조사}`);
            if (meter.통신사)           subParts.push(`${meter.통신사}`);
            if (meter.차수)             subParts.push(`${meter.차수}`);
            if (meter.AMI등록일자)      subParts.push(`등록 ${meter.AMI등록일자}`);
            if (meter.LP수신)           subParts.push(`LP수신 ${meter.LP수신}`);
            if (meter.조치구분)         subParts.push(`${meter.조치구분}`);
            if (meter.수행주체)         subParts.push(`${meter.수행주체}`);
            if (meter.보강순위)         subParts.push(`${meter.보강순위}`);
            if (meter.모뎀MAC)          subParts.push(`MAC ${meter.모뎀MAC}`);
            // 기존 TOU 필드(구버전 호환)
            if (meter.tou_source)       subParts.push(`${meter.tou_source}`);
            if (meter.LP != null && meter.LP !== '' && meter.LP !== '#N/A')
                subParts.push(`LP ${meter.LP}`);
            if (meter.시공일 && meter.시공일 !== '#N/A')
                subParts.push(`시공일 ${meter.시공일}`);
            // 한전 개통불가 / 앱 작업이력(박제)
            if (meter.kepco_개통불가)
                subParts.push(`<span style="color:#dc2626;">한전불가 ${meter.kepco_개통불가}</span>`);
            if (meter.app_작업)
                subParts.push(`앱작업 ${meter.app_작업}`);
            if (meter.app_작업자)
                subParts.push(`작업자 ${meter.app_작업자}`);
        }
        // 8) 재방문 전용 필드 (category=재방문): 완료했으나 LP 미수신 = 모뎀 재등록 필요
        if (meter.category === '재방문') {
            subParts.push('<span style="color:#dc2626;font-weight:700;">재방문·LP미수신</span>');
            // 통신방식 옛→현 (교체하며 바뀐 경우 표시, 아니면 현재 방식만)
            if (meter.통신방식_전 && meter.통신방식 && meter.통신방식_전 !== meter.통신방식)
                subParts.push(`통신 ${meter.통신방식_전}→${meter.통신방식}`);
            else if (meter.통신방식)
                subParts.push(`통신 ${meter.통신방식}`);
            // DCU·변대주는 위 1)에서 이미 찍는다 — 여기서 또 push 하면 재방문 개소만
            //   같은 값이 두 번 나온다(전산화번호가 붙으면서 더 눈에 띄어 정리, 2026-08-12).
        }
        // 9) 고압철거 전용 필드 (category=고압): 철거할 모뎀 MAC + 현장 위치 비고
        //   원본(주덕기 0810 리스트)에 DCUID·변대주가 통째로 비어 있어, 계기를 특정하는 값은
        //   MAC 뿐이다. 비고는 "지하2층 전기실"처럼 계기를 찾아가는 위치 안내라 필수.
        if (meter.category === '고압') {
            // 한전기준 = 이 개소에 한전이 지시한 작업 성격(철거+재설치 / 철거).
            //   마커 글자라벨('교'/'철')의 출처라 계기별 실제 값을 여기서 확인한다.
            //   ※빈칸 건은 데이터셋에서 제외됐다(251 -> 168, apply_gapap_sheet2_fields.py).
            if (meter.한전기준) {
                subParts.push(`<span style="color:#dc2626;font-weight:700;">한전기준 ${meter.한전기준}</span>`);
            }
            if (meter.모뎀MAC) {
                const macCopyBtn = `<button class="copy-btn" data-copy="${meter.모뎀MAC}" title="모뎀MAC 복사" style="margin-left:2px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
                subParts.push(`MAC ${meter.모뎀MAC}${macCopyBtn}`);
            }
            // 지사 = 관할 지사(영준님 지시 2026-08-18). 소재지 구가 아니라 관리 주체라
            //   지하철처럼 구와 어긋나는 개소가 있다(남양주 별내동 -> 동대문중랑지사).
            //   그래서 주소 계열 바로 위에 붙여 함께 읽히게 둔다. 168건 전부 값이 있다.
            if (meter.지사) subParts.push(`지사 ${meter.지사}`);
            // 주소2 = 원천 엑셀의 개소명(예: '경춘선 갈매역'). 지번만으로 못 찾는 현장이라 싣는다.
            if (meter.주소2) subParts.push(`주소2 ${meter.주소2}`);
            // 비고1/비고2 는 원천의 두 칸을 그대로 가져온 것이고, 기존 `비고` 는 그 둘을
            //   ' / ' 로 합친 값이다(하위호환으로 데이터에는 남겨 둔다). 화면에 둘 다 찍으면
            //   같은 문장이 두 번 나오므로, 나뉜 값이 있으면 그쪽을 쓰고 없을 때만 합본을 쓴다.
            if (meter.비고1 || meter.비고2) {
                if (meter.비고1) subParts.push(`<span style="color:#2563eb;">비고1 ${meter.비고1}</span>`);
                if (meter.비고2) subParts.push(`<span style="color:#2563eb;">비고2 ${meter.비고2}</span>`);
            } else if (meter.비고 && meter.비고 !== '0') {   // 원천에 '0'만 든 칸이 1건 있다
                subParts.push(`<span style="color:#2563eb;">${meter.비고}</span>`);
            }
        }
        // 10) 합동시공 전용 필드 (category=합동): 다른 지역 계기팀이 계기만 갈고 간 개소.
        //   원본(awms FMPMTR 연간대상 실효계기 목록)에 변대주·DCUID·통신방식·MAC 이 아예 없다.
        //   그래서 현장에서 계기를 특정하는 값은 **철거계기번호**뿐이라 반드시 보여준다.
        //   ★없는 값을 유추해 채우지 않았다(2026-08-12 DCUID 유사매칭 864건 오염 전례).
        if (meter.category === '합동') {
            subParts.push('<span style="color:#2563eb;font-weight:700;">합동시공·모뎀미시공</span>');
            // 동호수 — 한 건물에 계기가 여럿인 개소(창동 657-109 는 7세대)에서 계기를 가르는
            //   유일한 값이라 앞에 둔다. 원문 주소에서만 뽑을 수 있다(카카오는 층·호를 모른다).
            if (meter.동호수) subParts.push(`<span style="font-weight:700;">동호수 ${meter.동호수}</span>`);
            // 계기교체 날짜 — ★'작업일시'(awms 원본)를 먼저 쓴다.
            //   '작업일' 은 지도 날짜 트리용 값이라 묶여 있을 수 있다. 소급 반영분은 여러 날에
            //   걸쳐 한 일을 한 날짜로 모아 올리므로, 그걸 그리면 실제 작업일이 가려진다
            //   (영준님 2026-08-26 "작업날짜 디테일에 쓰고"). 원본이 없으면 작업일로 떨어뜨린다.
            const raw작업 = String(meter.작업일시 || '').slice(0, 10).replace(/-/g, '');
            const d = raw작업 || String(meter.작업일 || '');
            if (d) {
                subParts.push(`계기교체 ${d.length === 8 ? `${d.slice(4, 6)}/${d.slice(6)}` : d}`);
            }
            if (meter.계기번호_전) subParts.push(`철거계기 ${meter.계기번호_전}`);
            if (meter.업체) subParts.push(`${meter.업체}`);
            if (meter.저압고압) subParts.push(`${meter.저압고압}`);
            if (meter.계약전력) subParts.push(`계약 ${meter.계약전력}kW`);
            if (meter.공사번호) subParts.push(`공사 ${meter.공사번호}`);
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
        const addedRemoveBtn = (isAdded && isAdmin)
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
                    await removeAddedMeter(currentStatusKey, m);
                    renderMetersList();
                    if (typeof updateMarkerColor === 'function') updateMarkerColor(currentStatusKey);
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
    // 합친 마커(같은 좌표 = 한 건물)는 완료/불가/보류를 구성 키 전부에 기록.
    //   ※ #2 결정점(영준님 확인 사안): 한 건물 한 번 작업 = 묶인 지번 다 처리.
    //   ★전파 범위는 '이 마커'로 한정된다. 같은 지번이라도 좌표가 갈려 다른 마커면
    //     상태 키가 다르므로(js/status-key.js) 그쪽까지 완료로 넘어가지 않는다.
    const targets = (currentStatusKeys && currentStatusKeys.length) ? currentStatusKeys : [currentStatusKey];
    targets.forEach(addr => {
        saveStateEvent(
            addr,
            state,
            state === 'fail' ? reason : '',
            session ? session.id   : '',
            session ? session.name : ''
        );
    });
    updateMarkerColor(currentStatusKey);
}

// 주소의 작업 상태 초기화 (pending으로 되돌리기) — 체크박스는 유지
function resetStatus() {
    if (!workStatus[currentStatusKey]) return;

    // ★되돌린 사람을 기록한다(영준님 2026-08-18: "초기화 이력은 지도에 표시 X. 우리 이력에만 남게").
    //   전엔 빈 문자열을 넘겨 updatedBy/updatedByName 이 덮여, 누가 되돌렸는지 추적이 안 됐다
    //   (2026-08-18 중계동505 2건·진관동 88 1건이 그래서 미상으로 남음).
    //   지도에는 안 나온다 — 표시부가 이미 pending 을 거른다:
    //     updateWorkerInfo() 는 state==='pending' 이면 숨김 / map.js 는 updatedByName 을 안 읽음
    //     / stats.html 은 pending 을 집계에서 continue.
    const session = authGetSession();

    // state만 pending으로 (체크박스/불가 유지) — 합친 마커는 구성 지번 전부
    const targets = (currentStatusKeys && currentStatusKeys.length) ? currentStatusKeys : [currentStatusKey];
    targets.forEach(addr => {
        if (workStatus[addr]) {
            saveStateEvent(addr, 'pending', '',
                session ? session.id   : '',
                session ? session.name : '');
        }
    });

    updateMarkerColor(currentStatusKey);
    showDetail(currentAddress, currentMeters, currentAddresses, currentStatusKeys);
}

// 계기 체크 토글
function toggleMeterCheck(meterNumber) {
    if (!workStatus[currentStatusKey]) {
        workStatus[currentStatusKey] = { state: 'pending', checkedMeters: [], reason: '' };
    }
    const checkedMeters = workStatus[currentStatusKey].checkedMeters || [];
    const isChecked = checkedMeters.includes(meterNumber);
    saveCheckEvent(currentStatusKey, meterNumber, !isChecked);
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
        await saveAddedMeter(currentStatusKey, meterId, {});
        closeAddMeterModal();
        renderMetersList();
        if (typeof updateMarkerColor === 'function') updateMarkerColor(currentStatusKey);
    } catch (e) {
        showAddMeterToast('저장 실패: ' + e.message);
    }
}

// ── awms수집 연동: 이 주소 계기풀을 collect_handoff에 write → 아미큐 앱 딥링크 ──
async function collectToAmiqueue(address, meters) {
    if (!Array.isArray(meters) || !meters.length) { alert('이 주소에 계기가 없습니다.'); return; }
    if (typeof db === 'undefined' || !db) { alert('Firebase 미연결'); return; }
    // 아미큐 수집에 필요한 필드만 추려 가볍게 전달
    const slim = meters.map(m => ({
        계기번호: String(m.계기번호 || ''),
        계기타입: m.계기타입 || '',
        통신방식: m.통신방식 || '',
        지사: m.지사 || '',
        변대주: m.변대주 || '',
        DCUID: m.DCUID || '',
        주소: m.주소 || address,
        도로명주소: m.도로명주소 || '',
    })).filter(m => m.계기번호);
    if (!slim.length) { alert('계기번호 있는 계기가 없습니다.'); return; }
    const key = 'h' + Date.now().toString(36);
    try {
        await db.ref('collect_handoff/' + key).set({
            addr: address,
            jisa: slim[0].지사 || '',
            meters: slim,
            ts: Date.now(),
            by: (typeof currentUser !== 'undefined' && currentUser) ? currentUser : '',
        });
    } catch (e) { alert('연동 데이터 저장 실패: ' + e.message); return; }
    // 아미큐 앱 딥링크 (폰에서만 동작; 미설치/데스크톱이면 안내)
    const intentUrl = 'intent://collect?key=' + key
        + '#Intent;scheme=amiqueue;package=com.youngjun.amiqueue;S.key=' + key + ';end';
    const t0 = Date.now();
    try { window.location.href = intentUrl; } catch (e) {}
    setTimeout(() => {
        if (Date.now() - t0 < 2500) {
            alert('아미큐 앱이 열리지 않았습니다.\n폰에서 아미큐 설치 후 다시 시도하거나,\n아미큐 [수집] 버튼에 key를 입력하세요:\n\n' + key);
        }
    }, 1500);
}


// 장애 트리 — MAC 하나를 헤더 + 계기 목록으로 그린다.
//   MAC 속성: 기술타입·변대주·작업일·작업자·연결장치·개통여부 (영준님 지시).
//   ★DCUID 는 awms 값을 쓰지 않는다 — awms DCU_ID 는 `변대주+64/6` 이라 한전 대장과 체계가 다르다.
//     여기 실린 DCUID/변대주명은 계기번호로 우리 데이터에서 찾아온 진짜 값이다.
// idx = 이 주소에서 몇 번째 MAC 인지(0-based), tot = 그 주소의 MAC 개수.
//   MAC 은 12자리라 통째로는 눈이 안 따라간다 — **뒤 2자리**를 크게 띄우고,
//   MAC 이 둘 이상이면 그룹마다 색을 달리해 현장에서 헷갈리지 않게 한다.
function jangaeTreeHtml(g, idx = 0, tot = 1) {
    const esc = v => String(v == null ? '' : v);
    const mac = String(g.모뎀MAC || '');
    const COPY = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const head = [];
    if (g.기술타입) head.push(`<b>${esc(g.기술타입)}</b>`);
    if (g.변대주명) head.push(`변대주 ${esc(g.변대주명)}`);
    else if (g.변대주) head.push(`변대주 ${esc(g.변대주)}`);
    if (g.DCUID) head.push(`DCU ${esc(g.DCUID)}`);
    if (g.작업일) head.push(`작업 ${esc(g.작업일).slice(5)}`);
    const worker = [g.작업자1, g.작업자2].filter(Boolean).join('·');
    if (worker) head.push(esc(worker));
    if (g.외장형연결장치) head.push(`연결장치 ${esc(g.외장형연결장치)}`);

    // 계기번호 뒤 2자리 중복 — 한 개소에 같은 끝자리가 여럿이면 현장에서 헷갈린다.
    //   실효 모달의 dup-row-N 과 같은 체계를 쓴다(영준님 2026-09-02 "계기에 해놔야지").
    const sufCount = {};
    (g.계기목록 || []).forEach(m => {
        const t = String(m.계기번호 || '').slice(-2);
        if (t) sufCount[t] = (sufCount[t] || 0) + 1;
    });
    const dupIdx = {};
    let di = 0;
    Object.keys(sufCount).sort().forEach(t => { if (sufCount[t] > 1) dupIdx[t] = di++; });

    const rows = (g.계기목록 || []).map(m => {
        const bad = !!m.장애;
        const no = String(m.계기번호 || '');
        const suf = no.slice(-2);
        const dupCls = dupIdx[suf] !== undefined ? ` dup-row-${dupIdx[suf] % 10}` : '';
        const st = m.상태 === '실패' ? '실패' : (m.상태 === '성공' ? '성공' : (m.상태 || '미판정'));
        const stColor = m.상태 === '성공' ? '#16a34a' : (m.상태 === '실패' ? '#dc2626' : '#9ca3af');
        // 주택명·호수 — 한 건물에 계기가 여럿인 개소에서 계기를 가르는 유일한 값이라
        //   계기번호 옆에 크게 둔다(영준님 지시). 장애 시트엔 없어 계기번호로 우리 데이터에서
        //   끌어왔다 — 2,837건 중 1,489건(52%) 채워졌고 나머지는 원천에 없다.
        const ho = String(m.공동주택명 || '').trim();
        const hoHtml = ho ? `<span class="jangae-ho">${esc(ho)}</span>` : '';
        const sub = [];
        if (m.상호) sub.push(`상호 ${esc(m.상호)}`);
        if (m.모뎀유형) sub.push(esc(m.모뎀유형));
        if (m.계기타입) sub.push(esc(m.계기타입));
        if (m.시설유형) sub.push(esc(m.시설유형));
        if (m.작업구분) sub.push(esc(m.작업구분));
        if (m.분기기) sub.push(`분기 ${esc(m.분기기)}`);
        if (m.LP) sub.push(`LP ${esc(m.LP)}`);
        return `
            <div class="jangae-meter${bad ? ' jangae-bad' : ''}${dupCls}">
                <span class="jangae-meter-no">${esc(no.slice(0, -2))}<span class="jangae-no-tail${dupCls ? ' dup' : ''}">${esc(no.slice(-2))}</span></span>
                <button class="copy-btn" data-copy="${esc(m.계기번호)}" title="계기번호 복사">${COPY}</button>
                ${hoHtml}
                <span style="color:${stColor};font-weight:700;margin-left:4px;">${st}</span>
                <div class="jangae-meter-sub">${sub.join(' · ')}</div>
            </div>`;
    }).join('');

    return `
        <div class="jangae-group">
            <div class="jangae-head">
                <span class="jangae-mac">${esc(mac)}</span>
                <button class="copy-btn" data-copy="${esc(mac)}" title="모뎀MAC 복사">${COPY}</button>
                ${tot > 1 ? `<span class="jangae-seq c${idx % 6}">MAC ${idx + 1}/${tot}</span>` : ''}
                <span class="jangae-count">장애 ${g.장애수 || 0}/${g.계기수 || 0}</span>
                <div class="jangae-head-sub">${head.join(' · ')}</div>
            </div>
            ${rows}
        </div>`;
}
