// AMI Queue — saveAct 빌더 (트랙1: 더미 큐 → awms 설비등록 저장 28)
// awms 멀티웹뷰(AwmsQ)로 FormData saveAct 호출. GATE1(capture_full)로 확정한 필드값.
// WORK_STEP=28(완료/저장) — 삭제 가능. sendSelections(29 전송)는 별도, 영준님 승인 후.

const SAVEACT_URL = AWMS_BASE + '/ami/mob/cst/mobCst1000/saveAct';

// saveAct 99필드 기본 템플릿 (saveAct_test.js 기준, 빈값 다수)
const SACT_TMPL = {
    ROW_TYPE: '2', FILTER_ROW: 'N', DEPT1: '3970', DEPT2: '7793', WORK_DIV: 'M1010',
    REMV_MEMO: '', INST_M: '', INST_S: '', IND_CBD_DIV_CD: '', FAC1: '', LINE_FAIR: '',
    USE_CT: '', USE_POWER: '', AM_BAND: '', FILM_BAND: '', GRADEL: '', G_WIRE: '', DATA_NUM: '',
    INSTR_NUM: '', GN_NAME: '', BUSI_NUM: 'C11G250023', FCLTY_DIV: '10', MODEM_DIV: '10',
    EXT_CONN_DEV: '', BUNGI: '', LINE_TYPE: '', VISIT_DIV: '',
    WORKER1_SEQ: '729201', WORKER2_SEQ: '58414', WORKER3_SEQ: '',
    EXT_FCTY_ID: '', EXT_DCU_ID: '', MAC_MODEM: '', NEW_DCU_MAC: '', EXT_DCU_MAC: '',
    GUBUN: '01', TGT_DIV_CD: '', BONBU_CD: '', CUST_NO: '', METER_ID: '',
    SEAL_BOX1: '', SEAL_BOX2: '', SEAL_METER1: '', SEAL_METER2: '', SEAL_OUTER1: '', SEAL_OUTER2: '',
    BIZ_DGR: '', DCU_SIGONG_CD: 'N', TDU_USE_YN: 'N',
    EXT_MLN_MAC_MODEM: '', CUR_MLN_MAC_MODEM: '', EXT_MAC_MODEM: '', CUR_MAC_MODEM: '',
    EXT_INSTR_NUM: '', EXT_MTRL_NO: '', EXT_MANU_CD: '', EXT_MNFCT_YM: '',
    CUR_INSTR_NUM: '', CUR_MTRL_NO: '', CUR_MANU_CD: '', CUR_MNFCT_YM: '',
    MB_METER_ID: '', MB_CNT: '', MTR_WITH_YN: 'N', MB_REG_CNT: '', mbInsertCnt: '0',
    DCU_ID: '', ERR_LIST: '[]', FLAG: 'M10', WORK_STEP: '28',
    SEAL_BOX: '', SEAL_METER: '', SEAL_OUTER: '', SEAL_UPD: 'N',
};

function _instM(type) { return ({ E: 'HW4020', AE: 'HW4040', G: 'HW4030', AMIGO: 'HW4050' })[type] || 'HW4010'; }
function _commSuffix(comm) { return ({ 'ks-plc': '10', hpgp: '20', lte_IV: '70', 'k-dcu': '90', 'smgw-c': '92' })[comm] || ''; }

// 마스터 1행 entries (datapush_queue가 fcltyDiv/mbCnt/mbMeterId 이미 계산 → 그대로 매핑)
function _masterEntries(m, dept2) {
    const im = _instM(m.meterType);
    const e = Object.assign({}, SACT_TMPL);
    e.DEPT2 = dept2;
    e.INST_M = im;
    e.INST_S = im + _commSuffix(m.comm);
    e.INSTR_NUM = m.meterNo;
    e.FCLTY_DIV = m.fcltyDiv || '10';
    e.MODEM_DIV = '10';
    e.MAC_MODEM = m.mac || '';
    e.MB_METER_ID = m.mbMeterId || '';     // 단독형은 ''(datapush가 이미 비움)
    e.MB_CNT = m.mbCnt || '';              // 단독형은 ''
    e.EXT_CONN_DEV = (im === 'HW4040') ? (m.extConn || 'N') : '';   // AE타입만
    return Object.entries(e);
}

// 슬래이브 1행 entries (마스터 그룹 따라감)
function _slaveEntries(master, slave, dept2) {
    const im = _instM(slave.meterType);
    const e = Object.assign({}, SACT_TMPL);
    e.DEPT2 = dept2;
    e.INST_M = im;
    e.INST_S = im + _commSuffix(master.comm);   // 마스터 통신방식 따라감
    e.INSTR_NUM = slave.meterNo;
    e.FCLTY_DIV = master.fcltyDiv || '20';      // 마스터 그룹 시설유형
    e.MODEM_DIV = '20';
    e.MB_METER_ID = master.meterNo;             // 대표계기 = 마스터
    e.MB_CNT = master.mbCnt || '';
    e.BUNGI = (master.comm === 'smgw-c') ? '무선' : '0.5';
    return Object.entries(e);
}

// 사진: datapush photos {pre,mac,post1,post2} → ATCH_3/4/5/6 (GATE1 확정)
function _photosOf(m) {
    const map = [['pre', '3'], ['mac', '4'], ['post1', '5'], ['post2', '6']];
    const out = [];
    (m.photos ? map : []).forEach(([k, slot]) => {
        const durl = m.photos[k];
        if (!durl) return;
        const i = durl.indexOf('base64,');
        const b64 = i >= 0 ? durl.slice(i + 7) : '';
        if (b64) out.push({ b64, field: 'ATCH_FILE_ID_' + slot + '_SRC', filename: 'p' + slot + '.jpg' });
    });
    return out;
}

// saveAct expr (awmsEval FormData — awms-saverow _saveRowExpr와 동일 패턴)
function _saveActExpr(entries, photos, url) {
    return `(async()=>{
        const fd=new FormData();
        for(const [k,v] of ${JSON.stringify(entries)}) fd.append(k,v);
        const notes=[];
        for(const P of ${JSON.stringify(photos || [])}){
            if(!(P&&P.b64))continue;
            try{const bin=atob(P.b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
                const b=new Blob([arr],{type:'image/jpeg'});fd.append(P.field,b,P.filename);notes.push(P.field.replace('_SRC','')+' '+Math.round(b.size/1024)+'KB');
            }catch(e){notes.push((P.field||'?')+':err');}
        }
        const r=await fetch(${JSON.stringify(url)},{method:'POST',credentials:'include',body:fd});
        const t=await r.text();let j;try{j=JSON.parse(t);}catch(e){j=null;}
        const ok=(j&&j.result===1)||(t&&t.trim()==='1');
        return {status:r.status,body:t,ok,atchFileId3:j&&j.atchFileId3,photoNote:notes.join(' / ')||'무첨부'};
    })()`;
}

// 큐 1건 → awms saveAct (마스터 → 슬래이브 순서). WORK_STEP 28 저장(삭제 가능).
window.saveActOne = async function (id) {
    const item = _queue.find(i => i.id === id);
    if (!item) return;
    if (typeof isSessionOK === 'function' && !isSessionOK()) {
        alert('awms 세션이 없습니다. [awms 열기]로 로그인 후 시도하세요.');
        return;
    }
    if (!confirm(item.addr + '\nawms에 저장(28)합니다. (전송 아님 — awms 화면서 삭제 가능)\n계속할까요?')) return;
    // 지사→DEPT2 매핑 (수집 시 저장된 item.jisa). 미상이면 서울본부직할 7793 폴백.
    const dept2 = (typeof JISA_DEPT2 !== 'undefined' && JISA_DEPT2[item.jisa]) || '7793';
    if (!JISA_DEPT2 || !JISA_DEPT2[item.jisa]) log('지사 DEPT2 미상(' + (item.jisa || '') + ') → 7793 폴백', 'warn');
    _setBanner('saveAct 저장 중... ' + item.addr, 'busy');
    log('saveAct 시작: ' + item.addr, 'warn');
    let ok = 0, err = 0;
    for (const box of item.boxes || []) {
        for (const m of box.masters || []) {
            try {
                const resp = await awmsEval(_saveActExpr(_masterEntries(m, dept2), _photosOf(m), SAVEACT_URL));
                if (resp && resp.ok) { ok++; log('마스터 ' + m.meterNo + ' 저장 OK (' + (resp.photoNote || '') + ')', 'ok'); }
                else { err++; log('마스터 ' + m.meterNo + ' 실패: ' + String((resp && resp.body) || '?').slice(0, 80), 'err'); }
                for (const sl of m.slaves || []) {
                    const sr = await awmsEval(_saveActExpr(_slaveEntries(m, sl, dept2), [], SAVEACT_URL));
                    if (sr && sr.ok) { ok++; log('슬래이브 ' + sl.meterNo + ' OK', 'ok'); }
                    else { err++; log('슬래이브 ' + sl.meterNo + ' 실패: ' + String((sr && sr.body) || '?').slice(0, 60), 'err'); }
                }
            } catch (e) { err++; log('오류 ' + m.meterNo + ': ' + e.message, 'err'); }
        }
    }
    log('saveAct 완료: OK ' + ok + ' / 실패 ' + err, 'warn');
    _setBanner(err ? ('일부 실패 — OK ' + ok + '/실패 ' + err) : ('저장 완료(28) ' + ok + '건'), err ? 'err' : 'ok');
    setTimeout(() => _setBanner('', ''), 6000);
    if (ok && !err) { try { await _db.ref('datapush_queue/' + id).update({ status: 'saved' }); refreshQueue(); } catch (e) {} }
};

window.sendSelectionsOne = function (id) {
    alert('전송(sendSelections, WORK_STEP 29)은 saveAct 검증 + 영준님 승인 후에만 활성화됩니다.');
};
