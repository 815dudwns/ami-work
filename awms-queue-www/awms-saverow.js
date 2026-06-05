// awms-saverow.js — 종로 교체완료 1건 → awms 임시저장(WORK_STEP=25) 등록
// =====================================================================
// 검증된 방식: awms-bridge/www/awms-poster.js submitTempSave 로직 이식
//   - mobMtr5000/saveRow 임시저장만 (WORK_STEP=25, CREMO_WHM_NO='')
//   - 신설(mobMtr4000) 단계 없음
//   - getMainList로 awmsRow 먼저 조회 → CONS_NO/CONS_TGT_SEQNO/CNTR_NO/CNTR_CLAS_CD 확보
//   - 사진 첨부 없음 (임시저장 단계, CORS 미검증 구간 제거)
//   - 2026-05-29 실성공(result:1) 필드셋 기준
// =====================================================================

const AWMS_API = 'https://awms.kdn.com/ami/mob/mtr';

// ---- KST 날짜 헬퍼 ----
function _kstParts() {
    const s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
    const [date, time] = s.split(' ');
    const [Y, M, D] = date.split('-');
    const [h, m] = time.split(':');
    return { ymd: Y + M + D, ym: Y + M, act: `${Y}${M}${D} ${h}:${m}` };
}

// ---- awms getMainList — 구계기번호로 1건 찾기 (awmsEval GET) ----
async function _findInAwms(whmNo) {
    const url = `${AWMS_API}/mobMtr1000/getMainList`
        + `?FLAG=1`
        + `&DEPT1=${encodeURIComponent(DEFAULT_AWMS.HDQR_CD)}`
        + `&busiKey=`
        + `&searchVal=${encodeURIComponent(whmNo)}`
        + `&sortKey=`
        + `&workStep=20,25,28`
        + `&pPageNo=1&pRowCount=100`;
    const expr = `(async()=>{const r=await fetch(${JSON.stringify(url)},{credentials:'include'});const d=await r.json();return d;})()`;
    const data = await awmsEval(expr);
    const arr = Array.isArray(data) ? data
        : (data && Array.isArray(data.data)) ? data.data
        : (data && Array.isArray(data.list)) ? data.list
        : [];

    // 진단 로그(리모컨) — 왜 못 찾는지 규명용
    if (typeof log === 'function') {
        const want = String(whmNo).trim();
        const sample = arr.slice(0, 5).map(x => String(x.WHM_NO || '').trim()).join(',');
        // 모든 행의 모든 필드에서 구계기번호가 어디 있는지 탐색
        let hitField = '';
        for (const x of arr) {
            for (const [k, v] of Object.entries(x)) {
                if (String(v || '').trim() === want) { hitField = k; break; }
            }
            if (hitField) break;
        }
        log(`[찾기] '${want}' 검색결과 ${arr.length}건 / WHM_NO샘플=[${sample}] / 일치필드=${hitField || '없음'}`);
        if (arr.length > 0 && !hitField) {
            log(`[찾기] 첫행 키: ${Object.keys(arr[0]).join(',').slice(0, 200)}`, 'warn');
        }
    }

    // 1차: WHM_NO 정확일치 / 2차 폴백: 다른 필드(CREMO_WHM_NO 등)에 있어도 그 행 채택
    const want = String(whmNo).trim();
    let row = arr.find(x => String(x.WHM_NO || '').trim() === want);
    if (!row) {
        row = arr.find(x => Object.values(x).some(v => String(v || '').trim() === want));
    }
    return row || null;
}

// ---- saveRow POST (awmsEval FormData, 사진 없음) ----
function _saveRowExprSimple(entries, url) {
    return `(async()=>{
        const fd=new FormData();
        const E=${JSON.stringify(entries)};
        for(const [k,v] of E) fd.append(k,v);
        const r=await fetch(${JSON.stringify(url)},{method:'POST',credentials:'include',body:fd});
        const t=await r.text();
        let j;try{j=JSON.parse(t);}catch(e){j=null;}
        return {status:r.status,body:t,result:j&&j.result,consTgtSeqno:j&&j.consTgtSeqno};
    })()`;
}

// =====================================================================
// registerReplacement — app.js runOne/runAll이 호출하는 단일 진입점
//   rep(jongno workStatus replacement) 필드:
//     new_meter_id, removal_value, removal_values(야간전용), old_meter_photo, new_meter_photo
//   meter = 철거(구)계기번호
//
// 임시저장 전용 (WORK_STEP=25). 신설(mobMtr4000) 없음.
// =====================================================================
async function registerReplacement({ addr, meter, rep }) {
    if (!(window.AwmsQ && window.AwmsQ.callAwms)) {
        throw new Error('AwmsQ 브릿지 없음 — 실기기에서만 동작');
    }

    if (typeof log === 'function') log(`[saverow] 시작: ${meter} (${addr})`);

    // 1) awms에서 구계기 조회 → CONS_NO/CONS_TGT_SEQNO/CNTR_NO/CNTR_CLAS_CD/MR_DD 확보
    const awmsRow = await _findInAwms(meter);
    if (!awmsRow) throw new Error('awms에 해당 계기 없음: ' + meter);

    if (typeof log === 'function') log(`[saverow] awmsRow: CONS_NO=${awmsRow.CONS_NO} CONS_TGT_SEQNO=${awmsRow.CONS_TGT_SEQNO}`);

    // 2) 지침값 결정
    //    rep.removal_values = {야간계기별} 우선, 없으면 rep.removal_value
    //    계약종별 905(심야전력) → 야간 MNGT_QTT / 그외 → 주간 DAY_QTT
    //    해당 안 되는 칸은 '' (null 오염 방지)
    const cntrClasCd = String(awmsRow.DREMO_CNTR_CLAS_CD || awmsRow.CNTR_CLAS_CD || '211');
    const isNight = cntrClasCd === '905';

    // removal_values가 있으면 계기별 값 우선, 없으면 removal_value 단일값
    const rawVal = (rep.removal_values && rep.removal_values[meter] != null)
        ? rep.removal_values[meter]
        : rep.removal_value;
    const removalValue = rawVal != null ? String(rawVal) : '0';

    const dayQtt  = isNight ? '' : removalValue;
    const mngtQtt = isNight ? removalValue : '';

    // 3) 자릿수: rep.nd_digits 있으면 우선, 없으면 기본 5
    //    (siteRow 없음 — inferDigits 대신 nd_digits or 5)
    const ndDigits = rep.nd_digits != null ? String(rep.nd_digits) : '5';

    // 4) 검침일: awmsRow.MR_DD 우선, 없으면 '08'
    const mrdd = awmsRow.MR_DD ? String(awmsRow.MR_DD).padStart(2, '0') : '08';

    // 5) 핵심 필드 (submitTempSave 검증 필드셋)
    const fields = {
        WHM_SEQNO:                  awmsRow.WHM_SEQNO != null ? String(awmsRow.WHM_SEQNO) : '9999',
        WORK_STEP:                  '25',
        HDQR_CD:                    DEFAULT_AWMS.HDQR_CD,
        OFFICE_CD:                  DEFAULT_AWMS.OFFICE_CD,
        CONS_NO:                    awmsRow.CONS_NO || '',
        CONS_TGT_SEQNO:             awmsRow.CONS_TGT_SEQNO != null ? String(awmsRow.CONS_TGT_SEQNO) : '',
        CNTR_NO:                    awmsRow.CNTR_NO || '',
        WHM_NO:                     String(meter),
        CREMO_WHM_NO:               '',           // 임시저장 단계: 빈값 (본저장 시 채움)
        DREMO_CNTR_CLAS_CD:         cntrClasCd,
        DREMO_MR_DD:                mrdd,
        DREMO_WHME_STAT_CD:         '4',
        DREMO_DISM_RSN_CD:          '0',
        DREMO_MODM_BLTIN_YN:        'N',
        DGD_WHME_NDL_DGTS:          ndDigits,
        DGD_WHME_NDL_DAY_QTT:       dayQtt,
        DGD_WHME_NDL_MNGT_QTT:      mngtQtt,
        DREMO_RCA_DISM_RSN_BIGCSS_CD: '01',
        DREMO_RCA_DISM_RSN_MEDI_CD: '06',
        DREMO_RCA_DISM_RSN_MICL_CD: '35',
        DREMO_RCA_DISM_RSN_CD:      '32',
        DREMO_WHM_LOC_CD:           '2',
    };

    const entries = Object.entries(fields).map(([k, v]) => [k, v == null ? '' : v]);

    if (typeof log === 'function') {
        log(`[saverow] 5000 POST WHM_NO=${meter} CONS_TGT_SEQNO=${fields.CONS_TGT_SEQNO} 905야간=${isNight}`);
    }

    // 6) saveRow POST (사진 없음 — 임시저장 단계, CORS 미검증 구간 제거)
    const res = await awmsEval(_saveRowExprSimple(entries, `${AWMS_API}/mobMtr5000/saveRow`));
    if (typeof log === 'function') {
        log(`[saverow] 5000 응답: status=${res.status} result=${res.result} consTgtSeqno=${res.consTgtSeqno} body=${String(res.body || '').slice(0, 120)}`);
    }

    // 성공 판정: result===1 (awms 응답 규칙)
    if (res.result !== 1) {
        throw new Error('saveRow 응답 비정상(result!=1): ' + String(res.body || '').slice(0, 200));
    }

    return {
        mode: 'temp',
        consTgtSeqno: String(res.consTgtSeqno || ''),
        status: 'ok',
    };
}

window.registerReplacement = registerReplacement;
