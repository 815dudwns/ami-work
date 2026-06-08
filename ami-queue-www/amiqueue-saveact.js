// AMI Queue — saveAct 빌더 (Phase B 스텁)
// GATE 1(capture_full에서 실제 mobCst1000/saveAct 요청바디 확정) +
// GATE 2(mobCst 설비 레코드 삭제 경로 확정) 통과 후 구현.
// 지금은 안전을 위해 awms write를 막아둔다 — Phase A는 목록·삭제만.

window.saveActOne = function (id) {
    alert('saveAct 빌더는 Phase B 준비중입니다.\n'
        + '실제 전송 페이로드(capture_full) + 삭제 경로 확정 후 활성화됩니다.\n'
        + '지금은 목록 확인·삭제만 가능(awms write 없음).');
};

window.sendSelectionsOne = function (id) {
    alert('전송(sendSelections, WORK_STEP 29)은 saveAct 완성 + 영준님 승인 후에만 활성화됩니다.');
};
