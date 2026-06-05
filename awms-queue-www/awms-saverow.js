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

// ---- saveRow POST (awmsEval FormData, 사진 없음) ----
function _saveRowExpr(entries, url) {
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
// registerReplacement — app.js runOne/runAll 단일 진입점
//   임시저장 전용 (WORK_STEP=25). 신설(mobMtr4000) 없음. 사진 없음.
// =====================================================================
async function registerReplacement({ addr, meter, rep }) {
    if (!(window.AwmsQ && window.AwmsQ.callAwms)) {
        throw new Error('AwmsQ 브릿지 없음 — 실기기에서만 동작');
    }
    if (typeof log === 'function') log(`[saverow] 시작: ${meter} (${addr})`);

    const removalValue  = rep.removal_value != null ? String(rep.removal_value) : '0';
    const removalValues = rep.removal_values || null;   // 1종2종 4칸
    const ndDigits      = rep.nd_digits != null ? String(rep.nd_digits) : '6';
    const P             = _kstParts();

    // 1) 조회 3종 (검증본과 동일 순서)
    const sealInfo = await _lookupSeal();
    if (typeof log === 'function') log(`[saverow] seal LV_CONS_NO=${sealInfo.LV_CONS_NO || '(없음)'} sealVal=${sealInfo.METR_SEAL_VAL || '(없음)'}`);

    const customerInfo = await _lookupCustomerInfo(meter);
    if (typeof log === 'function') log(`[saverow] cust CUST_NO=${customerInfo.CUST_NO || '(없음)'} 계약종별=${customerInfo.CNTR_CLAS_CD || '(없음)'} 제조월=${customerInfo.PRDC_YM || '-'}`);

    const mainInfo = (await _lookupMainList(meter)) || {};
    if (typeof log === 'function') log(`[saverow] main CONS_NO=${mainInfo.CONS_NO || '(없음)'} CNTR_NO=${mainInfo.CNTR_NO || '(없음)'}`);

    // 2) CONS_NO/CNTR_NO 폴백 검증 (build와 동일 규칙)
    const consNo = mainInfo.CONS_NO || sealInfo.LV_CONS_NO || customerInfo.CONS_NO || '';
    const cntrNo = mainInfo.CNTR_NO || customerInfo.CUST_NO || '';
    if (!consNo) throw new Error(`CONS_NO 확보 실패 — awms 로그인/차수 확인 (seal.LV_CONS_NO 없음)`);
    if (!cntrNo) throw new Error(`CNTR_NO 확보 실패 — 고객조회 CUST_NO 없음: ${meter}`);

    // 3) 지침 칸수 더블체크 로그 (계약종별+계약전력 → 칸)
    const _fields = readingFieldsFor(customerInfo.CNTR_CLAS_CD, customerInfo.CNTR_PWR);
    if (typeof log === 'function') log(`[saverow] 지침칸수=${_fields.length}칸 [${_fields.join(',')}] (계약종별 ${customerInfo.CNTR_CLAS_CD || '?'} / 계약전력 ${customerInfo.CNTR_PWR || '?'})`);

    // 4) 철거 payload (295키 템플릿 + 오버라이드)
    const payload = _buildDemolitionPayload(meter, removalValue, removalValues, ndDigits, customerInfo, sealInfo, P, mainInfo);
    payload.WORK_STEP   = '25';   // 임시저장
    payload.CREMO_WHM_NO = '';    // 임시저장 단계 (본저장 시 채움)

    const entries = Object.entries(payload).map(([k, v]) => [k, v == null ? '' : String(v)]);
    if (typeof log === 'function') log(`[saverow] 5000 POST WHM_NO=${meter} CONS_NO=${consNo} CNTR_NO=${cntrNo} 905야간=${String(customerInfo.CNTR_CLAS_CD || '') === '905'}`);

    // 4) saveRow
    const res = await awmsEval(_saveRowExpr(entries, AWMS_API + '/mobMtr5000/saveRow'));
    if (typeof log === 'function') log(`[saverow] 5000 응답: status=${res.status} result=${res.result} consTgtSeqno=${res.consTgtSeqno} body=${String(res.body || '').slice(0, 150)}`);

    if (res.result !== 1) {
        throw new Error('saveRow 응답 비정상(result!=1): ' + String(res.body || '').slice(0, 200));
    }
    return { mode: 'temp', consTgtSeqno: String(res.consTgtSeqno || ''), status: 'ok' };
}

window.registerReplacement = registerReplacement;
