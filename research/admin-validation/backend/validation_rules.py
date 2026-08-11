"""정합성/검침값 재판정 규칙 — on-read 단일 소스 (재설계 1단계).

배경: 검증관리자의 검침 status(auto/need_human/worker_missing)가 배치(daily_cycle→CSV)에
한 번 기록되면, 작업자가 나중에 검침값을 넣거나 스왑해도 CSV가 안 바뀌어 옛 판정이 굳는다
(daily_cycle:450 `if ts in st: continue` 증분 skip). → 조회 시점에 workStatus 최신값으로
status를 다시 계산해 이 지연을 없앤다.

원칙:
- OCR 예측값(parseq)은 배치 산출물이라 그대로 신뢰(재OCR 안 함).
- worker_val(작업자 검침값)·status만 workStatus 최신으로 재계산.
- 자릿수·소수·타입 규칙은 daily_cycle의 단일 소스(FIELD_STANDARD/cmp_match/meter_type) 재사용.
- 사람 판정(human/human_skip)·준공(kepco)은 보존 — 재계산 안 함.

app.py(FastAPI)에서 검침행마다 recompute_reading_status()를 호출하면 된다(옆 세션 조율 후 통합).
"""
import daily_cycle  # sys.path에 ocr_poc 이미 추가됨(app.py 상단)

# 재계산 대상에서 제외할 status (사람 판정·준공 반영은 그대로 둔다)
PRESERVE_STATUS = {"human", "human_skip", "kepco"}


def should_recompute(status: str) -> bool:
    """이 status는 on-read 재계산 대상인가. 사람판정·준공은 보존."""
    return str(status or "") not in PRESERVE_STATUS


def recompute_reading_status(fid: str, mtype: str, parseq_pred, ws_worker_val):
    """검침행 하나의 (worker_val, final, status)를 workStatus 최신값으로 재판정.

    - ws_worker_val 없음/빈값 → ('', '', 'worker_missing')
    - 있음 → daily_cycle.cmp_match(자릿수·소수 규칙)로 일치판정
        일치 → (wv, final, 'auto')
        불일치 → (wv, '', 'need_human')  (사람이 사진으로 판단)
    """
    wv = "" if ws_worker_val is None else str(ws_worker_val).strip()
    if not wv:
        return "", "", "worker_missing"
    try:
        match, final = daily_cycle.cmp_match(fid, str(parseq_pred or ""), wv, mtype)
    except Exception:
        # 규칙 실행 실패 시 안전하게 사람검토로
        return wv, "", "need_human"
    if match:
        return wv, final, "auto"
    return wv, "", "need_human"


def apply_onread(row: dict, ws_removal_values: dict) -> bool:
    """검침 CSV row 하나를 workStatus의 removal_values로 on-read 재계산해 in-place 갱신.

    row: {ts, fid, mid, type, worker_val, parseq, google, final, status, ...}
    ws_removal_values: workStatus 레코드의 removal_values dict {fid: 값} (없으면 {} 전달)
    반환: 값이 실제로 바뀌었으면 True.

    사람판정/준공(PRESERVE_STATUS)은 건드리지 않는다.
    """
    if not should_recompute(row.get("status")):
        return False
    fid = str(row.get("fid", ""))
    mtype = str(row.get("type", "")) or None
    pred = row.get("parseq", "")
    ws_val = (ws_removal_values or {}).get(fid)
    wv, final, status = recompute_reading_status(fid, mtype, pred, ws_val)
    changed = (
        str(row.get("worker_val", "")) != wv
        or str(row.get("final", "")) != str(final)
        or str(row.get("status", "")) != status
    )
    row["worker_val"] = wv
    row["final"] = final
    row["status"] = status
    return changed
