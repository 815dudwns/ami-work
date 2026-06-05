// awms-saverow.js — 종로 교체완료 1건 → awms 임시저장(WORK_STEP=25) 등록
// =====================================================================
// 검증본(awms-bridge/awms-poster.js) 철거 로직 그대로 이식.
//   조회 폴백 체인: 봉인조회(LV_CONS_NO) + 고객조회(CUST_NO/계약종별) + getMainList(차수정확)
//   → getMainList(작업목록)에 없어도 봉인+고객조회로 등록 가능 (계기번호 직접 입력 동작과 동일)
//   295키 TMPL_5000 템플릿 사용. saveRow는 awmsEval FormData(멀티웹뷰).
//   사진 미첨부(임시저장 단계). result===1 성공.
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

// ---- awmsEval GET 헬퍼 (awms 웹뷰 same-origin fetch) ----
async function _awmsGet(url) {
    const expr = `(async()=>{const r=await fetch(${JSON.stringify(url)},{credentials:'include'});const t=await r.text();try{return JSON.parse(t);}catch(e){return {__raw:t};}})()`;
    return await awmsEval(expr);
}
function _first(d) { return Array.isArray(d) ? (d[0] || {}) : (d || {}); }

// ---- 지침 칸수 규칙 (jongno utils.js readingFieldsFor와 동일 — 어제 분석 확정) ----
//   계약전력(pwr)>=20 & 계약종별(clas) {211,218,311,410,430} → 4칸
//   계약전력>=20 & {213,610} → 2칸 / {905,910,915} → 야간1칸 / 그외 → 주간1칸
function readingFieldsFor(clas, pwr) {
    const code = parseInt(String(clas == null ? '' : clas), 10);
    const pwrNum = parseInt(pwr, 10) || 0;
    if (!isNaN(code)) {
        if (pwrNum >= 20 && [211, 218, 311, 410, 430].includes(code)) return ['whme_day', 'whme_mngt', 'dm_mt_day', 'var_day'];
        if (pwrNum >= 20 && [213, 610].includes(code)) return ['whme_day', 'dm_mt_day'];
        if ([905, 910, 915].includes(code)) return ['whme_mngt'];
    }
    return ['whme_day'];
}

// ---- 봉인/공사번호: mobMtr8000/getMainList (무파라미터, 현재 차수) ----
async function _lookupSeal() {
    return _first(await _awmsGet(AWMS_API + '/mobMtr8000/getMainList'));
}
// ---- 고객정보: mobMtr5000/selectCustomerInfo (계기번호 직접 입력 시 동작) ----
async function _lookupCustomerInfo(meterNo) {
    const url = AWMS_API + '/mobMtr5000/selectCustomerInfo'
        + `?BONBU_CD=${DEFAULT_AWMS.HDQR_CD}&OFFC_CD=${DEFAULT_AWMS.OFFICE_CD}`
        + `&vBarcdQr=${encodeURIComponent(meterNo)}&vMenu=10`;
    return _first(await _awmsGet(url));
}
// ---- 작업목록: mobMtr1000/getMainList (있으면 CONS_NO/CNTR_NO 차수정확) ----
async function _lookupMainList(whmNo) {
    const url = AWMS_API + '/mobMtr1000/getMainList'
        + `?FLAG=1&DEPT1=${DEFAULT_AWMS.HDQR_CD}&busiKey=`
        + `&searchVal=${encodeURIComponent(whmNo)}&sortKey=&workStep=20,25,28&pPageNo=1&pRowCount=100`;
    const d = await _awmsGet(url);
    const arr = Array.isArray(d) ? d : ((d && (d.data || d.list)) || []);
    return arr.find(x => String(x.WHM_NO || '').trim() === String(whmNo).trim()) || arr[0] || null;
}

// ---- 신설 상세 베이스: mobMtr1000/getDetail (301키, 신설 payload 베이스) ----
async function _lookupGetDetail(consNo, cntrNo, consTgtSeqno) {
    const url = AWMS_API + '/mobMtr1000/getDetail'
        + `?FLAG=1&HDQR_CD=${DEFAULT_AWMS.HDQR_CD}`
        + `&CONS_NO=${encodeURIComponent(consNo)}`
        + `&CNTR_NO=${encodeURIComponent(cntrNo)}`
        + `&CONS_TGT_SEQNO=${encodeURIComponent(consTgtSeqno)}`;
    return _first(await _awmsGet(url));
}
// ---- 신설 자재: mobMtl1000/selectMtrlUseYn (mob/mtl 도메인 — mtr 아님) ----
async function _lookupMtrl(newMeterNo) {
    try {
        const url = 'https://awms.kdn.com/ami/mob/mtl/mobMtl1000/selectMtrlUseYn'
            + `?vBarcdQr=${encodeURIComponent(newMeterNo)}&vGubun=T`;
        return _first(await _awmsGet(url));
    } catch (e) { return {}; }
}

// ---- 단상/삼상 판별 (계기번호 3~4자리) — meter_phase_classification 규칙 ----
//   삼상: G(45/46/47), Amigo(55) / 단상: E(17),EA(19),G(25/26/27),Amigo(53)
const _THREE_PHASE_CODES = new Set(['45', '46', '47', '55']);
const _SINGLE_PHASE_CODES = new Set(['17', '19', '25', '26', '27', '53']);
function _meterTypeCode(meterNo) {
    const cleaned = String(meterNo).replace(/-/g, '').padStart(11, '0');
    const code4 = cleaned.slice(2, 4);
    if (_THREE_PHASE_CODES.has(code4) || _SINGLE_PHASE_CODES.has(code4)) return code4;
    if (cleaned[2] === '1') return cleaned.slice(2, 4);
    return code4;
}
function _isThreePhase(meterNo, cntrClasCd) {
    const code = _meterTypeCode(meterNo);
    return _THREE_PHASE_CODES.has(code);
}

// ---- 신설 payload (getDetail 301키 베이스 + 오버라이드, WORK_STEP=25 유지) ----
//   awms-poster.js _buildNewPayloadFromDetail 이식 — 가지치기 금지
function _buildNewPayloadFromDetail(newMeterNo, detail, sealVal, consTgtSeqno, mtrlInfo, mfgYm, P) {
    const three = _isThreePhase(newMeterNo, String(detail.CNTR_CLAS_CD || ''));
    const sealInt = parseInt(String(sealVal).trim(), 10);
    const sealNo = String(sealInt);
    const sealNo2 = three ? String(sealInt + 1) : '';   // 삼상=+1, 단상=빈값

    // getDetail 301키 베이스 복사 (null→'', 정수 float→int str)
    const payload = {};
    for (const k in detail) {
        const v = detail[k];
        if (v == null) payload[k] = '';
        else if (typeof v === 'number' && Number.isInteger(v)) payload[k] = String(v);
        else payload[k] = String(v);
    }
    // 사진 필드 초기화 (Blob 첨부 자리)
    for (const k in payload) { if (k.indexOf('ATCH_FILE_ID') >= 0) payload[k] = ''; }

    mtrlInfo = mtrlInfo || {};
    // 신설 제조월: jongno mfg_ym 최우선 > 자재 MNFCT_YM > 오늘월
    const cremoPrdcYm = (mfgYm ? String(mfgYm).replace(/-/g, '') : '') || mtrlInfo.MNFCT_YM || P.ym;

    const overrides = {
        WHM_NO: newMeterNo,
        CREMO_WHM_NO: newMeterNo,
        WORK_STEP: '25',                          // 임시저장 유지 (완료 28 금지 — 영준님 지시)
        EX_WORK_STEP: '25',                       // 임시저장 불러옴 표시 → 봉인+inc 트리거
        CSL_METR_TRML_SEAL_NO: sealNo,
        CSL_METR_TRML_SEAL_NO2: sealNo2,          // 삼상=+1, 단상=빈값
        CSL_METR_TRML_SEAL_KND_NQNT: '1',
        CONS_TGT_SEQNO: consTgtSeqno,             // 철거 saveRow 응답 → 1행 연결
        ACT_DATE: P.act,
        CMS_LAY_YMD: P.ymd, CTS_LAY_YMD: P.ymd, CREMO_CHRG_APLY_ST_YMD: P.ymd,
        CTTB_LAY_YMD: P.ymd, CSPD_LAY_YMD: P.ymd,
        CTS_PRDC_YM: P.ym, CMS_PRDC_YM: P.ym, CSPD_PRDC_YM: P.ym, CTTB_PRDC_YM: P.ym,
        CPT_PRDC_YM: P.ym, CCTD1_PRDC_YM: P.ym, CCTD2_PRDC_YM: P.ym, CCTD3_PRDC_YM: P.ym,
        CREMO_PRDC_YM: cremoPrdcYm,               // 신설계기 제조년월
        CREMO_MATL_NO: mtrlInfo.MTRL_NO || '',
        CREMO_MATL_STAT_CLCD: '1',
        CREMO_EFEC_YM: P.ym,
        LAY_METR_DTLS_CL_CD: '10',
        DEPT2: String(detail.OFFICE_CD || DEFAULT_AWMS.OFFICE_CD),
        CGD_WHME_NDL_MNGT_QTT: '0',
    };
    Object.assign(payload, overrides);
    const out = {};
    for (const k in payload) out[k] = payload[k] == null ? '' : String(payload[k]);
    return out;
}

// =====================================================================
const TMPL_5000 = {
    "WHM_SEQNO": "9999",
    "WORK_STEP": "25",
    "CUST_GEN_INST_CLCD": " ",
    "HDQR_CD": "3970",
    "CONS_NO": "",
    "WHM_NO": "",
    "CREMO_WHM_NO": "",
    "CNTR_NO": "",
    "MR_DD": "",
    "CREMO_CNTR_CLAS_CD": "",
    "DREMO_CNTR_CLAS_CD": "",
    "CREMO_MR_DD": "",
    "DREMO_MR_DD": "",
    "DREMO_WHME_STAT_CD": "4",
    "DREMO_DISM_RSN_CD": "0",
    "DREMO_MODM_BLTIN_YN": "N",
    "DREMO_MODEM_DIV": "",
    "DREMO_MODEM_MAC": "",
    "CGD_WHME_NDL_DGTS": "",
    "DGD_WHME_NDL_DGTS": "6",
    "CGD_DM_MT_NDL_DGTS": "",
    "DGD_DM_MT_NDL_DGTS": "",
    "CGD_VAR_NDL_DGTS": "",
    "DGD_VAR_NDL_DGTS": "",
    "CSL_METR_TRML_SEAL_KND_CD": "",
    "DSL_METR_TRML_SEAL_KND_CD": "",
    "CSL_METR_BATT_SEAL_KND_CD": "",
    "DSL_METR_BATT_SEAL_KND_CD": "",
    "CSL_MTBX_SEAL_KND_CD": "",
    "DSL_MTBX_SEAL_KND_CD": "",
    "CSL_TMSW_FRSD_SEAL_KND_CD": "",
    "DSL_TMSW_FRSD_SEAL_KND_CD": "",
    "CSL_TMSW_TRML_SEAL_KND_CD": "",
    "DSL_TMSW_TRML_SEAL_KND_CD": "",
    "CSL_MCNTR_SEAL_KND_CD": "",
    "DSL_MCNTR_SEAL_KND_CD": "",
    "CSL_CT_SEAL_KND_CD": "",
    "DSL_CT_SEAL_KND_CD": "",
    "CSL_SPD_SEAL_KND_CD": "",
    "DSL_SPD_SEAL_KND_CD": "",
    "CSL_SEAL_DSTR_SEAL_KND_CD": "",
    "DSL_SEAL_DSTR_SEAL_KND_CD": "",
    "CCT_CPT_GRADE_CD": "",
    "DCT_CPT_GRADE_CD": "",
    "CCTD1_MANU_CD": "",
    "DCTD1_MANU_CD": "",
    "CCTD1_MATL_STAT_CLCD": "",
    "DCTD1_MATL_STAT_CLCD": "",
    "CCTD1_POSS_CLCD": "",
    "DCTD1_POSS_CLCD": "",
    "CCTD1_WHM_LOC_CD": "",
    "DCTD1_WHM_LOC_CD": "",
    "DCTD1_BAD_CS_CD": "",
    "DCTD1_DISM_RSN_CD": "",
    "DCTD1_PURC_CLCD": "",
    "DCTD1_DFCT_CLCD": "",
    "CCTD2_MANU_CD": "",
    "DCTD2_MANU_CD": "",
    "CCTD2_MATL_STAT_CLCD": "",
    "DCTD2_MATL_STAT_CLCD": "",
    "CCTD2_POSS_CLCD": "",
    "DCTD2_POSS_CLCD": "",
    "CCTD2_WHM_LOC_CD": "",
    "DCTD2_WHM_LOC_CD": "",
    "DCTD2_BAD_CS_CD": "",
    "DCTD2_DISM_RSN_CD": "",
    "DCTD2_PURC_CLCD": "",
    "DCTD2_DFCT_CLCD": "",
    "CCTD3_MANU_CD": "",
    "DCTD3_MANU_CD": "",
    "CCTD3_MATL_STAT_CLCD": "",
    "DCTD3_MATL_STAT_CLCD": "",
    "CCTD3_POSS_CLCD": "",
    "DCTD3_POSS_CLCD": "",
    "CCTD3_WHM_LOC_CD": "",
    "DCTD3_WHM_LOC_CD": "",
    "CCTD3_BAD_CS_CD": "",
    "DCTD3_DISM_RSN_CD": "",
    "DCTD3_PURC_CLCD": "",
    "DCTD3_DFCT_CLCD": "",
    "CTS_LV_MANU_CD": "",
    "CTS_HV_MANU_CD": "",
    "DTS_LV_MANU_CD": "",
    "DTS_HV_MANU_CD": "",
    "CTS_MATL_STAT_CLCD": "",
    "DTS_MATL_STAT_CLCD": "",
    "CTS_POSS_CLCD": "",
    "DTS_POSS_CLCD": "",
    "CTS_RGCU_CD": "",
    "DTS_RGCU_CD": "",
    "CTS_TISW_TIZO_CLCD": "",
    "DTS_TISW_TIZO_CLCD": "",
    "DTS_BAD_CS_CD": "",
    "DTS_DISM_RSN_CD": "",
    "DTS_PURC_CLCD": "",
    "DTS_DFCT_CLCD": "",
    "CMS_MANU_CD": "",
    "DMS_MANU_CD": "",
    "CMS_MATL_STAT_CLCD": "",
    "DMS_MATL_STAT_CLCD": "",
    "CMS_ELEC_SW_MGNT_CNT_CD": "",
    "DMS_ELEC_SW_MGNT_CNT_CD": "",
    "CMS_MS_RGCU_CD": "",
    "DMS_MS_RGCU_CD": "",
    "CMS_TISW_TIZO_CLCD": "",
    "DMS_TISW_TIZO_CLCD": "",
    "CMS_LAY_YMD": "",
    "DMS_LAY_YMD": "",
    "CMS_POSS_CLCD": "",
    "DMS_POSS_CLCD": "",
    "CMS_BIST_CLCD": "",
    "DMS_BIST_CLCD": "",
    "DMS_BAD_CS_CD": "",
    "DMS_DISM_RSN_CD": "",
    "DMS_PURC_CLCD": "",
    "DMS_DFCT_CLCD": "",
    "CMB_POSS_CLCD": "",
    "DMB_DISM_RSN_CD": "",
    "DMB_PURC_CLCD": "",
    "CSPD_MANU_CD": "",
    "DSPD_MANU_CD": "",
    "CSPD_MATL_STAT_CLCD": "",
    "DSPD_MATL_STAT_CLCD": "",
    "CSPD_POSS_CLCD": "",
    "DSPD_POSS_CLCD": "",
    "DSPD_BAD_CS_CD": "",
    "DSPD_DISM_RSN_CD": "",
    "DSPD_PURC_CLCD": "",
    "DSPD_DFCT_CLCD": "",
    "CREMO_MATL_STAT_CLCD": "",
    "CREMO_MANU_CD": "",
    "CREMO_POSS_CLCD": "",
    "CREMO_PRDC_YM": "",
    "CREMO_WHM_LOC_CD": "",
    "CPT_MANU_CD": "",
    "CPT_MATL_STAT_CLCD": "",
    "CPT_CPT_GRADE_CD": "",
    "CTTB_MANU_CD": "",
    "CTTB_POSS_CLCD": "",
    "DREMO_WHM_REFE_CLCD": "",
    "DREMO_PURC_CLCD": "",
    "DREMO_MANU_CD": "",
    "DREMO_POSS_CLCD": "",
    "DREMO_WHM_LOC_CD": "2",
    "DREMO_RCA_DISM_RSN_BIGCSS_CD": "01",
    "DREMO_RCA_DISM_RSN_MEDI_CD": "06",
    "DREMO_RCA_DISM_RSN_MICL_CD": "35",
    "DREMO_RCA_DISM_RSN_CD": "32",
    "DREMO_RCA_BAD_CS_BIGCSS_CD": "",
    "DREMO_RCA_BAD_CS_MEDI_CD": "",
    "DREMO_RCA_BAD_CS_CD": "",
    "DREMO_DFCT_CLCD": "",
    "DGD_AEXST_WHME_NDL_DGTS": "",
    "DGD_AEXST_DM_MT_NDL_DGTS": "",
    "DGD_AEXST_VAR_NDL_DGTS": "",
    "RSL_METR_TRML_SEAL_KND_CD": "",
    "RSL_METR_BATT_SEAL_KND_CD": "",
    "RSL_MTBX_SEAL_KND_CD": "",
    "RSL_TMSW_FRSD_SEAL_KND_CD": "",
    "RSL_TMSW_TRML_SEAL_KND_CD": "",
    "RSL_MCNTR_SEAL_KND_CD": "",
    "RSL_CT_SEAL_KND_CD": "",
    "RSL_SPD_SEAL_KND_CD": "",
    "RSL_SEAL_DSTR_SEAL_KND_CD": "",
    "RSL_TEST_TMBLK_SEAL_KND_CD": "",
    "RSL_CPT_BUSH_CVR_SEAL_KND_CD": "",
    "RSL_CPT_TRML_BX_SEAL_KND_CD": "",
    "CSL_TEST_TMBLK_SEAL_KND_CD": "",
    "CSL_CPT_BUSH_CVR_SEAL_KND_CD": "",
    "CSL_CPT_TRML_BX_SEAL_KND_CD": "",
    "DREMO_OTSD_DISM_YN": "",
    "DPT_MANU_CD": "",
    "DPT_DISM_RSN_CD": "",
    "DPT_DFCT_CLCD": "",
    "DPT_PURC_CLCD": "",
    "DTTB_MANU_CD": "",
    "DTTB_POSS_CLCD": "",
    "DTTB_DISM_RSN_CD": "",
    "DTTB_BAD_CS_CD": "",
    "DTTB_DFCT_CLCD": "",
    "DTTB_PURC_CLCD": "",
    "DSL_TEST_TMBLK_SEAL_KND_CD": "",
    "DSL_CPT_BUSH_CVR_SEAL_KND_CD": "",
    "DSL_CPT_TRML_BX_SEAL_KND_CD": "",
    "CCT_MATL_NO": "",
    "CCTD1_MNFCT_NO": "",
    "CCTD2_MNFCT_NO": "",
    "CCTD3_MNFCT_NO": "",
    "CTS_MATL_NO": "",
    "CMS_MATL_NO": "",
    "CMB_MATL_NO": "",
    "CSPD_MATL_NO": "",
    "CTTB_MATL_NO": "",
    "CPT_MATL_NO": "",
    "DCT_MATL_NO": "",
    "DCTD1_MNFCT_NO": "",
    "DCTD2_MNFCT_NO": "",
    "DCTD3_MNFCT_NO": "",
    "DTS_MATL_NO": "",
    "DMS_MATL_NO": "",
    "DMB_MATL_NO": "",
    "DSPD_MATL_NO": "",
    "DTTB_MATL_NO": "",
    "DPT_MATL_NO": "",
    "DREMO_MATL_NO": "",
    "CREMO_MATL_NO": "",
    "DGD_DEMOLITION_READ_STATE_VALID": "4",
    "DGD_DEMOLITION_READ_STATE_MAX": "",
    "DGD_DEMOLITION_READ_STATE_INVALID": "",
    "DGD_DEMOLITION_READ_STATE_GENERATION": "4",
    "DGD_DEMOLITION_READ_REASON_GENERATION": "0",
    "CSL_METR_TRML_SEAL_NO": "",
    "CSL_METR_BATT_SEAL_NO": "",
    "CSL_MTBX_SEAL_NO": "",
    "CSL_TMSW_FRSD_SEAL_NO": "",
    "CSL_TMSW_TRML_SEAL_NO": "",
    "CSL_MCNTR_SEAL_NO": "",
    "CSL_CT_SEAL_NO": "",
    "CSL_SPD_SEAL_NO": "",
    "CSL_SEAL_DSTR_SEAL_NO": "",
    "CSL_TEST_TMBLK_SEAL_NO": "",
    "CSL_CPT_BUSH_CVR_SEAL_NO": "",
    "CSL_CPT_TRML_BX_A_SEAL_NO": "",
    "CSL_CPT_TRML_BX_B_SEAL_NO": "",
    "CSL_CPT_TRML_BX_C_SEAL_NO": "",
    "DREMO_BREAK_YN": "",
    "DREMO_BREAK_CAUSE1": "",
    "DREMO_BREAK_CAUSE2": "",
    "DREMO_BREAK_CAUSE3": "",
    "CGD_WHME_NDL_DAY_QTT": "",
    "CGD_WHME_NDL_EVEN_QTT": "",
    "CGD_WHME_NDL_MNGT_QTT": "",
    "CGD_DM_MT_NDL_DAY_QTT": "",
    "CGD_DM_MT_NDL_EVEN_QTT": "",
    "CGD_DM_MT_NDL_MNGT_QTT": "",
    "CGD_VAR_NDL_DAY_QTT": "",
    "CGD_VAR_NDL_EVEN_QTT": "",
    "CGD_VAR_NDL_MNGT_QTT": "",
    "DGD_WHME_NDL_DAY_QTT": "",
    "DGD_WHME_NDL_EVEN_QTT": "",
    "DGD_WHME_NDL_MNGT_QTT": "",
    "DGD_DM_MT_NDL_DAY_QTT": "",
    "DGD_DM_MT_NDL_EVEN_QTT": "",
    "DGD_DM_MT_NDL_MNGT_QTT": "",
    "DGD_VAR_NDL_DAY_QTT": "",
    "DGD_VAR_NDL_EVEN_QTT": "",
    "DGD_VAR_NDL_MNGT_QTT": "",
    "DGD_AEXST_WHME_NDL_DAY_QTT": "",
    "DGD_AEXST_DM_MT_NDL_DAY_QTT": "",
    "DGD_AEXST_VAR_NDL_DAY_QTT": "",
    "DGD_AEXST_WHME_NDL_EVEN_QTT": "",
    "DGD_AEXST_DM_MT_NDL_EVEN_QTT": "",
    "DGD_AEXST_VAR_NDL_EVEN_QTT": "",
    "DGD_AEXST_WHME_NDL_MNGT_QTT": "",
    "DGD_AEXST_DM_MT_NDL_MNGT_QTT": "",
    "DGD_AEXST_VAR_NDL_MNGT_QTT": "",
    "DMB_YN": "",
    "CMB_YN": "",
    "CSL_METR_TRML_SEAL_KND_NQNT": "",
    "CSL_METR_BATT_SEAL_KND_NQNT": "",
    "CSL_MTBX_SEAL_KND_NQNT": "",
    "CSL_METR_TRML_SEAL_NO2": "",
    "CSL_METR_BATT_SEAL_NO2": "",
    "CSL_MTBX_SEAL_NO2": "",
    "ACT_DATE": "",
    "LAY_METR_DTLS_CL_CD": "20",
    "LAY_METR_CL_CD": "10",
    "LAY_STS_CD": "30",
    "DIST_LV_HV_CLCD": "1",
    "DCTD1_PRDC_YM": "",
    "DCTD2_PRDC_YM": "",
    "DCTD3_PRDC_YM": "",
    "DREMO_PRDC_YM": "",
    "DREMO_EFEC_YM": "",
    "DREMO_CHRG_APLY_ST_YMD": "",
    "DREMO_DISM_YMD": "",
    "DREMO_LST_MR_YMD": "",
    "DTTB_PRDC_YM": "",
    "DTTB_DISM_YMD": "",
    "DPT_DISM_YMD": "",
    "DGD_GENT_WHM_NDL_DAY_QTT": "",
    "DGD_GENT_WHM_NDL_EVEN_QTT": "",
    "DGD_GENT_WHM_NDL_MNGT_QTT": "",
    "DGD_ESS_WHME_NDL_DAY_QTT": "",
    "DGD_ESS_WHME_NDL_EVEN_QTT": "",
    "DGD_ESS_WHME_NDL_MNGT_QTT": "",
    "CNTR_PWR": "",
    "PACH_CLCD": "",
    "SD_ETC_BIZ_CD": " ",
    "WRK_PLCE_ADDR_CTT": "",
    "EX_WORK_STEP": "20",
    "DEPT2": "7793",
    "CNTR_CLAS_CD": "",
    "GUM_DAY": "",
    "RE_SAVE_YN": ""
};

function _buildDemolitionPayload(meterNo, removalValue, removalValues, ndDigits, customerInfo, sealInfo, P, mainInfo) {
    sealInfo = sealInfo || {}; mainInfo = mainInfo || {};
    // CONS_NO/CNTR_NO: 계기별 getMainList 우선(차수 정확) → 봉인조회/고객조회 폴백
    // (봉인조회 LV_CONS_NO는 현재 폰 차수 고정 → 다른 차수 계기 불일치 500. getMainList로 계기별 정확)
    const consNo = mainInfo.CONS_NO || sealInfo.LV_CONS_NO || customerInfo.CONS_NO || '';
    const cntrNo = mainInfo.CNTR_NO || customerInfo.CUST_NO || '';

    // 지침 칸수 = 계약종별(CNTR_CLAS_CD) + 계약전력(CNTR_PWR) — 고객조회(selectCustomerInfo) 값으로 결정
    //   jongno readingFieldsFor와 동일 규칙 (어제 분석 확정). 작업자 입력칸과 awms 칸 일치 보장 + 더블체크.
    //   해당 안 되는 칸 명시적 '' (템플릿 잡값 잔재 방지 — 2026-06-04 버그)
    const fields = readingFieldsFor(customerInfo.CNTR_CLAS_CD, customerInfo.CNTR_PWR);  // ['whme_day'] 등

    let dgdWhmeDay = '', dgdWhmeMngt = '', dgdDmMtDay = '', dgdVarDay = '';

    if (fields.length > 1) {
        // 2칸(213/610)·4칸(211/218/311/410/430, PWR>=20) → 작업자 칸별 입력값(removal_values) 사용
        const rv = removalValues || {};
        if (fields.includes('whme_day'))  dgdWhmeDay  = rv.whme_day  != null ? String(rv.whme_day)  : '';
        if (fields.includes('whme_mngt')) dgdWhmeMngt = rv.whme_mngt != null ? String(rv.whme_mngt) : '';
        if (fields.includes('dm_mt_day')) dgdDmMtDay  = rv.dm_mt_day != null ? String(rv.dm_mt_day) : '';
        if (fields.includes('var_day'))   dgdVarDay   = rv.var_day   != null ? String(rv.var_day)   : '';
    } else {
        // 단일칸(대부분): 규칙이 정한 칸(주간 whme_day / 야간 whme_mngt)에 단일값
        const single = (removalValues && removalValues[fields[0]] != null)
            ? String(removalValues[fields[0]]) : removalValue;
        if (fields[0] === 'whme_mngt') dgdWhmeMngt = single;
        else dgdWhmeDay = single;
    }

    const overrides = {
        CONS_NO: consNo,
        CNTR_NO: cntrNo,
        WHM_NO: meterNo,
        DREMO_PRDC_YM: customerInfo.PRDC_YM || '',
        DREMO_CNTR_CLAS_CD: customerInfo.CNTR_CLAS_CD || '',
        CNTR_CLAS_CD: customerInfo.CNTR_CLAS_CD || '',
        DREMO_MR_DD: customerInfo.GUM_DAY || '',
        GUM_DAY: customerInfo.GUM_DAY || '',
        WRK_PLCE_ADDR_CTT: customerInfo.WRK_PLCE_ADDR_CTT || '',
        CNTR_PWR: customerInfo.CNTR_PWR || '',
        DGD_WHME_NDL_DAY_QTT:      dgdWhmeDay,
        DGD_WHME_NDL_MNGT_QTT:     dgdWhmeMngt,
        DGD_DM_MT_NDL_DAY_QTT:     dgdDmMtDay,
        DGD_VAR_NDL_DAY_QTT:       dgdVarDay,
        DGD_WHME_NDL_DGTS: ndDigits,
        ACT_DATE: P.act,
        DREMO_CHRG_APLY_ST_YMD: P.ymd,
        DREMO_DISM_YMD: P.ymd,
        DREMO_LST_MR_YMD: P.ymd,
        DTTB_DISM_YMD: P.ymd,
        DPT_DISM_YMD: P.ymd,
        DREMO_EFEC_YM: P.ym,
        DCTD1_PRDC_YM: P.ym,
        DCTD2_PRDC_YM: P.ym,
        DCTD3_PRDC_YM: P.ym,
        DTTB_PRDC_YM: P.ym,
    };

    const payload = Object.assign({}, TMPL_5000, overrides);
    // 전부 문자열 (FormData)
    const out = {};
    for (const k in payload) out[k] = payload[k] == null ? '' : String(payload[k]);
    return out;
}

// ---- saveRow POST (awmsEval FormData, 사진 선택 첨부) ----
//   photo = {url, field, filename} 있으면 awms 웹뷰 내부에서 fetch→blob→append
//   사진은 photo-uploader.js가 awms통과형(큰해상도+ICC제거)으로 저장한 jongno Storage URL
function _saveRowExpr(entries, url, photo) {
    return `(async()=>{
        const fd=new FormData();
        const E=${JSON.stringify(entries)};
        for(const [k,v] of E) fd.append(k,v);
        const P=${JSON.stringify(photo || null)};
        let photoNote='무첨부';
        if(P && P.url){
            try{
                const pr=await fetch(P.url);
                if(pr.ok){ const b=await pr.blob(); fd.append(P.field,b,P.filename); photoNote='첨부 '+Math.round(b.size/1024)+'KB'; }
                else photoNote='사진HTTP'+pr.status;
            }catch(e){ photoNote='사진오류:'+(e&&e.message||e); }
        }
        const r=await fetch(${JSON.stringify(url)},{method:'POST',credentials:'include',body:fd});
        const t=await r.text();
        let j;try{j=JSON.parse(t);}catch(e){j=null;}
        return {status:r.status,body:t,result:j&&j.result,consTgtSeqno:j&&j.consTgtSeqno,photoNote};
    })()`;
}

// ---- 봉인설정 +1 (mobMtr8000/saveRow JSON) — 단상+1 / 삼상+2 ----
//   recording_seal2.jsonl 원본 검증. 신설 저장 직후 호출 → 설정 METR_SEAL_VAL 갱신(다음 계기 유니크)
async function _sealPlusOne(consNo, sealVal, three) {
    const inc = three ? 2 : 1;
    const newSeal = String(parseInt(String(sealVal).trim(), 10) + inc);
    const body = {
        BATT_SEAL_KND_CD: '', MTBX_SEAL_CNT_VAL: '', LV_CONS_NO: consNo, HV_CONS_NO: '',
        ETC_SEAL_VAL: '', BATT_SEAL_CNT_VAL: '', TRML_SEAL_KND_CD: 'A', OTSD_SEAL_VAL: '',
        ENCL_SEAL_VAL: '', MTBX_SEAL_KND_CD: '', SIMPLE_YN: 'N', TRML_SEAL_CNT_VAL: '1',
        METR_SEAL_VAL: newSeal,
    };
    const url = AWMS_API + '/mobMtr8000/saveRow';
    const expr = `(async()=>{const r=await fetch(${JSON.stringify(url)},{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})});const t=await r.text();return {status:r.status,body:t.slice(0,150)};})()`;
    const res = await awmsEval(expr);
    return { newSeal, inc, res };
}

// =====================================================================
// registerReplacement — app.js runOne/runAll 단일 진입점
//   풀플로우: 철거5000(+철거전사진) → 신설4000(+철거후사진) → 봉인설정+1
//   최종 임시저장(WORK_STEP=25) 유지 → awms에서 수동완료 (영준님 지시)
// =====================================================================
async function registerReplacement({ addr, meter, rep }) {
    if (!(window.AwmsQ && window.AwmsQ.callAwms)) {
        throw new Error('AwmsQ 브릿지 없음 — 실기기에서만 동작');
    }
    const L = (m, c) => { if (typeof log === 'function') log(m, c); };
    L(`[saverow] 시작: ${meter} (${addr})`);

    const newMeter      = String(rep.new_meter_id || '').trim();
    if (!newMeter) throw new Error('신설계기(new_meter_id) 없음');
    const removalValue  = rep.removal_value != null ? String(rep.removal_value) : '0';
    const removalValues = rep.removal_values || null;   // 1종2종 4칸
    const ndDigits      = rep.nd_digits != null ? String(rep.nd_digits) : '6';
    const mfgYm         = rep.new_meter_mfg_ym || '';   // 신설계기 제조년월
    const oldPhoto      = rep.old_meter_photo || '';    // 철거전 사진
    const newPhoto      = rep.new_meter_photo || '';    // 철거후 사진
    const P             = _kstParts();

    // 1) 조회 3종
    const sealInfo = await _lookupSeal();
    const sealVal  = sealInfo.METR_SEAL_VAL;
    L(`[saverow] 봉인조회 LV_CONS_NO=${sealInfo.LV_CONS_NO || '(없음)'} 계기봉인번호=${sealVal || '(없음)'}`);
    if (!sealVal) throw new Error('계기봉인번호(METR_SEAL_VAL) 없음 — awms 로그인 확인');

    const customerInfo = await _lookupCustomerInfo(meter);
    L(`[saverow] 고객조회 CUST_NO=${customerInfo.CUST_NO || '(없음)'} 계약종별=${customerInfo.CNTR_CLAS_CD || '(없음)'} 제조월=${customerInfo.PRDC_YM || '-'}`);

    const mainInfo = (await _lookupMainList(meter)) || {};
    L(`[saverow] 작업목록 CONS_NO=${mainInfo.CONS_NO || '(없음)'} CNTR_NO=${mainInfo.CNTR_NO || '(없음)'}`);

    // 2) CONS_NO/CNTR_NO 폴백 검증
    const consNo = mainInfo.CONS_NO || sealInfo.LV_CONS_NO || customerInfo.CONS_NO || '';
    const cntrNo = mainInfo.CNTR_NO || customerInfo.CUST_NO || '';
    if (!consNo) throw new Error('CONS_NO(공사번호) 확보 실패 — awms 로그인/차수 확인');
    if (!cntrNo) throw new Error(`CNTR_NO(계약번호) 확보 실패 — 고객조회 CUST_NO 없음: ${meter}`);

    const three = _isThreePhase(newMeter, customerInfo.CNTR_CLAS_CD);
    const _fields = readingFieldsFor(customerInfo.CNTR_CLAS_CD, customerInfo.CNTR_PWR);
    L(`[saverow] 지침칸수=${_fields.length}칸 [${_fields.join(',')}] / ${three ? '삼상' : '단상'} (계약종별 ${customerInfo.CNTR_CLAS_CD || '?'} / 계약전력 ${customerInfo.CNTR_PWR || '?'})`);

    // 3) 철거 saveRow (mobMtr5000) + 철거전 사진
    const demoPayload = _buildDemolitionPayload(meter, removalValue, removalValues, ndDigits, customerInfo, sealInfo, P, mainInfo);
    demoPayload.WORK_STEP = '25';      // 임시저장
    demoPayload.CREMO_WHM_NO = '';     // 신설단계에서 채움
    const demoEntries = Object.entries(demoPayload).map(([k, v]) => [k, v == null ? '' : String(v)]);
    L(`[saverow] 철거5000 POST 철거계기=${meter} CONS_NO=${consNo} CNTR_NO=${cntrNo}`);
    const res5 = await awmsEval(_saveRowExpr(demoEntries, AWMS_API + '/mobMtr5000/saveRow',
        oldPhoto ? { url: oldPhoto, field: 'DREMO_ATCH_FILE_ID_3_SRC', filename: 'DREMO_ATCH_FILE_ID_3.jpg' } : null));
    L(`[saverow] 철거5000 응답: result=${res5.result} consTgtSeqno=${res5.consTgtSeqno} 사진=${res5.photoNote} body=${String(res5.body || '').slice(0, 100)}`);
    if (res5.result !== 1) throw new Error('철거 saveRow 비정상(result!=1): ' + String(res5.body || '').slice(0, 200));

    const consTgtSeqno = String(res5.consTgtSeqno || '');
    if (!consTgtSeqno) throw new Error('철거 응답에 consTgtSeqno 없음');

    // 4) getDetail(신설 베이스 301키) + 자재조회
    const detail = await _lookupGetDetail(consNo, cntrNo, consTgtSeqno);
    const mtrlInfo = await _lookupMtrl(newMeter);
    L(`[saverow] getDetail 키수=${Object.keys(detail).length} / 자재 MTRL_NO=${mtrlInfo.MTRL_NO || '-'} MNFCT_YM=${mtrlInfo.MNFCT_YM || '-'}`);

    // 5) 신설 saveRow (mobMtr4000) + 철거후 사진 (WORK_STEP=25 유지)
    const newPayload = _buildNewPayloadFromDetail(newMeter, detail, sealVal, consTgtSeqno, mtrlInfo, mfgYm, P);
    const newEntries = Object.entries(newPayload).map(([k, v]) => [k, v == null ? '' : String(v)]);
    L(`[saverow] 신설4000 POST 신설계기=${newMeter} 제조월=${newPayload.CREMO_PRDC_YM} 봉인번호=${newPayload.CSL_METR_TRML_SEAL_NO}${newPayload.CSL_METR_TRML_SEAL_NO2 ? '/' + newPayload.CSL_METR_TRML_SEAL_NO2 : ''}`);
    const res4 = await awmsEval(_saveRowExpr(newEntries, AWMS_API + '/mobMtr4000/saveRow',
        newPhoto ? { url: newPhoto, field: 'CREMO_ATCH_FILE_ID_3_SRC', filename: 'CREMO_ATCH_FILE_ID_3.jpg' } : null));
    L(`[saverow] 신설4000 응답: result=${res4.result} 사진=${res4.photoNote} body=${String(res4.body || '').slice(0, 100)}`);
    if (res4.result !== 1) throw new Error('신설 saveRow 비정상(result!=1): ' + String(res4.body || '').slice(0, 200));

    // 6) 봉인설정 +1 (다음 계기 유니크)
    try {
        const s = await _sealPlusOne(consNo, sealVal, three);
        L(`[saverow] 봉인설정 +${s.inc} (${sealVal} → ${s.newSeal}) status=${s.res.status}`, 'ok');
    } catch (e) {
        L(`[saverow] 봉인설정 +1 실패(무시): ${e.message}`, 'warn');
    }

    return {
        mode: 'full', consTgtSeqno, newMeter,
        seal: newPayload.CSL_METR_TRML_SEAL_NO, status: 'ok',
    };
}

window.registerReplacement = registerReplacement;
