// === awms saveAct 자동화 검증 (사진 포함) ===
// awms.kdn.com 로그인된 탭의 콘솔에 붙여넣기
// 어제 임의 등록 데이터 그대로 + 가짜 1x1 PNG 사진 3장
// 성공 시 result:1 + 새 atchFileId 응답 → 등록되므로 화면에서 삭제 필요

(async () => {
  console.log('%c[awms-saveAct-test] 시작', 'color:lime;font-size:14px');
  if (!location.hostname.includes('awms.kdn.com')) {
    console.error('awms.kdn.com 탭에서 실행하세요'); return;
  }
  // 1x1 투명 PNG (67 bytes)
  const PNG_1X1 = new Uint8Array([
    0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,
    0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
    0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,0x89,0x00,0x00,0x00,
    0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0x00,0x01,0x00,0x00,
    0x05,0x00,0x01,0x0D,0x0A,0x2D,0xB4,0x00,0x00,0x00,0x00,0x49,
    0x45,0x4E,0x44,0xAE,0x42,0x60,0x82
  ]);

  const fields = {
    'ROW_TYPE': '2',
    'FILTER_ROW': 'N',
    'DEPT1': '3970',
    'DEPT2': '7793',
    'WORK_DIV': 'M1010',
    'REMV_MEMO': '',
    'INST_M': 'HW4050',
    'INST_S': 'HW405092',
    'IND_CBD_DIV_CD': '',
    'FAC1': '',
    'LINE_FAIR': '',
    'USE_CT': '',
    'USE_POWER': '',
    'AM_BAND': '',
    'FILM_BAND': '',
    'GRADEL': '',
    'G_WIRE': '',
    'DATA_NUM': '',
    'INSTR_NUM': '08550107657',
    'GN_NAME': '',
    'BUSI_NUM': 'C11G250023',
    'FCLTY_DIV': '10',
    'MODEM_DIV': '10',
    'EXT_CONN_DEV': 'N',
    'BUNGI': '',
    'LINE_TYPE': '',
    'VISIT_DIV': '',
    'WORKER1_SEQ': '729201',
    'WORKER2_SEQ': '58414',
    'WORKER3_SEQ': '',
    'EXT_FCTY_ID': '',
    'EXT_DCU_ID': '',
    'MAC_MODEM': '01288888888',
    'NEW_DCU_MAC': '',
    'EXT_DCU_MAC': '',
    'GUBUN': '01',
    'TGT_DIV_CD': '',
    'BONBU_CD': '',
    'CUST_NO': '',
    'METER_ID': '',
    'SEAL_BOX1': '',
    'SEAL_BOX2': '',
    'SEAL_METER1': '',
    'SEAL_METER2': '',
    'SEAL_OUTER1': '',
    'SEAL_OUTER2': '',
    'BIZ_DGR': '',
    'DCU_SIGONG_CD': 'N',
    'TDU_USE_YN': 'N',
    'EXT_MLN_MAC_MODEM': '',
    'CUR_MLN_MAC_MODEM': '',
    'EXT_MAC_MODEM': '',
    'CUR_MAC_MODEM': '',
    'EXT_INSTR_NUM': '',
    'EXT_MTRL_NO': '',
    'EXT_MANU_CD': '',
    'EXT_MNFCT_YM': '',
    'CUR_INSTR_NUM': '',
    'CUR_MTRL_NO': '',
    'CUR_MANU_CD': '',
    'CUR_MNFCT_YM': '',
    'MB_METER_ID': '',
    'MB_CNT': '',
    'MTR_WITH_YN': 'N',
    'MB_REG_CNT': '',
    'mbInsertCnt': '0',
    'DCU_ID': '',
    'ERR_LIST': '[]',
    'FLAG': 'M10',
    'WORK_STEP': '28',
    'SEAL_BOX': '',
    'SEAL_METER': '',
    'SEAL_OUTER': '',
    'SEAL_UPD': 'N',
    'ATCH_FILE_ID_3_SRC': '(binary)',
    'ATCH_FILE_ID_4_SRC': '(binary)',
    'ATCH_FILE_ID_5_SRC': '(binary)',
  };

  const fd = new FormData();
  for (const [k,v] of Object.entries(fields)) fd.append(k, v);
  // 사진 3장 (의무 슬롯)
  fd.append('ATCH_FILE_ID_3_SRC', new Blob([PNG_1X1], {type:'image/png'}), 'test3.png');
  fd.append('ATCH_FILE_ID_4_SRC', new Blob([PNG_1X1], {type:'image/png'}), 'test4.png');
  fd.append('ATCH_FILE_ID_5_SRC', new Blob([PNG_1X1], {type:'image/png'}), 'test5.png');

  console.log('필드:', Object.keys(fields).length, '+ 사진 3장 → POST 호출');
  try {
    const r = await fetch('/ami/mob/cst/mobCst1000/saveAct', {
      method:'POST', body:fd, credentials:'include',
      headers: { 'Accept':'application/json, text/plain, */*' }
    });
    const text = await r.text();
    console.log('%cSTATUS: ' + r.status, 'color:lime;font-size:16px');
    console.log('BODY:', text);
    window._lastSave = {status:r.status, body:text};
    if (text.includes('"result":1')) {
      console.log('%c✅ 자동화 성공 - awms 화면에서 1건 등록 확인 후 삭제하세요', 'color:lime;font-size:18px');
    } else {
      console.warn('⚠️ 예상 result:1 아님 - body 확인 필요');
    }
  } catch(err) {
    console.error('FETCH 실패:', err);
  }
})();
