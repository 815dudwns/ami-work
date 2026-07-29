#!/usr/bin/env python3
"""
admin-validation Phase 1 — 로컬 FastAPI 백엔드

실행법:
  research/ocr_poc/venv_parseq/bin/uvicorn app:app --host 127.0.0.1 --port 8765 --reload
  (README.md 참조)

엔드포인트:
  GET  /datasets             — 자료 목록
  POST /validate             — 검증 실행 (백그라운드 잡)
  GET  /jobs/{job_id}        — 잡 상태 조회
  GET  /results              — 결과 CSV 반환
  POST /suggest              — Claude 비전으로 판독 제안
  POST /verdict              — 판정 기록 저장 (RTDB ocr_review/daily_val_{date}/{ts})
  POST /apply                — 판정값 자동 적용 (종로 DB PATCH + audit 로그, dry_run 지원)
  GET  /site                 — 계기 site 마스터 조회
  GET  /daily_summary        — 당일 누락 점검
  GET  /dates                — 작업 날짜 목록
  GET  /search               — 계기번호/고객번호 전역 검색 (모든 날짜, 부분일치)
  GET  /report               — 날짜별 검증 집계 보고 (status별 카운트+건 리스트)
  GET  /audit                — 변경 이력 조회 (admin_validate/audit, 최신순)

Phase 3(인증)은 미구현(TODO 주석).
"""

import contextlib
import io
import json
import os
import sys
import threading
import time
import traceback
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ── sys.path: daily_cycle.py import를 위해 ocr_poc 폴더 추가 ────────────────────
# app.py 위치: research/admin-validation/backend/app.py
# daily_cycle.py 위치: research/ocr_poc/daily_cycle.py
_BACKEND_DIR = Path(__file__).parent
_OCR_POC_DIR = _BACKEND_DIR.parent.parent / "ocr_poc"
_ADMIN_DIR   = _BACKEND_DIR.parent

if str(_OCR_POC_DIR) not in sys.path:
    sys.path.insert(0, str(_OCR_POC_DIR))
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import daily_cycle  # noqa: E402 — sys.path 삽입 후
import validation_rules  # noqa: E402 — on-read 검침 status 재판정(같은 backend 폴더)
import awms_mtr_direct as mtr_direct  # noqa: E402 — 맥 세션 직접 awms 등록 (전송탭 실행부)
mtr_direct.load_session()  # 디스크 session_mtr.json → 메모리 복원

# ── 설정 파일 ────────────────────────────────────────────────────────────────────
_CONFIG_PATH = _ADMIN_DIR / "dataset_config.json"

def _load_config() -> dict:
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def _dataset_ocr_ctx(dataset: str):
    """드라이런 등 격리 데이터셋의 OCR 컨텍스트 (ws_url, out_dir). 기본=(None,None)=공유."""
    ds = (_load_config().get("datasets", {}).get(dataset) or {})
    csv_dir = ds.get("csv_dir")
    if csv_dir:
        return ds.get("db_url"), csv_dir   # 샌드박스 ws 읽고 별도 CSV에 쓰기
    return None, None


# ── 사진 URL 매핑 캐시 ───────────────────────────────────────────────────────────
# (dataset, date) → {
#   "ts_mid_map":       {(ts15, mid): record},
#   "remark_map":       {mid: remark_str},        ← 계기레벨 비고
#   "meter_state_map":  {mid: meter_state_str},   ← 주소레벨 meter_state (mid 기준 pre-join)
#   "fetched_at": float
# }
# TTL: 60초. 캐시 갱신 시 전체 날짜의 replacement_list를 한 번만 읽음.
_PHOTO_CACHE: Dict[str, dict] = {}   # key = f"{dataset}:{date}"
_PHOTO_CACHE_LOCK = threading.Lock()
_PHOTO_CACHE_TTL = 60.0              # 초


# ── workStatus 전체 트리 공유 캐시 (백그라운드 워밍) ──────────────────────────────
# _build_photo_map(/results)·daily_summary가 동일한 workStatus/jongno 전체 트리(약 5.9MB)를
# 매 요청마다 싱가포르에서 8초씩 blocking 조회하던 것을 하나의 공유 캐시로 통합.
# TTL 초과 시 stale을 즉시 반환하고 갱신은 백그라운드 스레드가 수행 → 사용자 요청이 8초 fetch에
# 절대 걸리지 않음(첫 요청/무효화 직후만 blocking). 판정·검증 반복 시 체감 즉시.
_WS_RAW_CACHE: Dict[str, dict] = {}      # dataset -> {"raw": dict, "fetched_at": float}
_WS_RAW_LOCK = threading.Lock()
_WS_RAW_TTL = 45.0                        # 초 (초과 시 백그라운드 갱신 트리거)
_WS_RAW_REFRESHING: set = set()          # 갱신 진행중 dataset (중복 스레드 방지)


def _fetch_ws_raw(dataset: str) -> Optional[dict]:
    """workStatus 전체 트리를 firebase_admin으로 blocking 조회 (캐시 미사용, 순수 fetch)."""
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(dataset, {})
    cred_path = ds.get("cred", "")
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    if not rtdb_base:
        return None
    import firebase_admin
    from firebase_admin import credentials as fb_creds, db as fb_db
    named = firebase_admin._apps.get("ws_reader")
    if named is None:
        existing = firebase_admin._apps.get("[DEFAULT]")
        if existing is not None and existing.options and existing.options.get("databaseURL"):
            named = existing
        elif cred_path and Path(cred_path).exists():
            named = firebase_admin.initialize_app(
                fb_creds.Certificate(cred_path), {"databaseURL": rtdb_base}, name="ws_reader")
        else:
            named = firebase_admin.initialize_app(
                fb_creds.ApplicationDefault(), {"databaseURL": rtdb_base}, name="ws_reader")
    ref = fb_db.reference(ds.get("ws_path", "workStatus/jongno"), app=named)
    return ref.get()


def _refresh_ws_raw_bg(dataset: str) -> None:
    """백그라운드 스레드로 raw 캐시 갱신 (dataset당 동시 1개만)."""
    with _WS_RAW_LOCK:
        if dataset in _WS_RAW_REFRESHING:
            return
        _WS_RAW_REFRESHING.add(dataset)

    def _worker():
        try:
            raw = _fetch_ws_raw(dataset)
            if isinstance(raw, dict):
                with _WS_RAW_LOCK:
                    _WS_RAW_CACHE[dataset] = {"raw": raw, "fetched_at": time.monotonic()}
        except Exception as e:
            print(f"[ws_raw] 백그라운드 갱신 실패({dataset}): {e}", flush=True)
        finally:
            with _WS_RAW_LOCK:
                _WS_RAW_REFRESHING.discard(dataset)

    threading.Thread(target=_worker, daemon=True).start()


def _get_ws_raw(dataset: str) -> Optional[dict]:
    """workStatus 전체 트리 반환. 캐시 우선 + 백그라운드 워밍.
    - 신선한 캐시: 즉시 반환
    - TTL 초과: stale 즉시 반환 + 백그라운드 갱신 트리거 (요청 blocking 없음)
    - 캐시 없음: 1회 blocking 조회 (서버 기동 후 첫 요청 or 무효화 직후만)
    """
    now = time.monotonic()
    with _WS_RAW_LOCK:
        ent = _WS_RAW_CACHE.get(dataset)
    if ent is not None:
        if (now - ent["fetched_at"]) > _WS_RAW_TTL:
            _refresh_ws_raw_bg(dataset)
        return ent["raw"]
    raw = _fetch_ws_raw(dataset)
    if isinstance(raw, dict):
        with _WS_RAW_LOCK:
            _WS_RAW_CACHE[dataset] = {"raw": raw, "fetched_at": time.monotonic()}
    return raw


def _invalidate_ws_raw(dataset: str) -> None:
    """쓰기(validate 등 workStatus 변경) 후 raw 캐시 강제 무효화 → 다음 요청이 최신 조회."""
    with _WS_RAW_LOCK:
        _WS_RAW_CACHE.pop(dataset, None)


def _build_photo_map(dataset: str, date: Optional[str]) -> dict:
    """
    firebase_admin SDK로 workStatus/jongno를 읽어 date 기준 replacement_list 레코드를
    {(ts15, mid): record} 딕셔너리로 반환하고, 추가로 아래 두 맵도 함께 빌드:

    - remark_map      : {mid: remark}     — replacement_list[mid].remark (계기레벨)
    - meter_state_map : {mid: meter_state} — addr_val.meter_state (주소레벨, mid별 pre-join)

    ts15: kst_str(replaced_at) = 'YYYYMMDD_HHMMSS' (15자)
          (meter_values CSV의 ts = ts15 + '_' + fid)

    date가 None인 경우 전체 레코드를 반환 (부담이 크므로 캐시 TTL이 특히 중요).
    서비스 계정 cred 없으면 빈 dict 반환 (크래시 없음).
    반환: {"ts_mid_map": ..., "remark_map": ..., "meter_state_map": ...}
    """
    # workStatus 전체 트리 = 공유 캐시(_get_ws_raw)에서. daily_summary와 동일 소스라 fetch 1회 공유.
    raw = _get_ws_raw(dataset)
    if not isinstance(raw, dict):
        return {"ts_mid_map": {}, "remark_map": {}, "meter_state_map": {}}

    ts_mid_map: Dict[tuple, dict] = {}
    remark_map: Dict[str, Any] = {}             # mid → remark (str or None)
    meter_state_map: Dict[str, Any] = {}        # mid → meter_state (str or None)
    new_mfg_ym_map: Dict[str, Any] = {}         # mid → new_meter_mfg_ym (str or None)
    old_mfg_ym_map: Dict[str, Any] = {}         # mid → old_meter_mfg_ym (str or None)
    addr_map: Dict[str, Any] = {}               # mid → addr (스왑 의심 탐지: 같은 주소 묶기)
    validated_map: Dict[str, Any] = {}          # mid → validated (검증완료 플래그)
    draft_map: Dict[str, Any] = {}              # mid → 임시저장(미완료) 여부 (계기 단위, 주소 meter_state 아님)
    worker_map: Dict[str, str] = {}             # mid → worker (작업자 필드, 도입전 kepco 판정용)
    replaced_at_map: Dict[str, Any] = {}        # mid → replaced_at (ms, 도입전 경계 판정용)
    awms_synced_map: Dict[str, bool] = {}       # mid → awms_synced (전송완료 여부)
    awms_synced_manual_map: Dict[str, bool] = {}  # mid → 수동 마킹 여부 (되돌리기 가능/실전송 구분)
    awms_seal_map: Dict[str, Any] = {}          # mid → awms_seal dict (봉인번호·계정 기록)
    # mid 단독 폴백: 같은 날 mid가 유일할 때만 채택 (ts15가 어긋난 수정건 보정용).
    # 중복 mid는 모호하므로 폴백에서 제외(_AMBIG로 표시 후 최종 제거).
    _mid_recs: Dict[str, list] = {}             # mid → [rec, ...] (그날)

    # date가 지정된 경우 해당 날짜만. None이면 전체.
    target_date_str: Optional[str] = None
    if date:
        target_date_str = f"{date[:4]}-{date[4:6]}-{date[6:]}"  # YYYY-MM-DD

    KST = timezone(timedelta(hours=9))

    for addr, addr_val in raw.items():
        if not isinstance(addr_val, dict):
            continue
        # 주소레벨 meter_state (없으면 None)
        addr_meter_state = addr_val.get("meter_state") or None
        for mid, rec in (addr_val.get("replacement_list") or {}).items():
            if not isinstance(rec, dict):
                continue
            ra = rec.get("replaced_at")
            if not ra:
                continue
            # 날짜 필터 (date 지정 시)
            if target_date_str:
                rec_date = datetime.fromtimestamp(ra / 1000, KST).strftime("%Y-%m-%d")
                if rec_date != target_date_str:
                    continue
            # ts15 = kst_str(ra) = YYYYMMDD_HHMMSS
            ts15 = daily_cycle.kst_str(ra)
            ts_mid_map[(ts15, mid)] = rec
            _mid_recs.setdefault(mid, []).append(rec)
            # remark: 계기레벨 비고 (없으면 None)
            remark_map[mid] = rec.get("remark") or None
            # meter_state: 주소레벨 (mid 키로 pre-join)
            meter_state_map[mid] = addr_meter_state
            # 제조년월: 신설/철거 계기 (없으면 None)
            new_mfg_ym_map[mid] = rec.get("new_meter_mfg_ym") or None
            old_mfg_ym_map[mid] = rec.get("old_meter_mfg_ym") or None
            addr_map[mid] = addr
            validated_map[mid] = bool(rec.get("validated"))   # 검증완료 플래그
            worker_map[mid] = rec.get("worker", "") or ""     # 작업자 (도입전 kepco 판정용)
            replaced_at_map[mid] = ra                          # 작업일시 ms (도입전 경계 판정용)
            awms_synced_map[mid] = bool(rec.get("awms_synced"))   # awms 전송완료 여부
            awms_synced_manual_map[mid] = bool(rec.get("awms_synced_manual"))  # 수동 마킹 여부
            awms_seal_map[mid] = rec.get("awms_seal") or None     # 봉인번호·계정 기록 (없으면 None)
            # 임시저장(미완료) = draft 플래그 또는 신설계기번호/철거검침값 누락 (daily_summary와 동일 규칙)
            draft_map[mid] = bool(
                rec.get("draft") is True
                or not rec.get("new_meter_id")
                or not rec.get("removal_values")
            )

    # mid 단독 폴백: 유일한 mid만 채택 (중복은 모호 → 제외)
    mid_rec_map: Dict[str, dict] = {
        m: recs[0] for m, recs in _mid_recs.items() if len(recs) == 1
    }

    return {
        "ts_mid_map": ts_mid_map,
        "mid_rec_map": mid_rec_map,
        "remark_map": remark_map,
        "meter_state_map": meter_state_map,
        "new_mfg_ym_map": new_mfg_ym_map,
        "old_mfg_ym_map": old_mfg_ym_map,
        "addr_map": addr_map,
        "validated_map": validated_map,
        "draft_map": draft_map,
        "worker_map": worker_map,
        "replaced_at_map": replaced_at_map,
        "awms_synced_map": awms_synced_map,
        "awms_synced_manual_map": awms_synced_manual_map,
        "awms_seal_map": awms_seal_map,
    }


def _get_photo_map(dataset: str, date: Optional[str]) -> dict:
    """캐시된 photo_map 반환. TTL 초과 시 재조회.
    반환: {"ts_mid_map": ..., "remark_map": ..., "meter_state_map": ...}
    """
    cache_key = f"{dataset}:{date or 'ALL'}"
    now = time.monotonic()
    with _PHOTO_CACHE_LOCK:
        entry = _PHOTO_CACHE.get(cache_key)
        if entry and (now - entry["fetched_at"]) < _PHOTO_CACHE_TTL:
            # fetched_at 제외한 맵 반환
            return {k: v for k, v in entry.items() if k != "fetched_at"}

    # 캐시 미스 또는 TTL 초과 → 재조회
    maps = _build_photo_map(dataset, date)
    with _PHOTO_CACHE_LOCK:
        _PHOTO_CACHE[cache_key] = {**maps, "fetched_at": time.monotonic()}
    return maps


def _attach_photo_urls(results: dict, dataset: str, date: Optional[str]) -> None:
    """
    results 딕셔너리의 각 행에 photo_url / remark / meter_state 필드를
    인플레이스(in-place)로 추가.

    - meter_values 행: ts = YYYYMMDD_HHMMSS_fid → ts[:15]=ts15, fid 컬럼 사용
      photo_url = removal_photos[fid]
    - meter_ids 행: ts = YYYYMMDD_HHMMSS → photo_url = new_meter_photo
    - removal_ids 행: ts = YYYYMMDD_HHMMSS → photo_url = old_meter_photo

    remark      : replacement_list[mid].remark  (계기레벨, 없으면 null)
    meter_state : addr.meter_state              (주소레벨 원문값, 없으면 null)

    매칭 실패 시 각 필드 None (크래시 없음).
    """
    try:
        maps = _get_photo_map(dataset, date)
    except Exception as e:
        print(f"[attach_photo_urls] photo_map 획득 실패: {e}", flush=True)
        # 실패해도 각 필드=None으로 채워 크래시 없이 반환
        maps = {"ts_mid_map": {}, "remark_map": {}, "meter_state_map": {}}

    ts_mid_map      = maps.get("ts_mid_map", {})
    mid_rec_map     = maps.get("mid_rec_map", {})
    remark_map      = maps.get("remark_map", {})
    meter_state_map = maps.get("meter_state_map", {})
    new_mfg_ym_map  = maps.get("new_mfg_ym_map", {})
    old_mfg_ym_map  = maps.get("old_mfg_ym_map", {})
    addr_map        = maps.get("addr_map", {})
    validated_map   = maps.get("validated_map", {})
    draft_map       = maps.get("draft_map", {})
    worker_map      = maps.get("worker_map", {})
    replaced_at_map = maps.get("replaced_at_map", {})
    awms_synced_map = maps.get("awms_synced_map", {})
    awms_synced_manual_map = maps.get("awms_synced_manual_map", {})
    awms_seal_map   = maps.get("awms_seal_map", {})

    # ★ 고아행 제외(2026-07-29 검증팀). 작업자가 앱에서 순번 등을 고치면 종로맵이 replaced_at을
    #   새로 찍는다 → CSV 병합키(kst_str(replaced_at)_{fid})가 통째로 바뀌고, 옛 키 행이 라이브에
    #   짝 없는 '고아'로 남는다. 이 행의 parseq/google은 **옛 사진** OCR 결과라, mid 단독 폴백으로
    #   새 레코드(새 사진)를 붙이면 사진과 OCR이 어긋나 멀쩡한 건이 need_human으로 오판된다
    #   (실제 사고: 명륜3가 1-1102 / 56170861534 — 작업자는 고쳤는데 화면은 계속 오류 표시).
    #   → 라이브에 정확 매칭(ts15, mid)이 없는 행은 화면에서 제외한다. 다음 워처가 새 키로
    #   재수집한 행이 대신 뜨므로 몇 분 안에 최신값으로 복귀한다.
    #   ※ 근본 수정(daily_cycle의 고아 스윕)은 ocr-meter 소관 — 여기선 표시만 막는다.
    if ts_mid_map:  # 맵 획득 실패(폴백 빈 dict) 시엔 절대 거르지 않는다 — 전건 소실 방지
        for _rk in ("meter_values", "meter_ids", "removal_ids"):
            _rows = results.get(_rk)
            if not isinstance(_rows, list):
                continue
            _kept = [
                _r for _r in _rows
                if (str(_r.get("ts", ""))[:15], str(_r.get("mid", ""))) in ts_mid_map
            ]
            if len(_kept) != len(_rows):
                print(f"[orphan] {_rk}: {len(_rows) - len(_kept)}행 제외 "
                      f"(라이브에 짝 없음 — 작업자 수정으로 replaced_at 변경)", flush=True)
                results[_rk] = _kept

    for row in results.get("meter_values", []):
        row["photo_url"] = None
        row["lcd_photo_url"] = None      # YOLO로 잘라낸 LCD 크롭(있으면) — 검침값 검수 확대용
        ts_full = str(row.get("ts", ""))
        mid = str(row.get("mid", ""))
        fid = str(row.get("fid", ""))
        # ts_full = YYYYMMDD_HHMMSS_<fid>  → ts15 = 앞 15자
        ts15 = ts_full[:15]
        rec = ts_mid_map.get((ts15, mid)) or mid_rec_map.get(mid)  # ts 어긋난 수정건은 mid 단독 폴백
        if rec:
            rp = rec.get("removal_photos") or {}
            row["photo_url"] = rp.get(fid) or None
            lrp = rec.get("removal_lcd_photos") or {}
            row["lcd_photo_url"] = lrp.get(fid) or None
            # ★ on-read 검침 status 재판정(2026-07-02): CSV에 굳은 worker_missing/판정을
            #   workStatus 최신 검침값으로 다시 계산 → 작업자가 나중에 넣은 값 즉시 반영.
            #   (human/human_skip/kepco는 validation_rules가 보존)
            validation_rules.apply_onread(row, rec.get("removal_values") or {})
        # 서버(검증=daily_cycle)가 YOLO로 크롭한 LCD가 /tmp/daily_cycle에 있으면 그걸 표시(폰 크롭 없어도)
        row["lcd_crop_ts"] = None
        try:
            if (daily_cycle.TMP / f"{ts_full}_lcd.jpg").exists():
                row["lcd_crop_ts"] = ts_full
        except Exception:
            pass
        row["remark"]           = remark_map.get(mid)
        row["meter_state"]      = meter_state_map.get(mid)
        row["new_meter_mfg_ym"] = new_mfg_ym_map.get(mid)
        row["old_meter_mfg_ym"] = old_mfg_ym_map.get(mid)
        row["addr"]             = addr_map.get(mid)
        row["validated"]        = bool(validated_map.get(mid))
        row["is_draft"]         = bool(draft_map.get(mid))
        row["worker"]           = worker_map.get(mid, "")
        row["replaced_at"]      = replaced_at_map.get(mid)
        row["awms_synced"]      = bool(awms_synced_map.get(mid))
        row["awms_synced_manual"] = bool(awms_synced_manual_map.get(mid))
        row["awms_seal"]        = awms_seal_map.get(mid)
        row["cha"]              = rec.get("cha") if rec else None  # 3b 차수 필터

    for row in results.get("meter_ids", []):
        row["photo_url"] = None
        ts = str(row.get("ts", ""))
        mid = str(row.get("mid", ""))
        rec = ts_mid_map.get((ts, mid)) or mid_rec_map.get(mid)  # ts 어긋난 수정건은 mid 단독 폴백
        if rec:
            row["photo_url"] = rec.get("new_meter_photo") or None
            # ★ 2단계 단일진실(2026-07-02): 신설번호를 workStatus 최신으로 덮음
            #   → 스왑·작업자변경 즉시 반영(CSV daily_meterid 수동교정 불필요).
            #   CSV의 vision_result/google_result(OCR)는 그대로 대조에 쓰이고,
            #   프론트 rowBucketRefined가 new_meter_id 기준으로 검증상태 재판정한다.
            _nm = rec.get("new_meter_id")
            if _nm:
                row["new_meter_id"] = _nm
        row["remark"]           = remark_map.get(mid)
        row["meter_state"]      = meter_state_map.get(mid)
        row["new_meter_mfg_ym"] = new_mfg_ym_map.get(mid)
        row["old_meter_mfg_ym"] = old_mfg_ym_map.get(mid)
        row["addr"]             = addr_map.get(mid)
        row["validated"]        = bool(validated_map.get(mid))
        row["is_draft"]         = bool(draft_map.get(mid))
        row["worker"]           = worker_map.get(mid, "")
        row["replaced_at"]      = replaced_at_map.get(mid)
        row["awms_synced"]      = bool(awms_synced_map.get(mid))
        row["awms_synced_manual"] = bool(awms_synced_manual_map.get(mid))
        row["awms_seal"]        = awms_seal_map.get(mid)
        row["cha"]              = rec.get("cha") if rec else None  # 3b 차수 필터

    for row in results.get("removal_ids", []):
        row["photo_url"] = None
        ts_full = str(row.get("ts", ""))
        mid = str(row.get("mid", ""))
        # removal_ids ts = YYYYMMDD_HHMMSS_rm (ts15 = 앞 15자 = ts_full[:-3])
        ts15 = ts_full[:15]
        rec = ts_mid_map.get((ts15, mid)) or mid_rec_map.get(mid)  # ts 어긋난 수정건은 mid 단독 폴백
        if rec:
            row["photo_url"] = rec.get("old_meter_photo") or None
        row["remark"]           = remark_map.get(mid)
        row["meter_state"]      = meter_state_map.get(mid)
        row["new_meter_mfg_ym"] = new_mfg_ym_map.get(mid)
        row["old_meter_mfg_ym"] = old_mfg_ym_map.get(mid)
        row["addr"]             = addr_map.get(mid)
        row["validated"]        = bool(validated_map.get(mid))
        row["is_draft"]         = bool(draft_map.get(mid))
        row["worker"]           = worker_map.get(mid, "")
        row["replaced_at"]      = replaced_at_map.get(mid)
        row["awms_synced"]      = bool(awms_synced_map.get(mid))
        row["awms_synced_manual"] = bool(awms_synced_manual_map.get(mid))
        row["awms_seal"]        = awms_seal_map.get(mid)
        row["cha"]              = rec.get("cha") if rec else None  # 3b 차수 필터


def _merge_unverified(results: dict, dataset: str, date: Optional[str]) -> None:
    """OCR(CSV)에 없는 workStatus 작업 레코드를 status='unverified'로 results에 합침.
    → 검증 실행 전에도 그날 작업 목록이 다 보이고, 검증상태만 '미검증'으로 표시."""
    try:
        maps = _get_photo_map(dataset, date)
    except Exception as e:
        print(f"[merge_unverified] photo_map 실패: {e}", flush=True)
        return
    ts_mid_map = maps.get("ts_mid_map", {})
    if not ts_mid_map:
        return
    # 이미 CSV(OCR)에 있는 (ts15, mid)
    covered = set()
    for r in results.get("removal_ids", []):
        covered.add((str(r.get("ts", ""))[:15], str(r.get("mid", ""))))
    mv = results.setdefault("meter_values", [])
    mi = results.setdefault("meter_ids", [])
    ri = results.setdefault("removal_ids", [])
    for (ts15, mid), rec in ts_mid_map.items():
        if (ts15, mid) in covered:
            continue
        if not rec.get("new_meter_id"):   # 작업 안 된(신설번호 없는) 건 제외
            continue
        try:
            mtype = daily_cycle.meter_type(mid)
        except Exception:
            mtype = ""
        worker = rec.get("worker", "")
        _is_import = worker in ("KEPCO_IMPORT", "AWMS_IMPORT")
        if _is_import:
            _status = "kepco"
            _isdraft = False
        else:
            _status = "unverified"
            _isdraft = bool(
                rec.get("draft") is True
                or not rec.get("new_meter_id")
                or not rec.get("removal_values")
            )
        ri.append({"ts": f"{ts15}_rm", "mid": mid, "old_meter_id": mid,
                   "vision_result": "", "google_result": "", "status": _status,
                   "is_draft": _isdraft, "addr": maps.get("addr_map", {}).get(mid)})
        mi.append({"ts": ts15, "mid": mid, "new_meter_id": str(rec.get("new_meter_id", "")),
                   "vision_result": "", "google_result": "", "status": _status,
                   "is_draft": _isdraft, "addr": maps.get("addr_map", {}).get(mid)})
        for fid, val in (rec.get("removal_values") or {}).items():
            mv.append({"ts": f"{ts15}_{fid}", "fid": fid, "mid": mid, "type": mtype,
                       "worker_val": str(val), "parseq": "", "final": "", "status": _status})


# ── site 데이터 캐시 ─────────────────────────────────────────────────────────────
# dataset별 {index: {계기번호→record}, mtime: float}
# 파일 mtime 변경 시 자동 갱신.
_SITE_CACHE: Dict[str, dict] = {}
_SITE_CACHE_LOCK = threading.Lock()


def _load_site_index(dataset: str) -> Dict[str, dict]:
    """
    dataset_config의 site_data_path를 읽어 계기번호→레코드 dict 반환.
    mtime 기반 캐시. 파일 없으면 빈 dict 반환.
    """
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(dataset, {})
    site_path_str = ds.get("site_data_path", "")
    if not site_path_str:
        return {}

    site_path = Path(site_path_str)
    if not site_path.exists():
        print(f"[site] 파일 없음: {site_path}", flush=True)
        return {}

    current_mtime = site_path.stat().st_mtime

    with _SITE_CACHE_LOCK:
        cached = _SITE_CACHE.get(dataset)
        if cached and cached.get("mtime") == current_mtime:
            return cached["index"]

    # 캐시 미스 또는 mtime 변경 → 재로드
    try:
        records = json.loads(site_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[site] 로드 실패: {e}", flush=True)
        return {}

    if not isinstance(records, list):
        print(f"[site] 형식 오류: 배열이 아님", flush=True)
        return {}

    index: Dict[str, dict] = {}
    for rec in records:
        mid = str(rec.get("계기번호", "")).strip()
        if mid:
            index[mid] = rec

    with _SITE_CACHE_LOCK:
        _SITE_CACHE[dataset] = {"index": index, "mtime": current_mtime}

    print(f"[site] 로드 완료: {len(index)}건 (dataset={dataset})", flush=True)
    return index


def _get_cust_no(site_index: Dict[str, dict], mid: str) -> Optional[str]:
    """mid로 고객번호 조회. 없으면 None."""
    rec = site_index.get(str(mid).strip())
    if rec is None:
        return None
    return str(rec.get("고객번호", "")).strip() or None


# ── 잡 저장소 ────────────────────────────────────────────────────────────────────
# dict: job_id -> {status, log, summary, dataset, date, started_at, finished_at}
_JOBS: Dict[str, dict] = {}

# MPS + shared-CSV 동시 실행 크래시 방지 — 검증 잡은 1개만 허용
# 메모리: feedback_mps_single_process.md (EasyOCR/torch MPS는 프로세스당 1개)
_JOB_LOCK = threading.Lock()
_RUNNING_JOB: Optional[str] = None   # 현재 실행 중인 job_id (없으면 None)
_JOBS_LOCK  = threading.Lock()        # _JOBS dict 동시 접근 보호

KST = timezone(timedelta(hours=9))

# 검증 시스템 도입일 — 2026-06-17 00:00:00 KST (unix ms)
# 이 시각 이전 실작업분은 사람판정 기회 없이 validated=True가 되어 있으므로
# _overlay_verdicts 이후 status='kepco'(준공반영)로 재분류한다.
ADOPTION_DATE_MS: int = int(datetime(2026, 6, 17, tzinfo=KST).timestamp() * 1000)

# ── FastAPI 앱 ───────────────────────────────────────────────────────────────────
app = FastAPI(title="admin-validation API", version="1.0.0")

# CORS: 로컬 브라우저(프론트 Phase 2)에서 호출 허용
# TODO(Phase 3): 인증 미들웨어 추가 시 여기 조정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080",
                   "http://localhost:5500", "http://127.0.0.1:5500",
                   "https://815dudwns.github.io",  # github 배포본(jongno-combined/admin-validate.html)
                   "https://localhost",  # Capacitor 폰 앱 origin (계기큐 모니터, P4 대비)
                   "null"],  # file:// 로컬 HTML 열었을 때 Origin: null 허용
    allow_methods=["*"],
    allow_headers=["*"],
)

# gzip: 폰 셀룰러 대역폭·속도 (JSON 응답 10~16배 압축). CORS 뒤에 등록.
# minimum_size=500: 작은 응답(job status 등)은 압축 오버헤드가 손해라 제외.
app.add_middleware(GZipMiddleware, minimum_size=500)


# ── 요청/응답 모델 ───────────────────────────────────────────────────────────────
class ValidateRequest(BaseModel):
    dataset: str
    date: str  # YYYYMMDD
    only_mids: Optional[List[str]] = None   # 순번 범위 검증 — 이 철거번호들만 OCR (None=전체)

class SuggestRequest(BaseModel):
    dataset: str
    date: str
    ts: str
    fid: str
    photo_url: str
    meter_type: Optional[str] = None
    worker_val: Optional[str] = None

class VerdictRequest(BaseModel):
    dataset: str
    date: str
    ts: str
    verdict_type: str  # "value" | "custom" | "reason"
    text: str          # 값(value/custom) 또는 불가사유(reason)
    fid: Optional[str] = None
    mid: Optional[str] = None


# ── 1. GET /datasets ─────────────────────────────────────────────────────────────
@app.get("/datasets")
def get_datasets():
    """
    dataset_config.json의 자료 목록 반환.
    id, description, default 여부.
    """
    cfg = _load_config()
    datasets = cfg.get("datasets", {})
    default = cfg.get("default", "")
    result = []
    for ds_id, info in datasets.items():
        result.append({
            "id": ds_id,
            "description": info.get("description", ""),
            "is_default": (ds_id == default),
        })
    return {"datasets": result}


# ── 2. POST /validate ────────────────────────────────────────────────────────────
@app.post("/validate")
def post_validate(req: ValidateRequest):
    """
    검증 실행 — 백그라운드 스레드로 run_daily() 호출.
    동시 실행 금지(MPS + CSV race): 진행 중이면 409 반환.
    """
    global _RUNNING_JOB

    # 데이터셋 존재 확인
    cfg = _load_config()
    if req.dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")

    # YYYYMMDD 형식 검증
    try:
        datetime.strptime(req.date, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date는 YYYYMMDD 형식")

    print(f"[validate] dataset={req.dataset} date={req.date} "
          f"only_mids={len(req.only_mids) if req.only_mids else '없음(전건)'}", flush=True)

    with _JOB_LOCK:
        if _RUNNING_JOB is not None:
            running_info = _JOBS.get(_RUNNING_JOB, {})
            raise HTTPException(
                status_code=409,
                detail=f"이미 실행 중인 잡이 있습니다: {_RUNNING_JOB} "
                       f"(dataset={running_info.get('dataset')}, "
                       f"date={running_info.get('date')}). "
                       f"GET /jobs/{_RUNNING_JOB} 으로 상태 확인."
            )
        job_id = str(uuid.uuid4())[:8]
        _RUNNING_JOB = job_id

    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "status": "running",
            "log": "",
            "summary": None,
            "dataset": req.dataset,
            "date": req.date,
            "started_at": datetime.now(KST).isoformat(),
            "finished_at": None,
        }

    def _run():
        global _RUNNING_JOB
        # 라이브 로그 — print() 한 줄마다 _JOBS[job_id]["log"] 갱신(폴링이 진행상황 실시간 표시)
        class _LiveLog(io.TextIOBase):
            def __init__(self):
                self._parts = []
            def write(self, s):
                if s:
                    self._parts.append(s)
                    with _JOBS_LOCK:
                        j = _JOBS.get(job_id)
                        if j is not None:
                            j["log"] = "".join(self._parts)
                return len(s) if s else 0
            def getvalue(self):
                return "".join(self._parts)
        log_buf = _LiveLog()
        try:
            # stdout 리다이렉트 — run_daily()가 print()만으로 진행상황 출력
            _ws_url, _out_dir = _dataset_ocr_ctx(req.dataset)
            with contextlib.redirect_stdout(log_buf):
                daily_cycle.run_daily(date=req.date, ws_url=_ws_url, out_dir=_out_dir,
                                      no_sync=bool(_out_dir), only_mids=req.only_mids)

            log_text = log_buf.getvalue()
            # 완료 후 결과 요약 (CSV 읽기)
            results = daily_cycle.get_results(req.date, out_dir=_out_dir)
            def _count(rows, status):
                return sum(1 for r in rows if r.get("status") == status)
            mv = results["meter_values"]
            mi = results["meter_ids"]
            ri = results["removal_ids"]
            summary = {
                "meter_values": {
                    "total": len(mv),
                    "auto":  _count(mv, "auto"),
                    "need_human": _count(mv, "need_human"),
                    "human": _count(mv, "human"),
                    "human_skip": _count(mv, "human_skip"),
                },
                "meter_ids": {
                    "total": len(mi),
                    "auto":  _count(mi, "auto"),
                    "need_human": _count(mi, "need_human"),
                },
                "removal_ids": {
                    "total": len(ri),
                    "auto":  _count(ri, "auto"),
                    "need_human": _count(ri, "need_human"),
                },
            }
            with _JOBS_LOCK:
                _JOBS[job_id].update({
                    "status": "done",
                    "log": log_text,
                    "summary": summary,
                    "finished_at": datetime.now(KST).isoformat(),
                })
        except Exception:
            log_text = log_buf.getvalue() + "\n\n" + traceback.format_exc()
            with _JOBS_LOCK:
                _JOBS[job_id].update({
                    "status": "error",
                    "log": log_text,
                    "finished_at": datetime.now(KST).isoformat(),
                })
        finally:
            with _JOB_LOCK:
                _RUNNING_JOB = None
            # 검증이 workStatus(validated 플래그 등)를 변경했을 수 있으므로 공유 캐시 무효화
            # → 검증 직후 조회가 stale 없이 최신을 받음(백그라운드 워밍 45초 대기 회피)
            _invalidate_ws_raw(req.dataset)

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {"job_id": job_id, "status": "running"}


# ── 3. GET /jobs/{job_id} ────────────────────────────────────────────────────────
@app.post("/stop_validate")
def post_stop_validate():
    """실행 중인 검증 잡 멈춤 — daily_cycle CANCEL 플래그 세팅(루프가 다음 항목 전에 중단)."""
    daily_cycle.CANCEL = True
    return {"ok": True, "running_job": _RUNNING_JOB}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    """잡 진행 상태 조회. status: running / done / error"""
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job '{job_id}' 없음")
    return job


# ── 정합성 체크 (데일리 3단계) ──────────────────────────────────────────────────
# 대상: meter_values 행. daily_cycle OCR 대조와 별개 레이어.
# 규칙 단일 소스: research/ocr_poc/OCR_검증규칙.md §2(FIELD_STANDARD)·§5(스왑가드).
#
# check1 — 검침값 자릿수 위반
#   확실한 위반만 플래그. 애매한 자릿수 차이는 OCR 대조에 맡김.
#   · 빈값/0 이상: worker_val이 비었거나 '0'
#   · 날짜패턴: 20xxxxxx(8자리) 형태 숫자 — 날짜 혼입 의심
#   · E/EA whme_day: intpart 길이가 int_d+2(7)이상인 경우만(5vs6 플래그 금지 — seq51 교훈)
#   · G dm_mt_day: numval >= 10000 (정상범위 0~10000, _dm_recon_match 가드와 동일 가드)
#   · G whme/var: int_d=None → 빈값/0/날짜패턴만
#
# check2 — 단상/삼상 위상 불일치
#   비대칭: "단상인데 dm_mt_day/var_day 값 존재"만 고신뢰 플래그.
#   "삼상인데 4종 미달"은 draft/미완료 노이즈 가능 → 생략.
#   siteData 미조인 시 type 필드(E/EA=단상, G45/46/47·Amigo55=삼상)로 폴백.
#
# check3 — dm_mt_day↔var_day 스왑 의심
#   daily_cycle.detect_dm_var_swap 재사용(modify 금지). 두 행 모두 있을 때만.
#   status='swap_suspect' 와 중복 신호일 수 있음(이 쪽은 규칙체크 레이어).

import re as _re


_DATE_PAT = _re.compile(r'^20\d{6}$')  # YYYYMMDD 날짜패턴 (8자리)

# 타입 코드 → 단상/삼상 (메모리 meter_phase_classification 기준)
# siteData 조인 실패 시 type 필드 폴백용
_PHASE_BY_TYPE: Dict[str, str] = {
    'E':     '단상',
    'EA':    '단상',
    # G 타입은 계기번호 3~4번째 자리가 25/26/27=단상 / 45/46/47=삼상
    # Amigo 53=단상, 55=삼상 → type 문자열만으론 확정 불가 → None(폴백 불가)
    'G':     None,
    'Amigo': None,
}

# G 계기 단상/삼상: 계기번호[2:4] 기준
_G_SINGLE_CODES = {'25', '26', '27', '53'}   # 단상
_G_THREE_CODES  = {'45', '46', '47', '55'}   # 삼상


def _phase_of_row(row: dict, site_idx: Dict[str, dict]) -> Optional[str]:
    """
    행의 단상/삼상 판정. 우선순위: siteData '단상삼상' → type/mid 폴백.
    판정 불가 → None (체크 스킵).
    """
    mid = str(row.get('mid', '')).strip()
    # 1순위: siteData
    if site_idx:
        rec = site_idx.get(mid)
        if rec:
            v = rec.get('단상삼상', '')
            if v in ('단상', '삼상'):
                return v

    # 2순위: type 필드 폴백
    mtype = str(row.get('type', '')).strip()
    if mtype in ('E', 'EA'):
        return '단상'
    if mtype == 'G':
        # 계기번호 3~4번째 코드
        code = mid[2:4] if len(mid) >= 4 else ''
        if code in _G_SINGLE_CODES:
            return '단상'
        if code in _G_THREE_CODES:
            return '삼상'
        return None
    return None


# ── 명륜 팀배분: 중구팀 배정 계기 제외용 ──────────────────────────────────────────
# 명륜 권역(동그룹='명륜')은 종로팀/중구팀으로 나뉨(동행시공). 통계는 종로팀만 — 중구팀은 제외.
# 소스: site_data_path와 같은 폴더의 myeongryun-team-assign.json {"종로":[...],"중구":[...]}.
_TEAM_EXCLUDE_CACHE: Dict[str, dict] = {}


def _load_junggu_exclude(dataset: str) -> set:
    """명륜 중구팀 배정 계기번호 집합. 파일 mtime 캐시. 없으면 빈 set."""
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(dataset, {})
    site_path = ds.get("site_data_path", "")
    if not site_path:
        return set()
    team_path = Path(site_path).parent / "myeongryun-team-assign.json"
    if not team_path.exists():
        return set()
    mtime = team_path.stat().st_mtime
    cached = _TEAM_EXCLUDE_CACHE.get(dataset)
    if cached and cached.get("mtime") == mtime:
        return cached["set"]
    s: set = set()
    try:
        data = json.loads(team_path.read_text(encoding="utf-8"))
        for no in (data.get("중구") or []):
            s.add(str(no).strip())
    except Exception as e:
        print(f"[team_exclude] 로드 실패: {e}", flush=True)
    _TEAM_EXCLUDE_CACHE[dataset] = {"mtime": mtime, "set": s}
    return s


def _phase_of_site(rec: dict) -> str:
    """site-data 레코드의 단상/삼상. 단상삼상 필드 우선, 없으면 계기번호[2:4] 폴백."""
    v = rec.get('단상삼상', '')
    if v in ('단상', '삼상'):
        return v
    mid = str(rec.get('계기번호', ''))
    code = mid[2:4] if len(mid) >= 4 else ''
    if code in _G_SINGLE_CODES or code in ('17', '19'):
        return '단상'
    if code in _G_THREE_CODES:
        return '삼상'
    return '미상'


def _check1_digit(row: dict) -> list:
    """
    자릿수 위반 체크. 확실한 위반만 반환: [{type, detail}]
    """
    issues = []
    fid    = str(row.get('fid', '')).strip()
    mtype  = str(row.get('type', '')).strip()
    wval   = str(row.get('worker_val', '')).strip()

    if not wval:
        issues.append({'type': 'digit_empty', 'detail': f'{fid}: 검침값 빈값'})
        return issues

    # 정수부만 추출
    ip = _re.sub(r'[^0-9]', '', wval.split('.')[0])

    # 빈값/0 이상: 정수부가 '0' 또는 숫자 없음
    if ip == '' or ip == '0':
        issues.append({'type': 'digit_zero', 'detail': f'{fid}: 검침값 0 또는 숫자 없음 (worker_val={wval!r})'})
        return issues

    # 날짜 패턴: 정수부 전체가 8자리이고 20XXXXXX 꼴
    if _DATE_PAT.match(ip):
        issues.append({'type': 'digit_date_pattern', 'detail': f'{fid}: 날짜처럼 보이는 값 (worker_val={wval!r})'})
        return issues

    # E/EA whme_day: int_d=5. 7자리 이상만 플래그 (5vs6 금지)
    if mtype in ('E', 'EA') and fid == 'whme_day':
        if len(ip) >= 7:
            issues.append({'type': 'digit_overflow', 'detail': f'{fid}: E계기 정수부 {len(ip)}자리 (기준 5자리, 7이상만 플래그, worker_val={wval!r})'})

    # G dm_mt_day: >= 10000 이면 확실 위반 (정상범위 0~10000)
    elif mtype == 'G' and fid == 'dm_mt_day':
        try:
            nv = float(_re.sub(r'[^0-9.]', '', wval) or 'nan')
            if nv >= 10000:
                issues.append({'type': 'digit_overflow', 'detail': f'{fid}: 최대전력 {nv} >= 10000 (정상범위 초과, worker_val={wval!r})'})
        except Exception:
            pass

    # G whme/var: int_d=None → 빈값/0/날짜패턴만 (이미 위에서 처리됨, 자릿수 체크 없음)

    return issues


def _attach_consistency(results: dict, site_idx: Dict[str, dict]) -> None:
    """
    meter_values 각 행에 consistency 필드를 인플레이스로 추가.
    {ok: bool, issues: [{type, detail}]}

    check1: 자릿수 위반 (행 단위)
    check2: 단상인데 dm_mt/var 값 존재 (그룹 단위 → 해당 행에만)
    check3: dm_mt↔var 스왑 의심 (그룹 단위 → dm_mt·var 행에만)
    """
    mv = results.get('meter_values', [])
    if not mv:
        return

    # ── 그룹핑: (ts[:15], mid) → {fid: row} ─────────────────────────────────────
    groups: Dict[tuple, Dict[str, dict]] = {}
    for row in mv:
        ts_full = str(row.get('ts', ''))
        mid     = str(row.get('mid', ''))
        key     = (ts_full[:15], mid)
        if key not in groups:
            groups[key] = {}
        fid = str(row.get('fid', ''))
        groups[key][fid] = row

    # ── 각 행에 초기 consistency 부착 ────────────────────────────────────────────
    for row in mv:
        row['consistency'] = {'ok': True, 'issues': []}

    # ── check1: 자릿수 위반 (행 단위) ─────────────────────────────────────────────
    for row in mv:
        issues = _check1_digit(row)
        if issues:
            row['consistency']['ok'] = False
            row['consistency']['issues'].extend(issues)

    # ── check2 + check3: 그룹 단위 ───────────────────────────────────────────────
    for (ts15, mid), fid_map in groups.items():
        # -- check2: 단상인데 dm_mt_day·var_day 값 존재 --
        # 대표 행(아무 fid나)에서 위상 판정
        any_row = next(iter(fid_map.values()))
        phase = _phase_of_row(any_row, site_idx)

        if phase == '단상':
            for suspect_fid in ('dm_mt_day', 'var_day'):
                if suspect_fid in fid_map:
                    s_row = fid_map[suspect_fid]
                    wval  = str(s_row.get('worker_val', '')).strip()
                    if wval and wval != '0':
                        issue = {
                            'type':   'phase_mismatch',
                            'detail': (f'단상 계기({mid})에 {suspect_fid} 값 존재 '
                                       f'(worker_val={wval!r}) — 삼상 전용 필드'),
                        }
                        s_row['consistency']['ok'] = False
                        s_row['consistency']['issues'].append(issue)

        # -- check3: dm_mt↔var 스왑 의심 --
        dm_row  = fid_map.get('dm_mt_day')
        var_row = fid_map.get('var_day')
        if dm_row is not None and var_row is not None:
            try:
                is_swap, reverse_confirmed, _correction = daily_cycle.detect_dm_var_swap(
                    dm_row, var_row
                )
            except Exception:
                is_swap = False

            if is_swap:
                swap_detail = (
                    f'dm_mt_day↔var_day 사진 스왑 의심 (mid={mid}, '
                    f'reverse_confirmed={reverse_confirmed}) — '
                    f'dm_mt worker={dm_row.get("worker_val")}, '
                    f'var worker={var_row.get("worker_val")}'
                )
                swap_issue = {'type': 'swap_suspect', 'detail': swap_detail}
                for affected in (dm_row, var_row):
                    affected['consistency']['ok'] = False
                    affected['consistency']['issues'].append(swap_issue)


def _overlay_verdicts(results: dict, dataset: str, date: Optional[str]) -> None:
    """
    RTDB ocr_review/daily_val_{date} 판정값을 results에 실시간 오버레이.

    CSV(daily_state.csv)에 sync_review_daily가 아직 반영되지 않아도
    /results 응답에서 즉시 반영되도록 보장한다.

    - verdict type=value/custom → final=변환값, status='human'
    - verdict type=reason       → final='불가',  status='human_skip'
    - validated==true 행도 'human'으로 상향 (workStatus 반영분 보장)

    변환: fid별 소수 분기는 daily_cycle._apply_verdicts_daily 와 동일 규칙
      (dm_mt_day만 numval, 나머지 intpart — 표시값과 sync후 CSV값이 일치하도록)

    네트워크 실패 시 무시(크래시 없음, CSV값 그대로 유지).
    """
    if not date:
        return   # 전체 누적 모드에서는 날짜별 verdict 노드를 가져올 수 없으므로 스킵

    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(dataset, {})
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    if not rtdb_base:
        return

    store_key = f"daily_val_{date}"
    url = f"{rtdb_base}/ocr_review/{store_key}.json"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            verdicts: dict = json.loads(r.read()) or {}
    except Exception as e:
        print(f"[overlay_verdicts] RTDB 조회 실패(무시): {e}", flush=True)
        verdicts = {}

    if not isinstance(verdicts, dict) or not verdicts:
        # verdict 없어도 validated 플래그는 _attach_photo_urls에서 이미 부착됨 → 하단에서 처리
        pass
    else:
        # meter_values 행에 오버레이
        for row in results.get("meter_values", []):
            ts_key = str(row.get("ts", ""))   # YYYYMMDD_HHMMSS_fid
            vd = verdicts.get(ts_key)
            if not vd or not isinstance(vd, dict):
                continue
            vtype = vd.get("type", "")
            vtext = str(vd.get("text", ""))
            fid   = str(row.get("fid", ""))
            mtype = str(row.get("type", ""))
            if vtype in ("value", "custom"):
                # dm_mt_day는 소수(numval), 나머지는 정수부(intpart) — daily_cycle과 동일 규칙
                try:
                    new_final = (daily_cycle.numval(vtext)
                                 if daily_cycle.field_decimal(fid, mtype)
                                 else daily_cycle.intpart(vtext))
                except Exception:
                    new_final = vtext
                row["final"]  = new_final
                row["status"] = "human"
            elif vtype == "reason":
                row["final"]  = "불가"
                row["status"] = "human_skip"

        # meter_ids / removal_ids: verdict는 검침값(meter_values)에만 해당
        # ts 매칭이 달라 verdict 키 형식(YYYYMMDD_HHMMSS_fid)과 다르므로 별도 처리 불필요

    # ★ validated==true → status='human' 상향은 제거함 (2026-07-02, 영준님 지적).
    #   사유: autoValidatePassed()가 '자동통과(auto)'건에도 validated 도장을 찍는데,
    #   이를 human으로 상향하면 니드휴먼(사람 검토)을 안 거친 건이 '확인완료'로 오표시됐다.
    #   사람이 실제 판정한 건은 위쪽 verdict 처리(value/custom→human, reason→human_skip)로만 human이 됨.
    #   validated 플래그는 _attach_photo_urls가 row["validated"]로 그대로 부착 → 프론트가
    #   g.validated / isVerified(pass=항상 검증완료)로 '검증완료' 배지를 유지한다.
    #   결과: 니드휴먼 안 간 통과건 = '자동통과' 배지(+검증완료✓), 사람판정건만 '확인완료'.

    # ── 도입 전 실작업 / import 건 → status='kepco'(준공반영) 재분류 ─────────────────
    # 검증 시스템 도입일(2026-06-17 00:00 KST) 이전 작업분은 사람판정 기회가 없었으므로
    # validated=True → human 상향이 거짓 표시가 된다. 여기서 kepco로 교정한다.
    # 우선순위(행마다 위에서 아래로 체크):
    #   1. worker in IMPORT 목록 → 항상 kepco (날짜 무관)
    #   2. worker가 빈 문자열   → 정체불명, 건드리지 않음
    #   3. replaced_at < ADOPTION_DATE_MS → 도입 전 실작업 → kepco
    _IMPORT_WORKERS = {"KEPCO_IMPORT", "AWMS_IMPORT"}

    def _maybe_kepco(row: dict) -> None:
        """행 status를 kepco로 교정해야 하면 인플레이스 수정."""
        worker = row.get("worker", "") or ""
        if worker in _IMPORT_WORKERS:
            row["status"] = "kepco"
            return
        if not worker:
            return  # 빈 worker = 정체불명, 건드리지 않음
        ra = row.get("replaced_at")
        if ra is not None and ra < ADOPTION_DATE_MS:
            row["status"] = "kepco"

    for row in results.get("meter_values", []):
        _maybe_kepco(row)
    for row in results.get("meter_ids", []):
        _maybe_kepco(row)
    for row in results.get("removal_ids", []):
        _maybe_kepco(row)


# ── 4. GET /results ──────────────────────────────────────────────────────────────
def _compute_results(dataset: str, date: Optional[str]) -> dict:
    """
    /results 핵심 파이프라인 — dataset/date 검증 → CSV+workStatus 병합 → 사진/고객번호/정합성
    부착 → verdict 오버레이까지 전부 적용한 results dict 반환.
    GET /results 핸들러와 GET /monitor/* (조회 전용) 핸들러가 공유한다.
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    if date:
        try:
            datetime.strptime(date, "%Y%m%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="date는 YYYYMMDD 형식")

    _ocr_db_url, _ocr_out_dir = _dataset_ocr_ctx(dataset)
    # csv_dir이 없는 dataset(예: guro)은 out_dir=None → daily_cycle BASE(jongno 전용 경로)를
    # 그대로 읽어 종로 OCR 판정이 누수된다. dataset별 csv_dir이 명시되지 않은 경우
    # 기본(default) dataset이 아니면 빈 CSV 결과를 사용해 종로 CSV 누수를 차단한다.
    _default_dataset = cfg.get("default", "jongno")
    if _ocr_out_dir is None and dataset != _default_dataset:
        # OCR CSV 없는 dataset — 빈 결과에서 시작 (_merge_unverified가 workStatus로 채움)
        results: dict = {"meter_values": [], "meter_ids": [], "removal_ids": []}
    else:
        results = daily_cycle.get_results(date, out_dir=_ocr_out_dir)

    # OCR 안 된 작업 레코드도 "미검증"으로 목록에 합침 (검증 전에도 데이터는 다 보이게)
    _merge_unverified(results, dataset, date)

    # 사진 URL 매핑 — Firebase RTDB에서 replacement_list.removal_photos / new_meter_photo / old_meter_photo 부착
    # 서비스계정 cred 사용 (공개 rules 의존 금지). 매칭 실패 행은 photo_url=null, 크래시 없음.
    _attach_photo_urls(results, dataset, date)

    # 고객번호 조인 — site_data를 mid(계기번호)로 조인해 cust_no 필드 추가.
    # meter_values/meter_ids/removal_ids 모두 mid 컬럼이 철거계기번호(교체 전 계기).
    # new_meter_id는 신설 계기라 site 마스터에 없음 → mid로만 조인.
    site_idx = _load_site_index(dataset)
    if site_idx:
        for row in results.get("meter_values", []):
            row["cust_no"] = _get_cust_no(site_idx, row.get("mid", ""))
        for row in results.get("meter_ids", []):
            row["cust_no"] = _get_cust_no(site_idx, row.get("mid", ""))
        for row in results.get("removal_ids", []):
            row["cust_no"] = _get_cust_no(site_idx, row.get("mid", ""))
            # 스왑(오할당) 신호: 철거사진 OCR(vision_result)이 site-data에 실재하는 "다른" 계기 →
            # 작업은 맞고 할당만 틀림(함체 순서대로 작업했으나 작업번호 매칭 오류).
            # site-data에 있음=진짜 다른 계기(스왑), 없음=단순 OCR 오독. 검침값 무관.
            voc = _re.sub(r"\D", "", str(row.get("vision_result") or ""))
            mid_s = str(row.get("mid", "")).strip()
            row["ocr_in_site"] = (len(voc) == 11 and voc in site_idx)
            row["ocr_swap_suspect"] = (row["ocr_in_site"] and voc != mid_s)

    # 정합성 체크 (데일리 3단계) — OCR 대조와 별개 레이어.
    # meter_values 각 행에 consistency {ok, issues} 부착.
    # check1: 자릿수 위반 / check2: 단상/삼상 위상 불일치 / check3: dm_mt↔var 스왑 의심
    _attach_consistency(results, site_idx)

    # RTDB verdict 실시간 오버레이 — CSV sync_review 없이도 새로고침 후 검증완료 유지.
    # _attach_photo_urls(validated 플래그) 이후에 호출해야 validated 상향이 정상 동작.
    _overlay_verdicts(results, dataset, date)

    return results


@app.get("/results")
def get_results(
    dataset: str = Query(default="jongno", description="dataset id"),
    date: str    = Query(default=None,     description="YYYYMMDD (없으면 전체 누적)"),
):
    """
    검증 결과 CSV 행 반환 (네트워크 없음, 읽기 전용).
    dataset 파라미터는 추후 다중 자료 확장용으로 받되, v1은 jongno 단일.
    """
    results = _compute_results(dataset, date)
    return {
        "dataset": dataset,
        "date": date,
        **results,
    }


# ── 4b. GET /monitor/pending, /monitor/summary, /monitor/active-job ──────────────
#   폰 계기큐 모니터 대시보드 폴링용 (전부 조회 전용, GET, 파괴적 동작·awms 전송 없음).
#   /results 파이프라인(_compute_results)과 /report 집계 로직을 그대로 재사용한다.
@app.get("/monitor/pending")
def get_monitor_pending(
    dataset: str = Query(default="jongno", description="dataset id"),
    date: str    = Query(default=None,     description="YYYYMMDD (없으면 전체 누적)"),
):
    """
    검증완료(validated=True)했지만 아직 awms 미전송(awms_synced=False)인 건 경량 목록.
    meter_ids 트랙(계기 1건=1행) 기준 — addr/mid/new_meter_id/cha 4개 컬럼만 반환
    (사진URL·verdict·정합성 등 무거운 필드는 제외).
    """
    results = _compute_results(dataset, date)
    items = []
    for row in results.get("meter_ids", []):
        if row.get("validated") and not row.get("awms_synced"):
            items.append({
                "addr":         row.get("addr"),
                "mid":          row.get("mid"),
                "new_meter_id": row.get("new_meter_id"),
                "cha":          row.get("cha"),
            })
    return {"dataset": dataset, "date": date, "count": len(items), "items": items}


@app.get("/monitor/summary")
def get_monitor_summary(
    dataset: str = Query(default="jongno", description="dataset id"),
    date: str    = Query(default=None,     description="YYYYMMDD (없으면 전체 누적)"),
):
    """
    오늘 검증/전송 요약 카운트 (조회 전용).
    verified/pending/sent는 meter_ids 트랙(계기 1건=1행) 기준 — validated/awms_synced는
    mid 단위 플래그라 meter_values(필드별 여러행)로 세면 중복 카운트된다.
    need_human_count는 GET /report의 all_groups["확인필요"]["count"]를 그대로 재사용
    (/report는 date 필수라 date 미지정 시 오늘 KST 날짜로 대체).
    """
    results = _compute_results(dataset, date)
    mi_rows = results.get("meter_ids", [])
    verified_count = sum(1 for r in mi_rows if r.get("validated"))
    sent_count     = sum(1 for r in mi_rows if r.get("awms_synced"))
    pending_count  = sum(1 for r in mi_rows if r.get("validated") and not r.get("awms_synced"))

    report_date = date or datetime.now(KST).strftime("%Y%m%d")
    try:
        report = get_report(dataset=dataset, date=report_date)
        need_human_count = report.get("summary", {}).get("확인필요", 0)
    except HTTPException:
        need_human_count = 0

    return {
        "dataset":          dataset,
        "date":             date,
        "verified_count":   verified_count,
        "pending_count":    pending_count,
        "sent_count":       sent_count,
        "need_human_count": need_human_count,
    }


@app.get("/monitor/active-job")
def get_monitor_active_job(
    dataset: str = Query(default="jongno",
                          description="dataset id (현재 전송 잡은 전역 최신 1개만 추적 — 필터링에는 쓰이지 않음)"),
):
    """
    최신 awms 전송 잡(/transmit/run)의 경량 진행상태 (조회 전용, 폴링용).
    잡이 한 번도 생성된 적 없으면 {"job_id": null, "status": "idle"}.
    """
    with _TRANSMIT_JOBS_LOCK:
        job_id = _LATEST_TRANSMIT_JOB_ID
        job = _TRANSMIT_JOBS.get(job_id) if job_id else None
    if job is None:
        return {"job_id": None, "status": "idle"}
    logs = job.get("logs") or []
    return {
        "job_id":       job_id,
        "status":       job.get("status"),
        "total":        job.get("total"),
        "done":         job.get("done"),
        "ok_count":     job.get("ok_count"),
        "fail_count":   job.get("fail_count"),
        "progress":     job.get("progress"),
        "last_log":     logs[-1] if logs else None,
        "seal_current": job.get("seal_current"),
    }


# ── 5. POST /suggest ─────────────────────────────────────────────────────────────
@app.post("/suggest")
async def post_suggest(req: SuggestRequest):
    """
    need_human 건에 대해 Claude 비전으로 판독 제안.

    ANTHROPIC_API_KEY 환경변수가 있으면 실제 Claude 호출,
    없으면 {available: false}로 폴백(크래시 없음).

    사진 URL을 base64로 인코딩해 Claude에 전달.
    반환: {available, suggestion, confidence, reasoning}
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {"available": False, "reason": "ANTHROPIC_API_KEY 환경변수 미설정"}

    try:
        import anthropic  # noqa: F401 (설치 확인용)
    except ImportError:
        return {"available": False, "reason": "anthropic 패키지 미설치 (pip install anthropic)"}

    # 사진 다운로드 → base64
    try:
        import base64
        import httpx as _httpx  # noqa: F401 (이미 requirements에 있음)

        async with __import__("httpx").AsyncClient(timeout=20.0) as client:
            resp = await client.get(req.photo_url)
            if resp.status_code != 200:
                return {"available": False,
                        "reason": f"사진 다운로드 실패 (HTTP {resp.status_code})"}
            img_bytes = resp.content
            content_type = resp.headers.get("content-type", "image/jpeg")
            if ";" in content_type:
                content_type = content_type.split(";")[0].strip()
            img_b64 = base64.b64encode(img_bytes).decode("utf-8")
    except Exception as e:
        return {"available": False, "reason": f"사진 다운로드 오류: {e}"}

    # 프롬프트 구성
    fid_labels = {
        "whme_day":   "주간 유효전력 (정수, 5-6자리)",
        "whme_mngt":  "야간 유효전력 (정수, 5-6자리)",
        "dm_mt_day":  "최대전력 (소수 포함, 예: 31.99 형식 6자리)",
        "var_day":    "무효전력 (정수, 5-6자리)",
    }
    fid_hint = fid_labels.get(req.fid, req.fid)
    worker_hint = f"\n작업자가 입력한 값은 '{req.worker_val}' 입니다." if req.worker_val else ""
    prompt = (
        f"이 사진은 전기 계기(미터)의 LCD 검침값 사진입니다.\n"
        f"읽어야 할 필드: {fid_hint}{worker_hint}\n"
        f"LCD에 표시된 숫자를 정확히 읽어서 아래 형식으로 답하세요:\n\n"
        f"값: <숫자만>\n"
        f"신뢰도: <높음/중간/낮음>\n"
        f"근거: <판독 근거 한 문장>\n\n"
        f"숫자를 읽을 수 없으면: 값: 판독불가 로 답하세요."
    )

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=api_key)

        model = "claude-sonnet-4-6"
        message = client.messages.create(
            model=model,
            max_tokens=256,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": content_type,
                            "data": img_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }],
        )

        raw_text = message.content[0].text.strip()

        # 응답 파싱 (키: 값 형태)
        suggestion = confidence = reasoning = None
        for line in raw_text.splitlines():
            if line.startswith("값:"):
                suggestion = line.split(":", 1)[1].strip()
            elif line.startswith("신뢰도:"):
                confidence = line.split(":", 1)[1].strip()
            elif line.startswith("근거:"):
                reasoning = line.split(":", 1)[1].strip()

        return {
            "available": True,
            "suggestion": suggestion,
            "confidence": confidence,
            "reasoning": reasoning,
            "raw": raw_text,
            "model": model,
        }

    except Exception as e:
        return {
            "available": False,
            "reason": f"Claude API 호출 오류: {e}",
        }


# ── 6. POST /verdict ─────────────────────────────────────────────────────────────
@app.post("/verdict")
def post_verdict(req: VerdictRequest):
    """
    판정 결과를 RTDB ocr_review/daily_val_{date}/{ts} 에 저장.

    verdict_type: "value" | "custom" | "reason"
    - value/custom: text = 판독값(숫자 문자열)
    - reason: text = 불가 사유

    주의: 실제 removal_values DB 반영(--apply)은 Phase 4에서 구현. 여기서 하지 않음.

    TODO(Phase 3): 저장 전 세션/역할 인증 확인.
    """
    if req.verdict_type not in ("value", "custom", "reason"):
        raise HTTPException(
            status_code=400,
            detail="verdict_type은 'value', 'custom', 'reason' 중 하나"
        )

    # 날짜 검증
    try:
        datetime.strptime(req.date, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date는 YYYYMMDD 형식")

    # 데이터셋 설정 로드 → RTDB URL + 서비스 계정 키
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(req.dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")

    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")
    if not rtdb_base:
        raise HTTPException(status_code=500, detail="dataset에 rtdb_review_url 없음")

    store_key = f"daily_val_{req.date}"
    rtdb_path  = f"ocr_review/{store_key}/{req.ts}"

    # 저장 페이로드
    payload: Dict[str, Any] = {
        "type":       req.verdict_type,
        "text":       req.text,
        "saved_at":   datetime.now(KST).isoformat(),
    }
    if req.fid:
        payload["fid"] = req.fid
    if req.mid:
        payload["mid"] = req.mid

    # firebase_admin SDK로 RTDB PATCH
    # daily_cycle이 이미 storageBucket으로 default app 초기화했을 수 있음.
    # → databaseURL이 누락된 기존 app을 감지해, 필요하면 named app 생성.
    try:
        import firebase_admin
        from firebase_admin import credentials, db as fb_db

        db_url = rtdb_base  # 예: https://ami-jongno-default-rtdb...

        def _get_app_with_db():
            """databaseURL이 설정된 firebase_admin app 반환."""
            # 기존 default app 확인
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None:
                # options에 databaseURL이 있으면 재사용
                opts = existing.options
                if opts and opts.get("databaseURL"):
                    return existing
                # databaseURL 없음 → named app 사용
            named = firebase_admin._apps.get("admin_verdict")
            if named is not None:
                return named
            # named app 신규 생성
            if cred_path and Path(cred_path).exists():
                cred = credentials.Certificate(cred_path)
            else:
                cred = credentials.ApplicationDefault()
            return firebase_admin.initialize_app(
                cred,
                {"databaseURL": db_url},
                name="admin_verdict",
            )

        fa_app = _get_app_with_db()
        ref = fb_db.reference(rtdb_path, app=fa_app)
        ref.set(payload)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"RTDB 저장 실패: {e}"
        )

    return {
        "saved": True,
        "path": rtdb_path,
        "payload": payload,
    }


# ── 7. GET /site ─────────────────────────────────────────────────────────────────
@app.get("/site")
def get_site(
    dataset: str = Query(default="jongno", description="dataset id"),
    mid: str     = Query(...,              description="계기번호(11자리, 하이픈없음)"),
):
    """
    계기번호로 site 마스터 레코드(36필드) 반환.
    검증 모달 '현장 정보' 섹션용.
    없으면 {found: false} 반환 (크래시 없음).
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    site_idx = _load_site_index(dataset)
    mid_clean = str(mid).strip()
    rec = site_idx.get(mid_clean)

    if rec is None:
        return {"found": False, "mid": mid_clean}

    return {"found": True, "mid": mid_clean, "site": rec}


# ── 8. GET /daily_summary ────────────────────────────────────────────────────────
@app.get("/daily_summary")
def get_daily_summary(
    dataset: str = Query(default="jongno", description="dataset id"),
    date: str    = Query(...,              description="YYYYMMDD"),
):
    """
    당일 누락 점검 (데일리 검증 1단계).

    workStatus/jongno replacement_list에서 당일(replaced_at 기준 KST) 레코드를 수집해
    아래를 집계해 반환:
      - total         : 총 작업 건수 (AWMS_IMPORT 제외 작업자 레코드)
      - complete      : 완료 건수 (new_meter_id + removal_values 모두 있고 draft != True)
      - draft         : 임시저장 건수 (draft=True 또는 new_meter_id/removal_values 누락)
      - seq_gaps      : daily_seq 연번 구멍 목록 (daily_seq가 있는 레코드 기준, 정렬)
      - missing_photo_count : 사진 누락 건수 (old_meter_photo 또는 new_meter_photo 없음)
      - unverified_mids : 검증 결과(get_results)에 없는 계기번호 목록
      - detail        : 누락 항목 있는 레코드 상세 리스트

    daily_cycle.py 수정 없이 app.py에서 직접 처리.
    임시저장 판단 기준: draft==True 또는 new_meter_id/removal_values 중 하나라도 없음.
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    try:
        datetime.strptime(date, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date는 YYYYMMDD 형식")

    # ── replacement_list 직접 조회 (photo_map 캐시 재사용 불가 — AWMS_IMPORT 포함 전체 필요) ──
    ds = cfg.get("datasets", {}).get(dataset, {})
    # workStatus 전체 트리 = 공유 캐시(_get_ws_raw). /results(_build_photo_map)와 fetch 1회 공유.
    # (AWMS_IMPORT 포함 전체 트리를 그대로 받아 아래에서 date/집계 필터)
    raw = _get_ws_raw(dataset)

    if not isinstance(raw, dict):
        return {
            "dataset": dataset, "date": date,
            "total": 0, "complete": 0, "draft": 0,
            "seq_gaps": [], "missing_photo_count": 0,
            "unverified_mids": [], "detail": [],
        }

    # KST 날짜 필터 문자열 (YYYY-MM-DD)
    target_date_str = f"{date[:4]}-{date[4:6]}-{date[6:]}"

    # ── 당일 레코드 수집 ──────────────────────────────────────────────────────────
    # AWMS_IMPORT 레코드는 작업자 실작업 데이터가 아님 → 제외
    records: list = []
    for addr, addr_val in raw.items():
        if not isinstance(addr_val, dict):
            continue
        for mid, rec in (addr_val.get("replacement_list") or {}).items():
            if not isinstance(rec, dict):
                continue
            ra = rec.get("replaced_at")
            if not ra:
                continue
            # 날짜 필터 (KST)
            rec_date = datetime.fromtimestamp(ra / 1000, KST).strftime("%Y-%m-%d")
            if rec_date != target_date_str:
                continue
            # AWMS_IMPORT(한전 자동동기화) 제외 — 실작업자 데이터만
            if rec.get("worker") == "AWMS_IMPORT":
                continue
            # KEPCO_IMPORT(한전 준공 import) 제외 — 구로 준공물, 검증 대상 아님
            if dataset == "guro" and rec.get("worker") == "KEPCO_IMPORT":
                continue
            records.append(rec)

    total = len(records)

    # ── 완료 / 임시저장 분류 ─────────────────────────────────────────────────────
    # 임시저장 = draft==True 또는 new_meter_id/removal_values 중 하나라도 없음
    complete_list: list = []
    draft_list:    list = []
    for rec in records:
        is_draft = (
            rec.get("draft") is True
            or not rec.get("new_meter_id")
            or not rec.get("removal_values")
        )
        if is_draft:
            draft_list.append(rec)
        else:
            complete_list.append(rec)

    # ── daily_seq 연번 구멍 ───────────────────────────────────────────────────────
    # daily_seq가 있는 레코드 기준. 없는 레코드(AWMS_IMPORT 제외됐으므로 미입력 임시저장 등)는 별도 경고.
    seqs = sorted([
        rec["daily_seq"] for rec in records
        if isinstance(rec.get("daily_seq"), int)
    ])
    seq_gaps: list = []
    if seqs:
        expected = list(range(seqs[0], seqs[-1] + 1))
        seq_gaps = [s for s in expected if s not in set(seqs)]

    # ── 사진 누락 집계 ────────────────────────────────────────────────────────────
    # old_meter_photo 또는 new_meter_photo 없는 완료 레코드 (임시저장은 당연히 없음 → 완료만)
    missing_photo_count = 0
    for rec in complete_list:
        has_old_photo = bool(rec.get("old_meter_photo"))
        has_new_photo = bool(rec.get("new_meter_photo"))
        if not has_old_photo or not has_new_photo:
            missing_photo_count += 1

    # ── 검증 미포함 계기번호 ──────────────────────────────────────────────────────
    # get_results(date) ts15|mid 집합 vs workStatus mid 집합 차집합
    try:
        ocr_results = daily_cycle.get_results(date, out_dir=_dataset_ocr_ctx(dataset)[1])
        verified_mids: set = set()
        for row in ocr_results.get("meter_values", []):
            verified_mids.add(str(row.get("mid", "")))
        for row in ocr_results.get("meter_ids", []):
            verified_mids.add(str(row.get("mid", "")))
        for row in ocr_results.get("removal_ids", []):
            verified_mids.add(str(row.get("mid", "")))
    except Exception:
        verified_mids = set()

    # workStatus mid = old_meter_id (철거계기 = 기준 키)
    ws_mids = set(
        str(rec.get("old_meter_id", ""))
        for rec in records
        if rec.get("old_meter_id")
    )
    unverified_mids = sorted(ws_mids - verified_mids)

    # ── 상세 (누락 항목이 있는 레코드만) ─────────────────────────────────────────
    detail: list = []
    for rec in records:
        missing_items: list = []

        is_draft = (
            rec.get("draft") is True
            or not rec.get("new_meter_id")
            or not rec.get("removal_values")
        )
        if is_draft:
            missing_items.append("임시저장(미완료)")

        if not rec.get("old_meter_photo"):
            missing_items.append("철거사진 없음")
        if not rec.get("new_meter_photo"):
            missing_items.append("신설사진 없음")

        old_mid = str(rec.get("old_meter_id", ""))
        if old_mid and old_mid in set(unverified_mids):
            missing_items.append("OCR 검증 미포함")

        if missing_items:
            detail.append({
                "daily_seq":    rec.get("daily_seq"),
                "old_meter_id": old_mid,
                "new_meter_id": str(rec.get("new_meter_id", "")),
                "worker":       str(rec.get("worker", "")),
                "worker_name":  str(rec.get("worker_name", "")),
                "missing":      missing_items,
            })

    # daily_seq 기준 정렬 (없는 건 맨 뒤)
    detail.sort(key=lambda x: (x["daily_seq"] is None, x["daily_seq"] or 0))

    return {
        "dataset":              dataset,
        "date":                 date,
        "total":                total,
        "complete":             len(complete_list),
        "draft":                len(draft_list),
        "seq_list":             seqs,
        "seq_gaps":             seq_gaps,
        "missing_photo_count":  missing_photo_count,
        "unverified_mids":      unverified_mids,
        "detail":               detail,
    }


# ── 8b. GET /kepco_summary ───────────────────────────────────────────────────────
@app.get("/kepco_summary")
def get_kepco_summary(
    dataset: str = Query(default="guro", description="dataset id (guro 또는 jongno)"),
):
    """
    KEPCO_IMPORT(한전 준공물) 레코드를 날짜별(KST replaced_at 기준)로 집계해 반환.

    반환 형식:
      { "dataset": "guro",
        "total": N,
        "records": [
          { "date": "2025-12-09", "count": 235,
            "items": [
              { "cust_no": "01-4005-2742", "addr": "서울특별시 구로구 ...",
                "old_meter_id": "35170359106", "new_meter_id": "05530177155", "cha": "1차" }
            ]
          }, ...
        ]
      }

    records는 date 오름차순 정렬.
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    ds = cfg.get("datasets", {}).get(dataset, {})
    cred_path = ds.get("cred", "")
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    if not rtdb_base:
        raise HTTPException(status_code=500, detail="dataset에 rtdb_review_url 없음")

    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_kepco_app():
            named = firebase_admin._apps.get("daily_summary")
            if named is not None:
                return named
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None:
                opts = existing.options
                if opts and opts.get("databaseURL"):
                    return existing
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(
                cred,
                {"databaseURL": rtdb_base},
                name="daily_summary",
            )

        fa_app = _get_kepco_app()
        ref = fb_db.reference(ds.get("ws_path", "workStatus/jongno"), app=fa_app)
        raw = ref.get()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 실패: {e}")

    if not isinstance(raw, dict):
        return {"dataset": dataset, "total": 0, "records": []}

    # KEPCO_IMPORT 레코드만 수집해 날짜별 그룹화
    from collections import defaultdict
    groups: dict = defaultdict(list)  # date_str -> list of items

    for addr, addr_val in raw.items():
        if not isinstance(addr_val, dict):
            continue
        for mid, rec in (addr_val.get("replacement_list") or {}).items():
            if not isinstance(rec, dict):
                continue
            if rec.get("worker") != "KEPCO_IMPORT":
                continue
            ra = rec.get("replaced_at")
            if not ra:
                continue
            # KST(Asia/Seoul) 기준 날짜 변환 — UTC 절대 금지
            date_str = datetime.fromtimestamp(ra / 1000, KST).strftime("%Y-%m-%d")
            groups[date_str].append({
                "cust_no":      rec.get("cust_no"),
                "addr":         addr,
                "old_meter_id": rec.get("old_meter_id"),
                "new_meter_id": rec.get("new_meter_id"),
                "cha":          rec.get("cha"),
            })

    # date 오름차순 정렬
    sorted_dates = sorted(groups.keys())
    records_out = [
        {
            "date":  date_key,
            "count": len(groups[date_key]),
            "items": groups[date_key],
        }
        for date_key in sorted_dates
    ]
    total = sum(r["count"] for r in records_out)

    return {
        "dataset": dataset,
        "total":   total,
        "records": records_out,
    }


# ── 9. GET /dates ────────────────────────────────────────────────────────────────
@app.get("/dates")
def get_dates(
    dataset: str = Query(default="jongno", description="dataset id"),
):
    """
    replacement_list의 replaced_at(ms)을 KST 기준 YYYYMMDD로 변환해
    작업 데이터가 존재하는 날짜 목록(정렬)을 반환.

    날짜 피커에서 "작업 있는 날만 강조/선택" 용도.
    workStatus 전체를 캐시(_PHOTO_CACHE "dataset:ALL")에서 재사용해 추가 네트워크 없음.

    반환 예: {"dataset":"jongno","dates":["20260623","20260625",...]}
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    # date=None으로 전체 캐시 재사용 (캐시 키: "dataset:ALL")
    try:
        maps = _get_photo_map(dataset, None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 실패: {e}")

    ts_mid_map = maps.get("ts_mid_map", {})

    # ts15 = YYYYMMDD_HHMMSS → 앞 8자리가 날짜
    date_set: set = set()
    for (ts15, _mid) in ts_mid_map.keys():
        if len(ts15) >= 8:
            date_set.add(ts15[:8])

    return {
        "dataset": dataset,
        "dates": sorted(date_set),
    }


# ── 10. POST /apply ──────────────────────────────────────────────────────────────
# 허용 field 집합 (읽기 4종 + 계기번호 2종)
_READING_FIELDS = {"whme_day", "whme_mngt", "dm_mt_day", "var_day"}
_METER_ID_FIELDS = {"old_meter_id", "new_meter_id"}
_ALLOWED_FIELDS = _READING_FIELDS | _METER_ID_FIELDS


def _num(x) -> Any:
    """
    검침값 타입 정규화 — DB에 number로 저장하고, skip 비교도 같은 타입으로.
    "17591" → 17591 (int), "31.90" → 31.9 (float, 소수 trailing-zero 제거).
    정수로 표현 가능한 float는 int로 변환 (17591.0 → 17591).
    변환 실패 시 원본 반환 (안전 폴백, 400은 빈값에서 이미 걸림).
    """
    try:
        f = float(str(x).strip())
        return int(f) if f == int(f) else f
    except (ValueError, TypeError):
        return x


# ── mid→addr 인덱스 캐시 (B3: /apply egress 절감 — 2026-07-21 검증팀) ──────────────
#   /apply 는 현재값(멱등 판정 대상)을 fresh 로 읽어야 하는데, 그동안 workStatus 전체 트리(~6MB)를
#   매 호출 GET 해서 mid→addr 를 선형 탐색했다. mid→addr 매핑은 값 write(apply)로는 변하지 않고
#   스왑에서만 변하므로, 매핑만 별도 인덱스(TTL 10분, apply write에 무효화하지 않음)로 캐시한다.
#   /apply 는 인덱스로 addr 를 찾아 그 addr 서브트리만 fresh GET(수 KB) → 현재값 신선도(안전장치) 유지 +
#   전체 트리(~6MB) 회피. 인덱스 미스/stale/신규 mid → 전체GET 폴백(기존 동작 100% 보존). 스왑 시 무효화.
_MID_ADDR_IDX: Dict[str, dict] = {}    # dataset -> {"idx": {mid:addr}, "ts": monotonic}
_MID_ADDR_IDX_TTL = 600.0
_MID_ADDR_IDX_LOCK = threading.Lock()


def _invalidate_mid_addr_index(dataset: Optional[str] = None) -> None:
    with _MID_ADDR_IDX_LOCK:
        if dataset is None:
            _MID_ADDR_IDX.clear()
        else:
            _MID_ADDR_IDX.pop(dataset, None)


def _lookup_addr_for_mid(dataset: str, mid: str, ws_ref) -> Optional[str]:
    """인덱스로 mid의 addr 를 반환. 인덱스 유효+히트면 원격 GET 0.
    만료/부재면 전체 트리 1회 GET 으로 재구축. fresh 인데 mid 없으면 None(→ 호출측 전체GET 폴백)."""
    now = time.monotonic()
    with _MID_ADDR_IDX_LOCK:
        ent = _MID_ADDR_IDX.get(dataset)
        if ent is not None and (now - ent["ts"]) < _MID_ADDR_IDX_TTL:
            return ent["idx"].get(mid)
    raw = ws_ref.get()
    idx: Dict[str, str] = {}
    if isinstance(raw, dict):
        for addr, av in raw.items():
            if isinstance(av, dict):
                for m in (av.get("replacement_list") or {}):
                    idx[str(m)] = addr
    with _MID_ADDR_IDX_LOCK:
        _MID_ADDR_IDX[dataset] = {"idx": idx, "ts": now}
    return idx.get(mid)


def _unarchive_addr_if_needed(fa_app, ws_ref, ws_path: str, addr: str, addr_node: Any, dataset: str) -> Optional[dict]:
    """주소가 P3 아카이브(stub)면 archive full 을 라이브로 복원(un-stub)하고 복원한 full dict 반환.
    아카이브가 아니면 None.

    계기팀 P3 계약(2026-07-21 확정): 아카이브된 주소는 라이브에 archived:true + archive_week 만 남고
    removal_values(검침값)·removal_photos 등 무거운 필드는 archive/{ws_path}/{week}/{addr} 로 빠진다.
    stub 에 부분 필드를 새로 쓰는 것은 금지 → /apply 는 값 쓰기 전에 반드시 full 을 복원(un-stub)해야 한다.
    라이브 키 == archive 키(동일 인코딩)라 addr 를 그대로 archive 경로에 사용한다."""
    if not (isinstance(addr_node, dict) and addr_node.get("archived") is True):
        return None
    from firebase_admin import db as fb_db
    aw = addr_node.get("archive_week")
    if not aw:
        raise HTTPException(status_code=500,
            detail=f"'{addr}' 이(가) archived 인데 archive_week 없음 — 복원 경로 특정 불가")
    arch_ref = fb_db.reference("archive/" + ws_path, app=fa_app).child(str(aw)).child(addr)
    full = arch_ref.get()
    if not isinstance(full, dict):
        raise HTTPException(status_code=500,
            detail=f"archive 복원 실패: archive/{ws_path}/{aw}/{addr} 없음/손상 — apply 중단")
    # 라이브 stub 플래그 제거(un-stub): addr 레벨 + per-meter 레벨
    full.pop("archived", None)
    full.pop("archive_week", None)
    for _r in (full.get("replacement_list") or {}).values():
        if isinstance(_r, dict):
            _r.pop("archived", None)
    ws_ref.child(addr).set(full)          # 라이브에 full 통째 되쓰기(un-stub)
    _invalidate_mid_addr_index(dataset)   # 구조 변경 반영(다음 조회가 재구축)
    return full


class ApplyRequest(BaseModel):
    dataset: str
    mid: str          # 철거계기번호(11자리, 하이픈 없음)
    field: str        # whme_day / whme_mngt / dm_mt_day / var_day / old_meter_id / new_meter_id
    verdict_value: str
    actor: str        # 판정자 (예: "admin", "영준")
    dry_run: bool = True   # 기본 True — 명시적으로 False 전달해야 실제 쓰기


@app.post("/apply")
def post_apply(req: ApplyRequest):
    """
    판정값을 종로 Firebase(ami-jongno)에 자동 적용한다.

    안전장치:
      1. live 재조회 (캐시 사용 금지) — fresh snapshot으로 현재값 확인
      2. current == verdict_value 이면 skip(멱등) — 이미 동일 값이면 쓰지 않음
      3. verdict_value 빈값 거부 (400)
      4. dry_run=true: 실제 쓰기 없이 would_change/current_value/new_value 반환
      5. dry_run=false + 변경 있을 때만: 해당 field만 PATCH + audit 로그 append

    audit 로그 경로: ami-jongno RTDB admin_validate/audit/{push_key}
      {ts, actor, addr, mid, field, old, new}

    awms는 절대 건드리지 않음 (종로 DB만).
    """
    # ── 입력 검증 ─────────────────────────────────────────────────────────────────

    # field 허용 목록 확인
    if req.field not in _ALLOWED_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"field '{req.field}' 불가. 허용: {sorted(_ALLOWED_FIELDS)}"
        )

    # verdict_value 빈값 거부
    if not req.verdict_value or not req.verdict_value.strip():
        raise HTTPException(status_code=400, detail="verdict_value 빈값 불가")

    # mid 기본 형식 확인 (비어있으면 거부)
    mid_clean = str(req.mid).strip()
    if not mid_clean:
        raise HTTPException(status_code=400, detail="mid(계기번호) 빈값 불가")

    # 데이터셋 설정 로드
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(req.dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")

    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")
    if not rtdb_base:
        raise HTTPException(status_code=500, detail="dataset에 rtdb_review_url 없음")

    # ── firebase app 확보 (/verdict 패턴 재사용) ──────────────────────────────────
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_apply_app():
            """databaseURL이 설정된 firebase_admin app 반환 (admin_verdict와 공유 우선)."""
            # 기존 default app 확인
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None:
                opts = existing.options
                if opts and opts.get("databaseURL"):
                    return existing
            # named app "admin_verdict" 재사용 (이미 초기화돼 있으면)
            named = firebase_admin._apps.get("admin_verdict")
            if named is not None:
                return named
            # "admin_apply" 신규 named app 생성
            existing_apply = firebase_admin._apps.get("admin_apply")
            if existing_apply is not None:
                return existing_apply
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(
                cred,
                {"databaseURL": rtdb_base},
                name="admin_apply",
            )

        fa_app = _get_apply_app()

        # ── 1. live 재조회 (현재값은 캐시 금지 — 안전장치 핵심) ─────────────────
        #   B3(2026-07-21 검증팀): mid→addr 는 인덱스로 찾고, 현재값(멱등 판정 대상)은 해당 addr
        #   서브트리만 캐시 없이 fresh GET → 신선도(안전장치) 유지 + 전체 트리(~6MB) 회피.
        #   인덱스 미스/stale/신규 → 전체GET 폴백(기존 동작 100% 보존, 인덱스도 갱신).
        ws_ref = fb_db.reference(ds.get("ws_path","workStatus/jongno"), app=fa_app)

        found_addr: Optional[str] = None
        found_rec: Optional[dict] = None
        found_node: Optional[dict] = None   # addr 서브트리(archived 판정용)

        addr_hint = _lookup_addr_for_mid(req.dataset, mid_clean, ws_ref)
        if addr_hint:
            sub = ws_ref.child(addr_hint).get()   # addr 서브트리만 fresh GET
            if isinstance(sub, dict):
                rec = (sub.get("replacement_list") or {}).get(mid_clean)
                if isinstance(rec, dict):
                    found_addr = addr_hint
                    found_rec = rec
                    found_node = sub

        if found_addr is None:
            # 폴백: 전체 트리 재조회 후 선형 탐색 + 인덱스 재구축(신규 mid / 인덱스 stale 대비)
            raw = ws_ref.get()
            if not isinstance(raw, dict):
                raise HTTPException(status_code=500, detail="workStatus/jongno 데이터 없음")
            idx: Dict[str, str] = {}
            for addr, addr_val in raw.items():
                if not isinstance(addr_val, dict):
                    continue
                rep_list = addr_val.get("replacement_list") or {}
                for m in rep_list:
                    idx[str(m)] = addr
                if found_addr is None and mid_clean in rep_list:
                    rec = rep_list[mid_clean]
                    if isinstance(rec, dict):
                        found_addr = addr
                        found_rec = rec
                        found_node = addr_val
            with _MID_ADDR_IDX_LOCK:
                _MID_ADDR_IDX[req.dataset] = {"idx": idx, "ts": time.monotonic()}

        # ── un-archive: 주소가 P3 아카이브(stub)면 archive full 복원 후 진행 ──────────
        #   계기팀 P3 계약(2026-07-21): stub 에는 removal_values(검침값)·removal_photos 등이 없으므로
        #   여기서 archive/{ws_path}/{week}/{addr} full 을 라이브로 복원(un-stub)한 뒤에만 apply 한다.
        #   (stub 에 부분 필드 새로쓰기 금지) archive_week 는 'YYYY-Www' 또는 'legacy' 등 문자열 그대로 경로 사용.
        #   현재 라이브에 archived 주소가 없으면(P3 실행 전) 이 블록은 항상 스킵 → 기존 동작 100% 보존.
        if found_node is not None and isinstance(found_node, dict) and found_node.get("archived") is True:
            restored = _unarchive_addr_if_needed(
                fa_app, ws_ref, ds.get("ws_path", "workStatus/jongno"),
                found_addr, found_node, req.dataset)
            if restored is not None:
                found_rec = (restored.get("replacement_list") or {}).get(mid_clean)
                if not isinstance(found_rec, dict):
                    raise HTTPException(status_code=500,
                        detail=f"un-archive 복원 후에도 mid '{mid_clean}' 을(를) 찾을 수 없음")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 실패: {e}")

    if found_addr is None or found_rec is None:
        raise HTTPException(
            status_code=404,
            detail=f"mid '{mid_clean}' 을(를) workStatus/jongno 에서 찾을 수 없음"
        )

    # ── 현재값 읽기 (field 분기) ──────────────────────────────────────────────────
    if req.field in _READING_FIELDS:
        # 검침값: removal_values 하위 필드
        current_raw = (found_rec.get("removal_values") or {}).get(req.field)
    else:
        # 계기번호: replacement_list[mid] 직접 필드
        current_raw = found_rec.get(req.field)

    # ── 2. 멱등 skip 판정 ─────────────────────────────────────────────────────────
    # 검침값 4종: _num() 정규화 비교 (DB=int/float vs 입력값 문자열, 타입 불일치 방지)
    # 계기번호 2종: str 비교 (선두 0 보존 필요 — int 변환 금지)
    if req.field in _READING_FIELDS:
        is_same = _num(current_raw) == _num(req.verdict_value)
    else:
        is_same = str(current_raw).strip() == req.verdict_value.strip()

    if is_same:
        return {
            "applied": False,
            "skip": True,
            "reason": "이미 동일 값 — 변경 없음",
            "addr": found_addr,
            "mid": mid_clean,
            "field": req.field,
            "current_value": current_raw,
            "new_value": req.verdict_value,
        }

    # ── 3. dry_run=true: 미리보기만 반환 ─────────────────────────────────────────
    if req.dry_run:
        return {
            "applied": False,
            "dry_run": True,
            "would_change": True,
            "addr": found_addr,
            "mid": mid_clean,
            "field": req.field,
            "current_value": current_raw,
            "new_value": req.verdict_value,
        }

    # ── 4. 실제 쓰기 (dry_run=false, 변경있을 때만) ──────────────────────────────
    # 검침값 4종: DB 타입(number)에 맞게 _num() 정규화 후 저장 (문자열→숫자 타입 드리프트 방지)
    # 계기번호 2종: 문자열 그대로 저장 (선두 0 보존)
    write_value: Any = _num(req.verdict_value) if req.field in _READING_FIELDS else req.verdict_value

    try:
        if req.field in _READING_FIELDS:
            # 검침값: .../replacement_list/{mid}/removal_values/{field} 만 set
            leaf_ref = fb_db.reference(
                "workStatus/jongno",
                app=fa_app
            ).child(found_addr).child("replacement_list").child(mid_clean) \
             .child("removal_values").child(req.field)
        else:
            # 계기번호: .../replacement_list/{mid}/{field} 만 set
            leaf_ref = fb_db.reference(
                "workStatus/jongno",
                app=fa_app
            ).child(found_addr).child("replacement_list").child(mid_clean) \
             .child(req.field)

        leaf_ref.set(write_value)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 쓰기 실패: {e}")

    # ── 5. audit 로그 append (push = 고유 push_key, 덮어쓰기 없음) ────────────────
    now_kst = datetime.now(KST)
    audit_payload: Dict[str, Any] = {
        "ts":      now_kst.isoformat(),
        "action":  "apply",          # apply / rollback 구분 (구버전 로그는 action 없음 → apply로 간주)
        "actor":   req.actor,
        "addr":    found_addr,
        "mid":     mid_clean,
        "field":   req.field,
        "old":     current_raw,
        "new":     write_value,
        "dataset": req.dataset,
    }
    with _PHOTO_CACHE_LOCK:
        _PHOTO_CACHE.clear()   # 쓰기 반영 위해 결과 캐시 무효화
        _WS_RAW_CACHE.clear()  # raw 트리 캐시도 무효화(stale 방지)
    audit_saved = False
    audit_key: Optional[str] = None
    try:
        audit_ref = fb_db.reference("admin_validate/audit", app=fa_app)
        new_ref = audit_ref.push(audit_payload)
        audit_key = new_ref.key   # 롤백 연결용 push key
        audit_saved = True
    except Exception as e:
        # audit 실패는 경고만 — 이미 쓰기는 완료됐으므로 에러 아님
        print(f"[apply] audit 로그 저장 실패: {e}", flush=True)

    return {
        "applied": True,
        "dry_run": False,
        "audit_saved": audit_saved,
        "audit_key": audit_key,         # 되돌리기(/rollback)에 전달
        "addr": found_addr,
        "mid": mid_clean,
        "field": req.field,
        "current_value": current_raw,   # skip/dry-run과 키 통일
        "new_value": write_value,
        "actor": req.actor,
        "ts": now_kst.isoformat(),
    }


# ── 10b. POST /rollback ───────────────────────────────────────────────────────────
def _val_is_empty(v: Any) -> bool:
    """None / 공백문자열을 빈값으로 판정."""
    return v is None or (isinstance(v, str) and v.strip() == "")


def _vals_equal(a: Any, b: Any, field: str) -> bool:
    """field 타입에 맞춰 값 동등 비교 (검침값=숫자정규화, 계기번호=문자열, 빈값 통일)."""
    if _val_is_empty(a) and _val_is_empty(b):
        return True
    if _val_is_empty(a) != _val_is_empty(b):
        return False
    if field in _READING_FIELDS:
        return _num(a) == _num(b)
    return str(a).strip() == str(b).strip()


class RollbackRequest(BaseModel):
    dataset: str
    audit_key: str    # 되돌릴 audit 로그의 push key (admin_validate/audit/{key})
    actor: str        # 실행자


@app.post("/rollback")
def post_rollback(req: RollbackRequest):
    """
    이전 /apply 변경을 되돌린다 — audit 로그의 old 값을 leaf에 복원.

    안전장치 (3-way 가드, live 재조회):
      1. audit 로그에서 addr/mid/field/old/new 읽음 (action='rollback'은 재롤백 거부)
      2. live 현재값 재조회
      3. current == new(이 audit가 쓴 값)  → 진행(old 복원)
         current == old                    → skip "이미 되돌려짐"(멱등·더블클릭 안전)
         그 외                              → 409 "이후 다른 변경 있음, 수동 확인"
      4. old가 빈값이면 leaf 삭제(set None), 아니면 저장된 타입 그대로 복원(_num/str 강제 안 함)
      5. rollback audit 로그 append (action='rollback', ref_audit_key)

    awms는 절대 건드리지 않음 (종로 DB만).
    """
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(req.dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")

    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")
    if not rtdb_base:
        raise HTTPException(status_code=500, detail="dataset에 rtdb_review_url 없음")

    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_apply_app():
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None:
                opts = existing.options
                if opts and opts.get("databaseURL"):
                    return existing
            named = firebase_admin._apps.get("admin_verdict")
            if named is not None:
                return named
            existing_apply = firebase_admin._apps.get("admin_apply")
            if existing_apply is not None:
                return existing_apply
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(
                cred, {"databaseURL": rtdb_base}, name="admin_apply",
            )

        fa_app = _get_apply_app()

        # ── 1. audit 로그 읽기 ────────────────────────────────────────────────────
        audit_entry = fb_db.reference("admin_validate/audit", app=fa_app) \
            .child(req.audit_key).get()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"audit 조회 실패: {e}")

    if not isinstance(audit_entry, dict):
        raise HTTPException(status_code=404, detail=f"audit_key '{req.audit_key}' 없음")

    # 재롤백 금지 (롤백 로그는 되돌리지 않음 — 체인 방지)
    if audit_entry.get("action") == "rollback":
        raise HTTPException(status_code=400, detail="롤백 로그는 다시 되돌릴 수 없습니다")

    # ── 스왑 되돌리기: 두 레코드 full 스냅샷을 원자적으로 복원 ──────────────────────
    if audit_entry.get("action") == "swap":
        addr  = audit_entry.get("addr")
        mid_a = str(audit_entry.get("mid_a", "")).strip()
        mid_b = str(audit_entry.get("mid_b", "")).strip()
        snap_a = audit_entry.get("snapshot_a")
        snap_b = audit_entry.get("snapshot_b")
        if not addr or not mid_a or not mid_b or not isinstance(snap_a, dict) or not isinstance(snap_b, dict):
            raise HTTPException(status_code=400, detail="스왑 audit 로그 손상(addr/mid/snapshot 확인)")
        try:
            rl_ref = fb_db.reference(ds.get("ws_path","workStatus/jongno"), app=fa_app) \
                .child(addr).child("replacement_list")
            cur = rl_ref.get() or {}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"현재값 조회 실패: {e}")
        cur_a = cur.get(mid_a) or {}
        cur_b = cur.get(mid_b) or {}
        # 멱등: 이미 스냅샷(=스왑 전) 상태로 돌아가 있으면 skip
        if (_vals_equal(cur_a.get("new_meter_id"), snap_a.get("new_meter_id"), "new_meter_id") and
                _vals_equal(cur_b.get("new_meter_id"), snap_b.get("new_meter_id"), "new_meter_id")):
            return {"rolled_back": False, "skip": True,
                    "reason": "이미 되돌려진 상태 — 변경 없음",
                    "addr": addr, "mid_a": mid_a, "mid_b": mid_b}
        # 충돌 가드: 현재가 스왑 직후 상태(서로 교환됨)여야 안전하게 되돌림
        post_ok = (_vals_equal(cur_a.get("new_meter_id"), snap_b.get("new_meter_id"), "new_meter_id") and
                   _vals_equal(cur_b.get("new_meter_id"), snap_a.get("new_meter_id"), "new_meter_id"))
        if not post_ok:
            raise HTTPException(status_code=409,
                detail="이후 다른 변경이 있어 스왑 되돌리기 불가. 수동 확인 필요.")
        try:
            rl_ref.update({mid_a: snap_a, mid_b: snap_b})  # 두 레코드 원자 복원
            with _PHOTO_CACHE_LOCK:
                _PHOTO_CACHE.clear()
                _WS_RAW_CACHE.clear()  # raw 트리 캐시도 무효화(stale 방지)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"스왑 복원 실패: {e}")
        now_kst = datetime.now(KST)
        try:
            fb_db.reference("admin_validate/audit", app=fa_app).push({
                "ts": now_kst.isoformat(), "action": "rollback", "actor": req.actor,
                "addr": addr, "mid_a": mid_a, "mid_b": mid_b,
                "field": "(스왑 되돌리기)", "dataset": req.dataset,
                "ref_audit_key": req.audit_key,
            })
        except Exception as e:
            print(f"[rollback-swap] audit 저장 실패: {e}", flush=True)
        return {"rolled_back": True, "swap": True,
                "addr": addr, "mid_a": mid_a, "mid_b": mid_b,
                "actor": req.actor, "ts": now_kst.isoformat()}

    addr  = audit_entry.get("addr")
    mid   = str(audit_entry.get("mid", "")).strip()
    field = audit_entry.get("field")
    old_v = audit_entry.get("old")   # 복원 대상 (apply 이전 값)
    new_v = audit_entry.get("new")   # apply가 쓴 값

    if not addr or not mid or field not in _ALLOWED_FIELDS:
        raise HTTPException(status_code=400, detail="audit 로그가 손상됨(addr/mid/field 확인)")

    # ── 2. live 현재값 재조회 ─────────────────────────────────────────────────────
    try:
        base = fb_db.reference(ds.get("ws_path","workStatus/jongno"), app=fa_app) \
            .child(addr).child("replacement_list").child(mid)
        if field in _READING_FIELDS:
            leaf_ref = base.child("removal_values").child(field)
        else:
            leaf_ref = base.child(field)
        current_raw = leaf_ref.get()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"현재값 조회 실패: {e}")

    # ── 3. 3-way 가드 ─────────────────────────────────────────────────────────────
    if _vals_equal(current_raw, old_v, field):
        return {
            "rolled_back": False,
            "skip": True,
            "reason": "이미 되돌려진 상태 — 변경 없음",
            "addr": addr, "mid": mid, "field": field,
            "current_value": current_raw, "restore_to": old_v,
        }
    if not _vals_equal(current_raw, new_v, field):
        raise HTTPException(
            status_code=409,
            detail=(f"이후 다른 변경이 있어 자동 롤백 불가 (현재값={current_raw!r}, "
                    f"이 변경이 쓴 값={new_v!r}). 수동 확인 필요."),
        )

    # ── 4. old 복원 (빈값이면 leaf 삭제, 아니면 저장 타입 그대로) ──────────────────
    try:
        if _val_is_empty(old_v):
            leaf_ref.delete()    # apply가 채운 필드였음 → 원래대로 비움 (set(None)은 firebase-admin에서 불가)
            restored = None
        else:
            leaf_ref.set(old_v)  # 저장된 타입 그대로 — _num/str 강제 안 함(선두0 드리프트 방지)
            restored = old_v
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 복원 실패: {e}")

    # ── 5. rollback audit 로그 append ─────────────────────────────────────────────
    now_kst = datetime.now(KST)
    rb_payload: Dict[str, Any] = {
        "ts":            now_kst.isoformat(),
        "action":        "rollback",
        "actor":         req.actor,
        "addr":          addr,
        "mid":           mid,
        "field":         field,
        "old":           current_raw,   # 롤백 직전값(=apply가 썼던 값)
        "new":           restored,      # 복원한 값(=원래 old)
        "dataset":       req.dataset,
        "ref_audit_key": req.audit_key, # 어떤 apply를 되돌렸는지
    }
    with _PHOTO_CACHE_LOCK:
        _PHOTO_CACHE.clear()   # 쓰기 반영 위해 결과 캐시 무효화
        _WS_RAW_CACHE.clear()  # raw 트리 캐시도 무효화(stale 방지)
    audit_saved = False
    try:
        fb_db.reference("admin_validate/audit", app=fa_app).push(rb_payload)
        audit_saved = True
    except Exception as e:
        print(f"[rollback] audit 로그 저장 실패: {e}", flush=True)

    return {
        "rolled_back": True,
        "audit_saved": audit_saved,
        "addr": addr, "mid": mid, "field": field,
        "previous_value": current_raw,   # 되돌리기 전(apply가 쓴 값)
        "restored_value": restored,      # 복원된 값
        "actor": req.actor,
        "ts": now_kst.isoformat(),
    }


# ── 10c. POST /swap (스왑 교정: 두 칸 작업데이터 통째 교환) ─────────────────────────
# SWAP = 작업자가 넣은 작업 결과(이 칸에 잘못 할당된 것). 두 키 사이에 통째 교환.
_SWAP_FIELDS = {
    "new_meter_id", "new_meter_photo", "new_meter_photo_thumb", "new_meter_mfg_ym",
    "old_meter_photo", "old_meter_photo_thumb",
    "removal_values", "removal_value", "removal_photos",
    "removal_lcd_photos", "removal_lcd_regions", "removal_lcd_flags",
    "daily_seq", "replaced_at", "draft", "remark", "worker", "worker_name",
    "last_edited_at", "last_edited_by", "extra_data", "quarantine",
}
# STAY(절대 안 옮김): old_meter_id(키), 계약전력/계약종별/cntr_*(계약), awms_cons_*/awms_reg_id(작업대상 식별자),
#   source/imported_at(import 메타), 그 외 _SWAP_FIELDS에 없는 모든 필드.
# awms 동기화결과: 스왑 후 무효 → 통째 제거 + awms_synced=False (재등록 필요 표시. 자동 awms수정 안 함).
_AWMS_RESULT_FIELDS = {"awms_response", "awms_synced", "awms_synced_at", "awms_error", "awms_error_at"}


class SwapRequest(BaseModel):
    dataset: str
    addr: str
    mid_a: str
    mid_b: str
    actor: str
    # 드리프트 가드: 탐지/표시 시점에 각 칸에 있던 신설번호. live가 이와 다르면 거부(이미 수정된 건 보호).
    expect_a_new: Optional[str] = None
    expect_b_new: Optional[str] = None


@app.post("/swap")
def post_swap(req: SwapRequest):
    """
    같은 주소의 두 칸(mid_a, mid_b) 작업 데이터를 통째로 맞바꾼다 (할당 오류 정정).

    안전장치:
      1. live 재조회 (캐시 금지). 두 칸 모두 존재해야 함.
      2. 드리프트 가드: 현재 new_meter_id == expect(탐지시점) 이어야 진행.
         다르면 409 (이미 수정된 건/외부 편집 보호 — 92·93처럼 종로맵서 고친 건 재손상 방지).
      3. 개별 수정 가드: 두 mid 중 portal /apply 이력 있으면 409 (edit-then-swap 꼬임 방지).
      4. _SWAP_FIELDS만 교환, 나머지(키·계약·awms식별자)는 제자리.
         awms 동기화결과는 제거 + awms_synced=False (awms 재등록 필요 표시).
      5. 단일 update()로 원자 교환. audit action='swap' + 두 레코드 full 스냅샷(되돌리기용).

    awms 자동수정은 안 함 (종로 DB만).
    """
    mid_a = str(req.mid_a).strip()
    mid_b = str(req.mid_b).strip()
    addr  = str(req.addr).strip()
    if not addr or not mid_a or not mid_b:
        raise HTTPException(status_code=400, detail="addr/mid_a/mid_b 필수")
    if mid_a == mid_b:
        raise HTTPException(status_code=400, detail="같은 계기는 스왑 불가")

    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(req.dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")
    if not rtdb_base:
        raise HTTPException(status_code=500, detail="dataset에 rtdb_review_url 없음")

    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_apply_app():
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None:
                opts = existing.options
                if opts and opts.get("databaseURL"):
                    return existing
            for nm in ("admin_verdict", "admin_apply"):
                named = firebase_admin._apps.get(nm)
                if named is not None:
                    return named
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(
                cred, {"databaseURL": rtdb_base}, name="admin_apply",
            )

        fa_app = _get_apply_app()
        rl_ref = fb_db.reference(ds.get("ws_path","workStatus/jongno"), app=fa_app) \
            .child(addr).child("replacement_list")
        cur = rl_ref.get() or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 실패: {e}")

    rec_a = cur.get(mid_a)
    rec_b = cur.get(mid_b)
    if not isinstance(rec_a, dict) or not isinstance(rec_b, dict):
        raise HTTPException(status_code=404,
            detail=f"두 계기({mid_a}, {mid_b})가 '{addr}'에 모두 있어야 합니다.")

    # ── 2. 드리프트 가드 (live == 탐지시점) ──────────────────────────────────────
    if req.expect_a_new is not None and not _vals_equal(rec_a.get("new_meter_id"), req.expect_a_new, "new_meter_id"):
        raise HTTPException(status_code=409,
            detail=(f"데이터가 이미 변경됨, 재검증 필요 ({mid_a} 현재 신설={rec_a.get('new_meter_id')!r}, "
                    f"탐지시점={req.expect_a_new!r})."))
    if req.expect_b_new is not None and not _vals_equal(rec_b.get("new_meter_id"), req.expect_b_new, "new_meter_id"):
        raise HTTPException(status_code=409,
            detail=(f"데이터가 이미 변경됨, 재검증 필요 ({mid_b} 현재 신설={rec_b.get('new_meter_id')!r}, "
                    f"탐지시점={req.expect_b_new!r})."))

    # ── 3. 개별 수정(apply) 이력 가드 — edit-then-swap 꼬임 방지 ──────────────────
    try:
        all_audit = fb_db.reference("admin_validate/audit", app=fa_app).get() or {}
        edited = set()
        for _k, _e in all_audit.items():
            if isinstance(_e, dict) and _e.get("action") == "apply" and str(_e.get("mid", "")) in (mid_a, mid_b):
                edited.add(str(_e.get("mid")))
        if edited:
            raise HTTPException(status_code=409,
                detail=(f"개별 값 수정 이력이 있어 스왑 불가({', '.join(sorted(edited))}). "
                        f"먼저 그 수정을 되돌린 뒤 스왑하세요(꼬임 방지)."))
    except HTTPException:
        raise
    except Exception as e:
        print(f"[swap] apply 이력 확인 실패(무시하고 진행 안 함): {e}", flush=True)
        raise HTTPException(status_code=500, detail=f"수정 이력 확인 실패: {e}")

    # ── 4. 스왑 레코드 구성 (_SWAP_FIELDS만 교환) ────────────────────────────────
    import copy
    new_a = copy.deepcopy(rec_a)
    new_b = copy.deepcopy(rec_b)
    for f in _SWAP_FIELDS:
        va = rec_a.get(f)
        vb = rec_b.get(f)
        if vb is None:
            new_a.pop(f, None)
        else:
            new_a[f] = vb
        if va is None:
            new_b.pop(f, None)
        else:
            new_b[f] = va
    # awms 동기화결과 무효화 (재등록 필요)
    for f in _AWMS_RESULT_FIELDS:
        new_a.pop(f, None)
        new_b.pop(f, None)
    new_a["awms_synced"] = False
    new_b["awms_synced"] = False
    # 키(철거번호)는 제자리
    new_a["old_meter_id"] = mid_a
    new_b["old_meter_id"] = mid_b

    # ── 5. 원자 교환 + audit(full 스냅샷) ────────────────────────────────────────
    try:
        rl_ref.update({mid_a: new_a, mid_b: new_b})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"스왑 쓰기 실패: {e}")

    now_kst = datetime.now(KST)
    audit_key = None
    with _PHOTO_CACHE_LOCK:
        _PHOTO_CACHE.clear()   # 쓰기 반영 위해 결과 캐시 무효화
        _WS_RAW_CACHE.clear()  # raw 트리 캐시도 무효화(stale 방지)
    audit_saved = False
    try:
        ref = fb_db.reference("admin_validate/audit", app=fa_app).push({
            "ts": now_kst.isoformat(), "action": "swap", "actor": req.actor,
            "addr": addr, "mid_a": mid_a, "mid_b": mid_b,
            "field": "(스왑 교정)", "dataset": req.dataset,
            "snapshot_a": rec_a, "snapshot_b": rec_b,   # 스왑 전 full 레코드 (되돌리기용)
        })
        audit_key = ref.key
        audit_saved = True
    except Exception as e:
        print(f"[swap] audit 저장 실패: {e}", flush=True)

    return {
        "swapped": True, "audit_saved": audit_saved, "audit_key": audit_key,
        "addr": addr, "mid_a": mid_a, "mid_b": mid_b,
        "awms_resync_needed": bool(rec_a.get("awms_synced") or rec_b.get("awms_synced")),
        "actor": req.actor, "ts": now_kst.isoformat(),
    }


# ── 10c-2. POST /set_validated (검증완료 플래그 — awms 큐 자격) ─────────────────────
class SetValidatedRequest(BaseModel):
    dataset: str
    mids: list           # 철거계기번호 목록 (그 범위/배치)
    actor: str
    validated: bool = True


@app.post("/set_validated")
def post_set_validated(req: SetValidatedRequest):
    """
    검증완료 플래그를 종로 DB 레코드에 건별로 기록/해제.
    workStatus/jongno/{addr}/replacement_list/{mid}/ 에 validated/validated_at/validated_by.
    (나중에 계기큐가 validated=true 인 것만 awms 큐로 올림. 게이트는 계기큐 쪽 별도 작업.)

    - mids: 검증완료 처리할 철거계기번호 목록 (프론트가 범위 1~30의 mid들을 모아 전달).
    - validated=false면 플래그 해제.
    - live 조회 후 주소별로 묶어 atomic update. audit action='validate'.
    """
    if not req.mids:
        raise HTTPException(status_code=400, detail="mids 비어있음")
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(req.dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")
    if not rtdb_base:
        raise HTTPException(status_code=500, detail="dataset에 rtdb_review_url 없음")

    mid_set = {str(m).strip() for m in req.mids if str(m).strip()}
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_apply_app():
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None and existing.options and existing.options.get("databaseURL"):
                return existing
            for nm in ("admin_verdict", "admin_apply"):
                named = firebase_admin._apps.get(nm)
                if named is not None:
                    return named
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(cred, {"databaseURL": rtdb_base}, name="admin_apply")

        fa_app = _get_apply_app()
        ws_ref = fb_db.reference(ds.get("ws_path","workStatus/jongno"), app=fa_app)
        raw = ws_ref.get() or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 실패: {e}")

    now_kst = datetime.now(KST)
    ts_iso = now_kst.isoformat()
    updated = []
    # 주소별 묶어 atomic update
    _work_daykey = ""   # 변경이력 작업일 (레코드 replaced_at KST)
    for addr, av in raw.items():
        if not isinstance(av, dict):
            continue
        rl = av.get("replacement_list") or {}
        patch = {}
        for mid in rl:
            if str(mid).strip() in mid_set:
                if req.validated:
                    patch[f"{mid}/validated"] = True
                    patch[f"{mid}/validated_at"] = int(now_kst.timestamp() * 1000)
                    patch[f"{mid}/validated_by"] = req.actor
                else:
                    patch[f"{mid}/validated"] = False
                updated.append(str(mid))
                if not _work_daykey:
                    _work_daykey = _daykey_from_rec(rl.get(mid))
        if patch:
            try:
                ws_ref.child(addr).child("replacement_list").update(patch)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"쓰기 실패({addr}): {e}")

    # audit
    try:
        fb_db.reference("admin_validate/audit", app=fa_app).push({
            "ts": ts_iso, "action": "validate", "actor": req.actor,
            "field": "(검증완료)", "dataset": req.dataset,
            "validated": req.validated, "count": len(updated),
            "mids": updated[:200], "work_date": _work_daykey,
        })
    except Exception as e:
        print(f"[set_validated] audit 실패: {e}", flush=True)

    with _PHOTO_CACHE_LOCK:           # 쓰기 반영 위해 결과 캐시 무효화
        _PHOTO_CACHE.clear()
        _WS_RAW_CACHE.clear()  # raw 트리 캐시도 무효화(stale 방지)

    not_found = sorted(mid_set - set(updated))
    return {
        "ok": True, "validated": req.validated,
        "updated_count": len(updated), "updated": updated,
        "not_found": not_found, "actor": req.actor, "ts": ts_iso,
    }


def _daykey_from_rec(rec):
    """레코드 replaced_at(ms) → KST 작업일 YYYYMMDD. 없으면 빈문자열."""
    try:
        ra = (rec or {}).get("replaced_at")
        if ra:
            return datetime.fromtimestamp(int(ra) / 1000, KST).strftime("%Y%m%d")
    except Exception:
        pass
    return ""


class ResetDryrunRequest(BaseModel):
    dataset: str


@app.post("/reset_dryrun")
def post_reset_dryrun(req: ResetDryrunRequest):
    """
    드라이런(샌드박스) 초기화 — 데이터셋 전체의 검증완료 플래그(validated/validated_at/validated_by) 일괄 삭제.
    ★안전장치: ws_path에 'dryrun'이 포함된 데이터셋만 허용 (prod 종로는 절대 안 지움).
    """
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(req.dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")
    ws_path = ds.get("ws_path", "workStatus/jongno")
    if "dryrun" not in ws_path:
        raise HTTPException(status_code=403, detail=f"드라이런 전용 — '{ws_path}'는 초기화 불가(prod 보호)")
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")

    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_app():
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None and existing.options and existing.options.get("databaseURL"):
                return existing
            for nm in ("admin_verdict", "admin_apply"):
                named = firebase_admin._apps.get(nm)
                if named is not None:
                    return named
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(cred, {"databaseURL": rtdb_base}, name="admin_apply")

        fa_app = _get_app()
        ws_ref = fb_db.reference(ws_path, app=fa_app)
        raw = ws_ref.get() or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 실패: {e}")

    cleared = 0
    for addr, av in raw.items():
        if not isinstance(av, dict):
            continue
        rl = av.get("replacement_list") or {}
        patch = {}
        for mid, r in rl.items():
            if not isinstance(r, dict):
                continue
            if "validated" in r or "validated_at" in r or "validated_by" in r:
                patch[f"{mid}/validated"] = None
                patch[f"{mid}/validated_at"] = None
                patch[f"{mid}/validated_by"] = None
                cleared += 1
        if patch:
            try:
                ws_ref.child(addr).child("replacement_list").update(patch)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"쓰기 실패({addr}): {e}")

    # OCR 결과 CSV도 비움 → 검증상태(자동통과/확인필요)까지 전부 미검증으로 되돌림
    csv_removed = 0
    csv_dir = ds.get("csv_dir", "")
    if csv_dir:
        for fn in ("daily_state.csv", "daily_meterid.csv", "daily_removal_meterid.csv"):
            p = Path(csv_dir) / fn
            try:
                if p.exists():
                    p.unlink()
                    csv_removed += 1
            except Exception as e:
                print(f"[reset_dryrun] CSV 삭제 실패 {p}: {e}", flush=True)

    with _PHOTO_CACHE_LOCK:
        _PHOTO_CACHE.clear()
        _WS_RAW_CACHE.clear()  # raw 트리 캐시도 무효화(stale 방지)
    return {"ok": True, "cleared": cleared, "csv_removed": csv_removed, "ws_path": ws_path}


# ── 10d. GET /stats (공사 진행도·권역·단상삼상·기간별) ──────────────────────────────
@app.get("/stats")
def get_stats(
    dataset: str        = Query(default="jongno", description="dataset id"),
    exclude_groups: str = Query(default="", description="진행도 분모에서 뺄 동그룹(콤마구분). 중구는 종로 준공리스트에 없어 자동 제외."),
):
    """
    공사 진행도 통계. 분모 = site-data(준공리스트) 전체, exclude_groups 동그룹 제외(중구는 site-data에 없어 자동제외).
    완료 = 해당 계기번호로 workStatus/jongno에 작업기록(new_meter_id 있음)이 존재.

    반환:
      total_target/total_done/total_remain/rate,
      by_region: [{region, target, done, remain, rate, 단상_t,단상_d, 삼상_t,삼상_d}]  (동그룹별),
      by_phase: {단상:{target,done}, 삼상:{target,done}},
      by_day:   [{date(YYYYMMDD), count}]  (in-scope 완료 일별, 오름차순) — 주/월 집계는 프론트에서.
    """
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")
    excluded = {g.strip() for g in exclude_groups.split(",") if g.strip()}

    site_idx = _load_site_index(dataset)
    if not site_idx:
        raise HTTPException(status_code=500, detail="site-data 없음")

    # ── workStatus 읽어 '작업된 철거번호' 집합 + 작업일시 ────────────────────────
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")
    worked: Dict[str, Any] = {}   # 철거번호 → replaced_at(ms)
    failed_set: set = set()       # 철거번호 → 개별불가(failedMeters) 표시
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_stats_app():
            for nm in ("photo_reader", "admin_apply", "admin_verdict"):
                ex = firebase_admin._apps.get(nm)
                if ex is not None:
                    return ex
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None and existing.options and existing.options.get("databaseURL"):
                return existing
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(cred, {"databaseURL": rtdb_base}, name="photo_reader")

        fa_app = _get_stats_app()
        raw = fb_db.reference(ds.get("ws_path","workStatus/jongno"), app=fa_app).get() or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"workStatus 조회 실패: {e}")

    junggu_worked_addrs: set = set()   # meter_updatedByName='중구작업' 표시 주소(중구가 직접 작업)
    for addr, av in raw.items():
        if not isinstance(av, dict):
            continue
        if "중구" in str(av.get("meter_updatedByName", "")):
            junggu_worked_addrs.add(addr.strip())
        for mid, rec in (av.get("replacement_list") or {}).items():
            if isinstance(rec, dict) and rec.get("new_meter_id"):
                worked[str(mid)] = rec.get("replaced_at")
        # 개별불가(failedMeters) — 완료율(진행률) 분자에만 포함, 교체건수엔 미포함
        for fmid in (av.get("failedMeters") or {}).keys():
            failed_set.add(str(fmid))

    # ── 집계 ──────────────────────────────────────────────────────────────────────
    KST = timezone(timedelta(hours=9))
    regions: Dict[str, dict] = {}
    by_phase = {"단상": {"target": 0, "done": 0}, "삼상": {"target": 0, "done": 0}}
    day_counts: Dict[str, int] = {}
    total_t = total_d = 0
    total_failed = total_resolved = 0   # 불가건수 / 해결(교체+불가)건수 — 완료율용

    junggu_set = _load_junggu_exclude(dataset)   # 명륜 중구팀 배정분
    for mid, rec in site_idx.items():
        grp = rec.get("동그룹") or "(미분류)"
        if grp in excluded:
            continue
        if mid in junggu_set:        # 명륜 중구팀 배정분 제외(동행시공 중구 몫)
            continue
        if str(rec.get("주소", "")).strip() in junggu_worked_addrs:  # 중구가 직접 작업표시한 주소 제외
            continue
        ph = _phase_of_site(rec)
        done = mid in worked
        # 해결 = 교체완료 OR 개별불가(완료율 분자에만 포함, 교체건수엔 미포함)
        resolved = done or (mid in failed_set)
        R = regions.setdefault(grp, {"region": grp, "target": 0, "done": 0, "resolved": 0,
                                     "단상_t": 0, "단상_d": 0, "삼상_t": 0, "삼상_d": 0})
        R["target"] += 1
        total_t += 1
        if ph in ("단상", "삼상"):
            R[ph + "_t"] += 1
            by_phase[ph]["target"] += 1
        if resolved:
            R["resolved"] += 1
            total_resolved += 1
            if not done:
                total_failed += 1
        if done:
            R["done"] += 1
            total_d += 1
            if ph in ("단상", "삼상"):
                R[ph + "_d"] += 1
                by_phase[ph]["done"] += 1
            ra = worked.get(mid)
            if ra:
                try:
                    dk = datetime.fromtimestamp(int(ra) / 1000, KST).strftime("%Y%m%d")
                    day_counts[dk] = day_counts.get(dk, 0) + 1
                except Exception:
                    pass

    region_list = sorted(regions.values(), key=lambda r: r["target"], reverse=True)
    for r in region_list:
        r["remain"] = r["target"] - r["done"]
        r["rate"] = round(r["done"] / r["target"] * 100, 1) if r["target"] else 0.0
        r.setdefault("resolved", 0)
        # 완료율 = (교체+불가)/대상 — 불가 포함
        r["resolved_rate"] = round(r["resolved"] / r["target"] * 100, 1) if r["target"] else 0.0

    by_day = [{"date": d, "count": c} for d, c in sorted(day_counts.items())]

    return {
        "dataset": dataset,
        "excluded_groups": sorted(excluded),
        "total_target": total_t,
        "total_done": total_d,
        "total_remain": total_t - total_d,
        "rate": round(total_d / total_t * 100, 1) if total_t else 0.0,
        # 완료율(불가 포함) — 교체건수(total_done)는 순수 교체 그대로
        "total_failed": total_failed,
        "total_resolved": total_resolved,
        "resolved_rate": round(total_resolved / total_t * 100, 1) if total_t else 0.0,
        "by_region": region_list,
        "by_phase": by_phase,
        "by_day": by_day,
    }


# ── 10e. GET /daily_stats (날짜별: 총작업·단상·삼상·추가계기·앱작성완료) ───────────
# 종로맵 통계모달과 동일 정의: 작업=replaced_at, 단상삼상=신설계기 phaseOf,
#   추가계기=added_meters.added_at, 앱작성완료=ami-work awmsDoneMeters에 계기번호 포함.
_AWMS_DONE_URL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app/awmsDoneMeters.json"
_AWMS_DONE_CACHE: Dict[str, Any] = {"set": None, "at": 0.0}
_AWMS_DONE_TTL = 300.0


def _phase_of_mid(mid: Any) -> str:
    """계기번호 3~4자리로 단상/삼상 (종로 phaseOf와 동일)."""
    s = str(mid or "")
    code = s[2:4] if len(s) >= 4 else ""
    if code in {"17", "19", "25", "26", "27", "53"}:
        return "단상"
    if code in {"45", "46", "47", "55"}:
        return "삼상"
    return "미상"


def _load_awms_done() -> set:
    """ami-work RTDB awmsDoneMeters(계기큐 awms등록 완료 계기번호 집합) 캐시 로드. 실패 시 빈 set."""
    now = time.monotonic()
    if _AWMS_DONE_CACHE["set"] is not None and (now - _AWMS_DONE_CACHE["at"]) < _AWMS_DONE_TTL:
        return _AWMS_DONE_CACHE["set"]
    s: set = set()
    try:
        import urllib.request
        with urllib.request.urlopen(_AWMS_DONE_URL, timeout=10) as r:
            data = json.loads(r.read().decode())
        if isinstance(data, dict):
            for k, v in data.items():
                # {계기번호: true} 또는 {push: 계기번호} 양쪽 방어
                if v is True or v == 1:
                    s.add(str(k).strip())
                elif isinstance(v, str):
                    s.add(v.strip())
                else:
                    s.add(str(k).strip())
        elif isinstance(data, list):
            for v in data:
                if v:
                    s.add(str(v).strip())
    except Exception as e:
        print(f"[awmsDone] 로드 실패: {e}", flush=True)
    _AWMS_DONE_CACHE["set"] = s
    _AWMS_DONE_CACHE["at"] = now
    return s


@app.get("/daily_stats")
def get_daily_stats(
    dataset: str = Query(default="jongno", description="dataset id"),
    days: int    = Query(default=60, description="최근 N일만 (0=전체)"),
):
    """날짜별 작업 통계: [{date, total, 단상, 삼상, 추가계기, 앱작성완료}] 최신순."""
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")

    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_app():
            for nm in ("photo_reader", "admin_apply", "admin_verdict"):
                ex = firebase_admin._apps.get(nm)
                if ex is not None:
                    return ex
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None and existing.options and existing.options.get("databaseURL"):
                return existing
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(cred, {"databaseURL": rtdb_base}, name="photo_reader")

        raw = fb_db.reference(ds.get("ws_path","workStatus/jongno"), app=_get_app()).get() or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"workStatus 조회 실패: {e}")

    awms_done = _load_awms_done()
    junggu_set = _load_junggu_exclude(dataset)   # 명륜 중구팀 제외
    KST = timezone(timedelta(hours=9))

    def _dk(ms):
        try:
            return datetime.fromtimestamp(int(ms) / 1000, KST).strftime("%Y%m%d")
        except Exception:
            return None

    agg: Dict[str, dict] = {}

    def _row(dk):
        return agg.setdefault(dk, {"date": dk, "total": 0, "단상": 0, "삼상": 0,
                                   "추가계기": 0, "앱작성완료": 0})

    for addr, av in raw.items():
        if not isinstance(av, dict):
            continue
        addr_is_junggu = "중구" in str(av.get("meter_updatedByName", ""))  # 중구가 직접 작업표시한 주소
        for mid, rec in (av.get("replacement_list") or {}).items():
            if not isinstance(rec, dict):
                continue
            if str(mid).strip() in junggu_set or addr_is_junggu:   # 명륜 중구팀 배정분/중구작업 주소 제외
                continue
            ra = rec.get("replaced_at")
            dk = _dk(ra)
            if not dk:
                continue
            r = _row(dk)
            r["total"] += 1
            ph = _phase_of_mid(rec.get("new_meter_id") or mid)
            if ph in ("단상", "삼상"):
                r[ph] += 1
            new_id = str(rec.get("new_meter_id") or "").strip()
            old_id = str(mid).strip()
            if (new_id and new_id in awms_done) or (old_id in awms_done):
                r["앱작성완료"] += 1
        # 추가계기 (added_meters.added_at)
        for amid, a in (av.get("added_meters") or {}).items():
            if not isinstance(a, dict):
                continue
            dk = _dk(a.get("added_at"))
            if not dk:
                continue
            _row(dk)["추가계기"] += 1

    rows = sorted(agg.values(), key=lambda x: x["date"], reverse=True)
    if days and days > 0:
        rows = rows[:days]
    return {"dataset": dataset, "by_date": rows}


# ── 10f. GET /lcd_crop (검증 때 서버가 YOLO 크롭한 LCD 이미지 서빙) ──────────────────
@app.get("/lcd_crop")
def get_lcd_crop(ts: str = Query(..., description="meter_values 행의 ts (YYYYMMDD_HHMMSS_fid)")):
    """daily_cycle이 검증 때 /tmp/daily_cycle/{ts}_lcd.jpg 로 만든 LCD 크롭을 서빙 (need_human 확대용)."""
    import re
    if not re.match(r'^[0-9A-Za-z_]+$', ts):   # 경로 traversal 방지
        raise HTTPException(status_code=400, detail="잘못된 ts")
    path = daily_cycle.TMP / f"{ts}_lcd.jpg"
    if not path.exists():
        raise HTTPException(status_code=404, detail="크롭 없음")
    return FileResponse(str(path), media_type="image/jpeg")


# ── 11. GET /search ──────────────────────────────────────────────────────────────
_SEARCH_LIMIT = 200


@app.get("/search")
def get_search(
    dataset: str = Query(default="jongno", description="dataset id"),
    q: str       = Query(...,              description="계기번호(old/new) 또는 고객번호 부분 일치"),
):
    """
    계기번호(old/new) · 고객번호를 전체(모든 날짜) workStatus/jongno에서 검색한다.

    - 부분 일치(숫자 substring). 고객번호는 하이픈 제거 후 비교.
    - 각 매칭 건마다 반환: {mid, date(YYYYMMDD KST), addr, matched_field, value}
    - 결과 상한 200건 + 초과 시 truncated: true.
    - siteData 인덱스(캐시)로 고객번호 조인.
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    q_clean = str(q).strip()
    if not q_clean:
        raise HTTPException(status_code=400, detail="q(검색어) 빈값 불가")

    # 고객번호 비교용: 하이픈 제거
    q_no_hyphen = q_clean.replace("-", "")

    # workStatus/jongno 전체 조회 (fresh, 날짜 미지정)
    ds = cfg.get("datasets", {}).get(dataset, {})
    cred_path = ds.get("cred", "")
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    if not rtdb_base:
        raise HTTPException(status_code=500, detail="dataset에 rtdb_review_url 없음")

    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_search_app():
            named = firebase_admin._apps.get("admin_apply")
            if named is not None:
                return named
            named_v = firebase_admin._apps.get("admin_verdict")
            if named_v is not None:
                return named_v
            existing = firebase_admin._apps.get("[DEFAULT]")
            if existing is not None:
                opts = existing.options
                if opts and opts.get("databaseURL"):
                    return existing
            named_new = firebase_admin._apps.get("admin_search")
            if named_new is not None:
                return named_new
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(
                cred,
                {"databaseURL": rtdb_base},
                name="admin_search",
            )

        fa_app = _get_search_app()
        ws_ref = fb_db.reference(ds.get("ws_path","workStatus/jongno"), app=fa_app)
        raw = ws_ref.get()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 조회 실패: {e}")

    if not isinstance(raw, dict):
        return {"dataset": dataset, "q": q_clean, "results": [], "truncated": False}

    # siteData 인덱스 (캐시) — 고객번호 조인용
    site_idx = _load_site_index(dataset)

    hits: list = []
    truncated = False

    for addr, addr_val in raw.items():
        if not isinstance(addr_val, dict):
            continue
        for mid, rec in (addr_val.get("replacement_list") or {}).items():
            if not isinstance(rec, dict):
                continue
            ra = rec.get("replaced_at")
            date_kst = (
                datetime.fromtimestamp(ra / 1000, KST).strftime("%Y%m%d")
                if ra else ""
            )

            # 매칭 대상 필드 목록 구성 (field_name, value_str)
            candidates: list = []

            # 철거계기번호 (replacement_list 키 = mid)
            candidates.append(("old_meter_id", str(mid)))

            # 신설계기번호
            new_mid = str(rec.get("new_meter_id", "")).strip()
            if new_mid:
                candidates.append(("new_meter_id", new_mid))

            # 고객번호 (siteData 조인)
            cust_no = _get_cust_no(site_idx, mid)
            if cust_no:
                candidates.append(("cust_no", cust_no))

            for matched_field, value in candidates:
                # 고객번호는 하이픈 제거 후 비교
                cmp_val = value.replace("-", "") if matched_field == "cust_no" else value
                if q_clean in cmp_val or q_no_hyphen in cmp_val:
                    hits.append({
                        "mid":           mid,
                        "date":          date_kst,
                        "addr":          addr,
                        "matched_field": matched_field,
                        "value":         value,
                    })
                    if len(hits) >= _SEARCH_LIMIT:
                        truncated = True
                        break
            if truncated:
                break
        if truncated:
            break

    return {
        "dataset":   dataset,
        "q":         q_clean,
        "results":   hits,
        "count":     len(hits),
        "truncated": truncated,
    }


# ── 12. GET /report ───────────────────────────────────────────────────────────────
# status 분류 라벨 (화면 용어 매핑)
_STATUS_LABEL = {
    "auto":        "자동통과",
    "need_human":  "확인필요",
    "human":       "확인완료",
    "human_skip":  "확인완료",   # human_skip도 사람이 완료한 것으로 통합
    "swap_suspect": "정합성의심",
    "no_photo":    "사진없음",
    "dl_err":      "다운로드오류",
    "google":      "자동통과(Google)",
    "pass2":       "자동통과(2차)",
    # crop_fail(크롭 실패 — 원본은 있으나 LCD 크롭 실패). 판정 대기로 승격(2026-07-21 검증팀).
    "no_crop":     "크롭실패",
    "crop_err":    "크롭오류",
    "bad_ratio":   "크롭비율이상",
}

# status → 분류 그룹 (집계용)
def _status_group(status: str) -> str:
    """status → 보고 집계 그룹 이름."""
    # 2차 자동통과(google=구글 명판확인, pass2=검침값 2차해소)도 자동통과로 합산
    if status in ("auto", "google", "pass2"):
        return "자동통과"
    if status in ("human", "human_skip"):
        return "확인완료"
    # crop_fail(no_crop/crop_err/bad_ratio)도 확인필요로 승격(2026-07-21 검증팀):
    #   원본은 있으나 LCD 크롭 실패 → 자동 OCR 불가 → 사람이 원본 보고 판정해야 정답(final) 확정.
    #   승격 안 하면 raw 그룹으로 떨어져 판정 대기열에 안 떠 방치 → crop_fail 학습표본의 정답이 영영 미확정.
    #   no_photo는 원본조차 없어 판정 불가 → OCR미판독 유지(승격 제외).
    if status in ("need_human", "need_sonnet", "worker_missing", "no_crop", "crop_err", "bad_ratio"):
        return "확인필요"
    if status == "swap_suspect":
        return "정합성의심"
    if status in ("no_photo", "dl_err"):
        return "OCR미판독"
    return status  # 알 수 없는 상태는 raw 값으로


@app.get("/report")
def get_report(
    dataset: str = Query(default="jongno", description="dataset id"),
    date: str    = Query(...,              description="YYYYMMDD"),
):
    """
    그날 검증 결과를 status별 카운트 + 건 리스트로 집계해 반환 (JSON만, 엑셀 생성 없음).

    분류:
      자동통과   — status: auto / google
      확인완료   — status: human / human_skip
      확인필요   — status: need_human
      정합성의심 — status: swap_suspect
      OCR미판독  — status: no_photo / dl_err

    각 분류에 건 리스트 포함: {mid, matched_field(fid/tracker), value, status}
    트랙별(meter_values/meter_ids/removal_ids) 및 전체 집계 모두 반환.
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    try:
        datetime.strptime(date, "%Y%m%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date는 YYYYMMDD 형식")

    results = daily_cycle.get_results(date, out_dir=_dataset_ocr_ctx(dataset)[1])

    def _classify_rows(rows: list, track: str) -> dict:
        """
        rows(CSV 행 목록)를 status별로 분류·집계.
        반환: {group_name: {count: int, items: [{mid, field, worker_val, status}]}, ...}
        """
        groups: Dict[str, dict] = {}
        for row in rows:
            status = str(row.get("status", "")).strip()
            group  = _status_group(status)
            if group not in groups:
                groups[group] = {"count": 0, "items": []}
            groups[group]["count"] += 1
            item: Dict[str, Any] = {
                "mid":        str(row.get("mid", "")),
                "status":     status,
                "status_label": _STATUS_LABEL.get(status, status),
                "track":      track,
            }
            # 트랙별 식별 필드 추가
            if track == "meter_values":
                item["fid"]        = str(row.get("fid", ""))
                item["worker_val"] = str(row.get("worker_val", ""))
                item["final"]      = str(row.get("final", ""))
            elif track == "meter_ids":
                item["new_meter_id"]  = str(row.get("new_meter_id", ""))
                item["vision_result"] = str(row.get("vision_result", ""))
            elif track == "removal_ids":
                item["old_meter_id"]  = str(row.get("old_meter_id", ""))
                item["vision_result"] = str(row.get("vision_result", ""))
            groups[group]["items"].append(item)
        return groups

    mv_groups = _classify_rows(results.get("meter_values", []),  "meter_values")
    mi_groups = _classify_rows(results.get("meter_ids", []),     "meter_ids")
    ri_groups = _classify_rows(results.get("removal_ids", []),   "removal_ids")

    # 전체 합산 카운트
    all_groups: Dict[str, dict] = {}
    for g_map in (mv_groups, mi_groups, ri_groups):
        for gname, gdata in g_map.items():
            if gname not in all_groups:
                all_groups[gname] = {"count": 0, "items": []}
            all_groups[gname]["count"]  += gdata["count"]
            all_groups[gname]["items"]  += gdata["items"]

    total = sum(g["count"] for g in all_groups.values())

    return {
        "dataset":      dataset,
        "date":         date,
        "total":        total,
        "summary":      {k: v["count"] for k, v in all_groups.items()},
        "by_track": {
            "meter_values":  {"total": len(results.get("meter_values", [])),  "groups": mv_groups},
            "meter_ids":     {"total": len(results.get("meter_ids", [])),     "groups": mi_groups},
            "removal_ids":   {"total": len(results.get("removal_ids", [])),   "groups": ri_groups},
        },
        "all_groups":   all_groups,
    }


# ── 13. GET /audit ────────────────────────────────────────────────────────────────
@app.get("/audit")
def get_audit(
    dataset: str         = Query(default="jongno", description="dataset id"),
    date: Optional[str]  = Query(default=None,     description="YYYYMMDD (없으면 전체)"),
    scope: Optional[str] = Query(default=None,     description="day/week/month/all — date 대신 범위 지정"),
    from_date: Optional[str] = Query(default=None, description="YYYYMMDD 범위 시작 (scope 대신 직접 지정)"),
    to_date: Optional[str]   = Query(default=None, description="YYYYMMDD 범위 끝 (scope 대신 직접 지정)"),
):
    """
    /apply가 쌓는 ami-jongno RTDB admin_validate/audit/* 변경 이력을 반환.

    각 항목: {ts, actor, addr, mid, field, old, new, dataset}
    필터 우선순위: date(단일) > from_date/to_date(범위) > scope(day/week/month/all) > 전체
    결과는 최신순(ts 내림차순) 정렬.
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    if date:
        try:
            datetime.strptime(date, "%Y%m%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="date는 YYYYMMDD 형식")

    # scope/from_date/to_date → _date_range (YYYYMMDD, YYYYMMDD) 또는 None(전체)
    # date 단일이 지정된 경우는 _date_range를 사용하지 않고 기존 target_date_prefix 유지
    _date_from: Optional[str] = None
    _date_to:   Optional[str] = None

    if not date:
        now_kst = datetime.now(KST)
        if scope == "day":
            _date_from = _date_to = now_kst.strftime("%Y%m%d")
        elif scope == "week":
            week_start = now_kst - timedelta(days=now_kst.weekday())   # 이번 주 월요일
            _date_from = week_start.strftime("%Y%m%d")
            _date_to   = now_kst.strftime("%Y%m%d")
        elif scope == "month":
            _date_from = now_kst.strftime("%Y%m01")
            _date_to   = now_kst.strftime("%Y%m%d")
        elif scope == "all" or scope is None:
            pass   # 전체 — 필터 없음
        # from_date / to_date 직접 지정 (scope보다 우선)
        if from_date:
            _date_from = from_date.replace("-", "")[:8]
        if to_date:
            _date_to = to_date.replace("-", "")[:8]

    ds = cfg.get("datasets", {}).get(dataset, {})
    cred_path = ds.get("cred", "")
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    if not rtdb_base:
        raise HTTPException(status_code=500, detail="dataset에 rtdb_review_url 없음")

    # firebase app 확보 (admin_apply / admin_verdict 재사용 우선)
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds, db as fb_db

        def _get_audit_app():
            for app_name in ("admin_apply", "admin_verdict", "[DEFAULT]"):
                existing = firebase_admin._apps.get(app_name)
                if existing is not None:
                    opts = existing.options if app_name != "[DEFAULT]" else (existing.options if hasattr(existing, "options") else None)
                    if opts and opts.get("databaseURL"):
                        return existing
            named = firebase_admin._apps.get("admin_search")
            if named is not None:
                return named
            named_audit = firebase_admin._apps.get("admin_audit")
            if named_audit is not None:
                return named_audit
            if cred_path and Path(cred_path).exists():
                cred = fb_creds.Certificate(cred_path)
            else:
                cred = fb_creds.ApplicationDefault()
            return firebase_admin.initialize_app(
                cred,
                {"databaseURL": rtdb_base},
                name="admin_audit",
            )

        fa_app = _get_audit_app()
        audit_ref = fb_db.reference("admin_validate/audit", app=fa_app)
        raw = audit_ref.get()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"audit 조회 실패: {e}")

    if not isinstance(raw, dict):
        return {
            "dataset": dataset,
            "date":    date,
            "count":   0,
            "logs":    [],
        }

    # 날짜 필터 (ts의 앞 10자 = YYYY-MM-DD)
    target_date_prefix: Optional[str] = None
    if date:
        target_date_prefix = f"{date[:4]}-{date[4:6]}-{date[6:]}"  # YYYY-MM-DD

    logs: list = []
    for push_key, entry in raw.items():
        if not isinstance(entry, dict):
            continue
        # ★ dataset 필터 — 테스트DB(jongno_dryrun) 등 다른 데이터셋 판정이 섞이지 않게.
        # dataset 필드 없는 구버전 레코드는 현재 조회 dataset으로 간주(폴백).
        if (entry.get("dataset") or dataset) != dataset:
            continue
        ts_str = str(entry.get("ts", ""))
        if target_date_prefix:
            # 단일 날짜 필터: 작업일(work_date, YYYYMMDD) 우선 매칭, 없으면 변경시각(ts) 날짜로 폴백
            wd = str(entry.get("work_date", ""))
            ts_daykey = ts_str[:10].replace("-", "")
            if not (wd == date or ts_daykey == date):
                continue
        elif _date_from or _date_to:
            # 범위 필터: work_date 우선, 없으면 ts 날짜
            wd = str(entry.get("work_date", ""))
            ts_daykey = ts_str[:10].replace("-", "")
            daykey = wd if wd else ts_daykey
            if _date_from and daykey < _date_from:
                continue
            if _date_to and daykey > _date_to:
                continue
        logs.append({
            "push_key": push_key,
            "ts":       ts_str,
            "action":   entry.get("action", "apply"),  # 구버전 로그(action 없음)는 apply로 간주
            "actor":    entry.get("actor", ""),
            "addr":     entry.get("addr", ""),
            "mid":      entry.get("mid", ""),
            "field":    entry.get("field", ""),
            "old":      entry.get("old"),
            "new":      entry.get("new"),
            "ref_audit_key": entry.get("ref_audit_key"),  # rollback이 되돌린 원본 apply 키
            "dataset":  entry.get("dataset", dataset),
            "work_date": str(entry.get("work_date", "")),  # 그 계기 작업일(YYYYMMDD) — 아래서 보충
        })

    # ── 각 이력에 그 계기의 '작업일' 보충 ─────────────────────────────────
    # 이력 행 클릭 시 '판정일'이 아니라 '작업일'로 검증탭을 로드해야 그 계기 모달이 항상 뜸.
    # (검증수정 이력은 그 작업분을 검증해 생긴 것이므로 작업분은 반드시 존재)
    if any(not l["work_date"] for l in logs):
        try:
            ws_ref = fb_db.reference(ds.get("ws_path", "workStatus/jongno"), app=fa_app)
            ws = ws_ref.get() or {}
            mid2wd: Dict[str, str] = {}
            for _addr, _rec in ws.items():
                if not isinstance(_rec, dict):
                    continue
                _rl = _rec.get("replacement_list") or {}
                _items = _rl.values() if isinstance(_rl, dict) else _rl
                for _r in _items:
                    if isinstance(_r, dict):
                        _ra = _r.get("replaced_at")
                        _m = str(_r.get("old_meter_id") or "")
                        if _m and _ra:
                            mid2wd[_m] = datetime.fromtimestamp(_ra / 1000, KST).strftime("%Y%m%d")
            for l in logs:
                if not l["work_date"]:
                    l["work_date"] = mid2wd.get(str(l.get("mid", "")), "")
        except Exception as e:
            print(f"[audit] work_date 보충 실패: {e}", flush=True)

    # 최신순 정렬 (ts 내림차순)
    logs.sort(key=lambda x: x["ts"], reverse=True)

    return {
        "dataset":   dataset,
        "date":      date,
        "scope":     scope,
        "from_date": _date_from,
        "to_date":   _date_to,
        "count":     len(logs),
        "logs":      logs,
    }


# ══════════════════════════════════════════════════════════════════════════════
# awms 전송 (계기큐 맥 이식) — 전송탭
#   설계: research/admin-validation/전송탭_설계.md
#   컨트롤 = 검증관리자(맥), 실행 = 계기큐(폰) 리모컨. 여기는 봉인계산·설정·배정·진행.
#   봉인 중복방지: 진실원천 = DB 기록 최대 봉인 +1 (설정 시작값과 max 취함) → 중단/재개 안전.
# ══════════════════════════════════════════════════════════════════════════════
_TRANSMIT_CONFIG_PATH = Path(__file__).resolve().parent / "transmit_config.json"
_TRANSMIT_CFG_LOCK = threading.Lock()


def _load_transmit_config() -> dict:
    try:
        return json.loads(_TRANSMIT_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_transmit_config(cfg: dict) -> None:
    with _TRANSMIT_CFG_LOCK:
        _TRANSMIT_CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


# 삼상 판별 폴백 — 계약종별 900+ = 삼상 / 계기번호 3~4자리 45·46·47·55 = 삼상.
# (계기큐 awms-saverow.js _isThreePhase와 동일 규칙: 계약종별 우선, 없으면 계기번호)
_THREE_PHASE_METER_CODES = {"45", "46", "47", "55"}


def _is_three_phase(meter_no: str, cntr_clas_cd) -> bool:
    try:
        c = int(str(cntr_clas_cd))
        if c > 0:
            return c >= 900
    except Exception:
        pass
    s = "".join(ch for ch in str(meter_no) if ch.isdigit())
    code = s[2:4] if len(s) >= 4 else ""
    return code in _THREE_PHASE_METER_CODES


def _db_seal_max(raw: dict, account: str = "") -> tuple:
    """workStatus 전체에서 기록된 봉인번호(awms_seal.seal_no/seal_no2)의 전역 최대값+자릿수.
    ★봉인은 계정 무관 물리 시퀀스 (영준님 2026-07-17) — account 필터 없이 전역.
    반환: (max_int, max_width). 다음 봉인 = max_int + 1 (중단 후 재개해도 번호 재사용 안 함)."""
    mx, width = 0, 0
    if not isinstance(raw, dict):
        return 0, 0
    for _addr, av in raw.items():
        if not isinstance(av, dict):
            continue
        for _mid, rec in (av.get("replacement_list") or {}).items():
            if not isinstance(rec, dict):
                continue
            s = rec.get("awms_seal")
            if not isinstance(s, dict):
                continue
            for k in ("seal_no", "seal_no2"):
                v = s.get(k)
                if v is not None and str(v).isdigit():
                    mx = max(mx, int(v))
                    width = max(width, len(str(v)))
    return mx, width


def _allocate_seals(items: list, start_seal: int, width: int = 0):
    """순서대로 봉인번호 배정 (전역 시퀀스, 계정 무관). 단상 +1, 삼상 +2(연속: N, N+1).
    ★자릿수 보존: width>0이면 zfill (예: '0111111' 7자리). items=[{mid, three}].
    반환: ({mid: {seal_no, seal_no2}}, next_start)"""
    cur = int(start_seal)

    def _fmt(n: int) -> str:
        return str(n).zfill(width) if width else str(n)

    out = {}
    for it in items:
        if it.get("three"):
            out[it["mid"]] = {"seal_no": _fmt(cur), "seal_no2": _fmt(cur + 1)}
            cur += 2
        else:
            out[it["mid"]] = {"seal_no": _fmt(cur), "seal_no2": ""}
            cur += 1
    return out, cur


def _resolve_account(dataset: str) -> str:
    """봉인 기록용 계정 id. 세션 rememberedId 우선, 없으면 config accounts[0].id 폴백.

    ★rememberedId는 awms 로그인 화면에서 '아이디 저장'을 켜야 생기는 쿠키라 대개 비어 있다.
      실측(2026-07-29): 아카이브 봉인기록 375건 중 367건이 account 빈값 — 누가 쓴 봉인인지
      구분이 안 됐다. 봉인은 물리 스티커라 '누가 썼는지'가 남아야 해서 config 계정으로 폴백한다.
    """
    acct = str(mtr_direct.SESSION.get("rememberedId") or "")
    if acct:
        return acct
    accs = (_load_transmit_config().get(dataset, {}) or {}).get("accounts") or []
    if accs and isinstance(accs[0], dict):
        return str(accs[0].get("id") or "")
    return ""


def _seal_state(raw: dict, t_cfg: dict) -> tuple:
    """전역 봉인 상태: (다음 시작값 int, 자릿수 width).
    시작 = max(DB 전역최대, config.seal_last) + 1. width = config.seal_width > config.seal_last 길이 > DB 기록 길이."""
    db_max, db_width = _db_seal_max(raw)
    cfg_last_s = str(t_cfg.get("seal_last") or "")
    cfg_last = int(cfg_last_s) if cfg_last_s.isdigit() else 0
    start = max(db_max, cfg_last) + 1
    width = int(t_cfg.get("seal_width") or 0) or (len(cfg_last_s) if cfg_last_s.isdigit() else 0) or db_width
    return start, width


class TransmitConfigReq(BaseModel):
    dataset: str
    cons_no: str = ""          # 등록 공사번호(차수) — 사업조회 목록에서 선택, 그대로 주입
    seal_cons_no: str = ""     # 봉인 공사번호 — 별도 선택 가능 (등록차수와 다를 수 있음)
    seal_last: str = ""        # ★전역 마지막 사용 봉인 (계정 무관 물리 시퀀스, zero-padding 원문 '0111111')
    seal_width: int = 0        # 봉인 자릿수 (0이면 seal_last 길이로 유추)
    accounts: list = []        # (구) 아이디별 시작 봉인 — 전역 시퀀스 전환으로 배정에는 미사용, 하위호환 보존


@app.get("/transmit/config")
def get_transmit_config(dataset: str = Query(...)):
    return _load_transmit_config().get(
        dataset,
        {"dataset": dataset, "cons_no": "", "seal_cons_no": "",
         "seal_last": "", "seal_width": 0, "accounts": []},
    )


@app.post("/transmit/config")
def post_transmit_config(req: TransmitConfigReq):
    cfg = _load_transmit_config()
    prev = cfg.get(req.dataset) or {}
    cfg[req.dataset] = {
        "dataset": req.dataset,
        "cons_no": req.cons_no,
        "seal_cons_no": req.seal_cons_no,
        "seal_last": req.seal_last or prev.get("seal_last", ""),
        "seal_width": req.seal_width or prev.get("seal_width", 0),
        "accounts": req.accounts,
    }
    _save_transmit_config(cfg)
    return {"ok": True, "config": cfg[req.dataset]}


# ══════════════════════════════════════════════════════════════════════════════
# 맥 세션 직접 (아미큐 패턴) — 세션 확보·확인·로그인 스냅샷
#   실행부 awms_mtr_direct 모듈. 폰은 OTP 로그인과 세션 소스로만 쓰인다.
# ══════════════════════════════════════════════════════════════════════════════

_TRANSMIT_PUSH_SECRET = "mtr-validate-2026"


class TransmitPushSessionReq(BaseModel):
    secret: str
    cookie: str = ""   # "JSESSIONID=..; rememberedId=..; XSRF-TOKEN=.." 형식
    ua: str = ""


@app.post("/transmit/push-session")
def post_transmit_push_session(req: TransmitPushSessionReq):
    """폰(무선)에서 세션쿠키 push — cst-input /api/session/push 이식."""
    if req.secret != _TRANSMIT_PUSH_SECRET:
        raise HTTPException(status_code=403, detail="secret 불일치")
    kv = {}
    for part in req.cookie.split(";"):
        if "=" in part:
            k, _, v = part.strip().partition("=")
            kv[k.strip()] = v.strip()
    js = kv.get("JSESSIONID")
    if not js:
        raise HTTPException(status_code=400, detail="cookie에 JSESSIONID 없음")

    # ★죽은(만료) 세션이 살아있는 기존 세션을 덮지 않도록: 저장 전 생존 확인.
    #   폰이 awms 로그인 만료 상태로 push하면 JSESSIONID는 존재하지만 서버측 무효.
    #   set_session(persist=False)로 메모리만 갱신 → session_alive() 판정 →
    #   죽었으면 백업으로 메모리 복원 + 디스크 미저장(기존 세션 그대로 유지).
    _backup = dict(mtr_direct.SESSION)
    mtr_direct.set_session(
        jsessionid=js,
        remembered_id=kv.get("rememberedId"),
        xsrf=kv.get("XSRF-TOKEN"),
        ua=req.ua or None,
        persist=False,
    )
    alive = mtr_direct.session_alive()
    if alive:
        mtr_direct.save_session()
        return {"ok": True, "alive": True, "saved": True, "account": kv.get("rememberedId", "")}

    mtr_direct.SESSION.clear()
    mtr_direct.SESSION.update(_backup)
    return {
        "ok": True,
        "alive": False,
        "saved": False,
        "reason": "dead session not saved (기존 세션 유지)",
        "account": kv.get("rememberedId", ""),
    }


@app.get("/transmit/pull-session")
def get_transmit_pull_session():
    """USB: adb CDP로 폰 계기큐 awms 세션쿠키 추출 → 맥 SESSION 보관."""
    try:
        s = mtr_direct.pull_session_from_phone()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    alive = mtr_direct.session_alive()
    return {"ok": True, "alive": alive, "account": s.get("rememberedId") or "", "ts": s.get("ts")}


@app.get("/transmit/session-direct")
def get_transmit_session_direct():
    """맥 보관 세션의 생존 확인 (awms getMainList 재조회). 폰 불필요."""
    has = bool(mtr_direct.SESSION.get("jsessionid"))
    alive = mtr_direct.session_alive() if has else False
    return {
        "ok": True,
        "has_session": has,
        "alive": alive,
        "account": mtr_direct.SESSION.get("rememberedId") or "",
        "ts": mtr_direct.SESSION.get("ts") or 0,
    }


@app.post("/transmit/login-snapshot")
def post_transmit_login_snapshot(dataset: str = Query(...), account: str = Query("")):
    """첫 로그인 직후 1회: 봉인조회(getMainList 8000)+사업조회(getBusiList) →
    transmit_config에 cons_no·계정 시작봉인 저장. 이후 전송 루프는 awms 조회 없이 이 값 사용."""
    if not mtr_direct.session_alive():
        raise HTTPException(status_code=502, detail="세션 없음/만료 — 먼저 세션을 가져오세요")
    try:
        snap = mtr_direct.fetch_login_snapshot()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"스냅샷 조회 실패: {e}")

    acct = account or (mtr_direct.SESSION.get("rememberedId") or "")
    cfg = _load_transmit_config()
    ds_cfg = cfg.get(dataset) or {"dataset": dataset, "cons_no": "", "seal_cons_no": "",
                                  "seal_last": "", "seal_width": 0, "accounts": []}
    # getMainList(8000).LV_CONS_NO = 봉인 활성차수 → seal_cons_no 기본값.
    # 등록 cons_no는 사업조회(busi_list) 드롭다운에서 사용자가 선택 (둘 다 선택 가능, 다를 수 있음).
    if snap.get("cons_no"):
        ds_cfg["seal_cons_no"] = snap["cons_no"]
        if not ds_cfg.get("cons_no"):
            ds_cfg["cons_no"] = snap["cons_no"]

    # ★봉인 = 계정 무관 전역 물리 시퀀스. awms 계정별 설정값은 서로 어긋나 있을 수 있음.
    #   시스템 기억(config.seal_last + DB 전역최대)이 진실 — awms 조회값과 비교해 불일치 알림.
    awms_seal_s = str(snap.get("seal_val") or "")          # 원문 (zero-padding 보존, 예 '0111111')
    raw = _get_ws_raw(dataset) or {}
    db_max, db_width = _db_seal_max(raw)
    sys_last_s = str(ds_cfg.get("seal_last") or "")
    sys_last = max(int(sys_last_s) if sys_last_s.isdigit() else 0, db_max)
    width = (int(ds_cfg.get("seal_width") or 0)
             or (len(awms_seal_s) if awms_seal_s.isdigit() else 0)
             or (len(sys_last_s) if sys_last_s.isdigit() else 0)
             or db_width)

    seal_mismatch = False
    if awms_seal_s.isdigit():
        if sys_last == 0:
            # 최초: awms 값을 시스템 기억의 기준으로 채택
            ds_cfg["seal_last"] = awms_seal_s
            ds_cfg["seal_width"] = width or len(awms_seal_s)
        elif int(awms_seal_s) != sys_last:
            # 이 계정 awms 설정이 시스템 기억과 어긋남 → 프론트에서 [봉인 동기화] 안내
            seal_mismatch = True
            if not ds_cfg.get("seal_width"):
                ds_cfg["seal_width"] = width
    cfg[dataset] = ds_cfg
    _save_transmit_config(cfg)

    sys_last_out = str(sys_last).zfill(width) if (sys_last and width) else (str(sys_last) if sys_last else "")
    return {
        "ok": True,
        "snapshot": snap,
        "config": ds_cfg,
        "seal_mismatch": seal_mismatch,
        "seal_awms": awms_seal_s,      # 이 계정 awms 설정값
        "seal_system": sys_last_out,   # 시스템 기억(전역 마지막 사용값)
    }


@app.post("/transmit/seal-sync")
def post_transmit_seal_sync(dataset: str = Query(...)):
    """[봉인 동기화] — 시스템 기억값(전역 마지막 사용 봉인)을 현재 세션 계정의 awms에 저장.
    다른 아이디로 로그인해 봉인 설정이 어긋났을 때 사용."""
    if not mtr_direct.session_alive():
        raise HTTPException(status_code=502, detail="세션 없음/만료")
    t_cfg = _load_transmit_config().get(dataset, {})
    raw = _get_ws_raw(dataset) or {}
    db_max, db_width = _db_seal_max(raw)
    sys_last_s = str(t_cfg.get("seal_last") or "")
    sys_last = max(int(sys_last_s) if sys_last_s.isdigit() else 0, db_max)
    if not sys_last:
        raise HTTPException(status_code=400, detail="시스템 기억 봉인값 없음 — 먼저 로그인 스냅샷 실행")
    width = int(t_cfg.get("seal_width") or 0) or (len(sys_last_s) if sys_last_s.isdigit() else 0) or db_width
    seal_s = str(sys_last).zfill(width) if width else str(sys_last)
    seal_cons_no = t_cfg.get("seal_cons_no", "") or t_cfg.get("cons_no", "")
    if not seal_cons_no:
        raise HTTPException(status_code=400, detail="봉인 공사번호(seal_cons_no) 미설정")
    res = mtr_direct.save_final_seal(seal_cons_no, seal_s)
    return {"ok": bool(res.get("ok")), "saved_seal": seal_s,
            "seal_cons_no": seal_cons_no, "status": res.get("status_code"),
            "account": mtr_direct.SESSION.get("rememberedId") or ""}


# ── POST /transmit/reset-row ──────────────────────────────────────────────────
@app.post("/transmit/reset-row")
def post_transmit_reset_row(
    dataset: str = Query(...),
    mid: str = Query(..., description="철거 계기번호"),
    apply: bool = Query(False, description="기본 dry-run. True여야 실제 삭제"),
):
    """임시저장(25) 1건 원복 — awms에서 삭제해 20(대기)으로 되돌린다.

    ★설계 기준 (영준님 확정 2026-07-29):
      - 25 = 삭제 가능. 이 이식은 25 한정이므로 원복도 **25 전용**.
      - 28 = ★삭제 불가(검침값 수정만 가능). 여기서 28이 오면 거부한다.
    기본은 dry-run이라 apply=true를 줘야 실제로 지운다.

    ※ DB(workStatus)의 awms_synced/awms_seal 흔적은 **여기서 지우지 않는다.**
      awms 삭제 후에는 DB와 awms가 어긋나므로(등록됨으로 표시되나 awms엔 없음)
      호출측이 db_hint를 보고 별도로 정리해야 한다. 되돌리기 어려운 쓰기라 의도적으로 분리했다.
    """
    if not mtr_direct.session_alive():
        raise HTTPException(status_code=502, detail="세션 없음/만료")

    res = mtr_direct.reset_row_25(mid, dry_run=not apply)

    db_hint = ""
    if apply and res.get("ok"):
        db_hint = (f"awms 삭제 완료. workStatus/{dataset}/<주소>/replacement_list/{mid} 의 "
                   f"awms_synced·awms_synced_at·awms_seal 이 남아 있으면 별도 정리 필요"
                   f"(안 지우면 '이미 등록됨'으로 재등록에서 제외될 수 있음).")

    return {**res, "dataset": dataset, "mid": mid, "db_hint": db_hint}


# ── GET /transmit/busilist ────────────────────────────────────────────────────
@app.get("/transmit/busilist")
def get_transmit_busilist(dataset: str = Query(..., description="dataset id")):
    """계기큐 컨텍스트에서 awms getBusiList 조회 → 공사목록 반환.

    CDP로 폰 계기큐 localhost 페이지에서 _awmsGet(AWMS_API + '/mobMtr1000/getBusiList?DEPT1=' + DEFAULT_AWMS.HDQR_CD)
    를 실행한다. 계기큐가 폰에서 실행 중이고 adb 연결돼 있어야 한다.

    반환: {list: [{cons_no, name, seqno}]}
      - cons_no : CONS_NO    (공사번호, 등록/전송 시 사용)
      - name    : CONS_OVVW_CTT (공사명, 드롭다운 표시용)
      - seqno   : WHM_SEQNO  (차수순번)
    """
    cfg = _load_config()
    if dataset not in cfg.get("datasets", {}):
        raise HTTPException(status_code=404, detail=f"dataset '{dataset}' 없음")

    expr = (
        "_awmsGet(AWMS_API + '/mobMtr1000/getBusiList?DEPT1=' + DEFAULT_AWMS.HDQR_CD)"
        ".then(r => JSON.stringify(r))"
    )
    result = _cdp_eval_queue(expr, await_promise=True, timeout=15)
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail=f"CDP 조회 실패: {result.get('err')}")

    raw_val = result.get("value")
    try:
        if isinstance(raw_val, str):
            items = json.loads(raw_val)
        else:
            items = raw_val
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"응답 파싱 실패: {e} / raw={raw_val!r}")

    if not isinstance(items, list):
        raise HTTPException(status_code=502, detail=f"예상치 못한 응답 형식: {type(items).__name__}")

    busi_list = [
        {
            "cons_no": str(it.get("CONS_NO", "")).strip(),
            "name": str(it.get("CONS_OVVW_CTT", "")).strip(),
            "seqno": it.get("WHM_SEQNO"),
        }
        for it in items
        if isinstance(it, dict)
    ]

    return {"list": busi_list}


class TransmitPlanReq(BaseModel):
    dataset: str
    # [{"mid", "account", "three"(opt bool), "cntr_clas_cd"(opt), "meter_no"(opt)}]
    assignments: list


@app.post("/transmit/plan")
def post_transmit_plan(req: TransmitPlanReq):
    """봉인 배정 미리보기(dry-run, 실전송 없음). ★전역 시퀀스(계정 무관 물리 봉인) —
    시작 = max(DB 전역최대, config.seal_last) + 1, 자릿수(zfill) 보존.
    프론트가 전송 전 봉인번호를 확인·검토하는 용도."""
    cfg = _load_transmit_config().get(req.dataset, {})
    raw = _get_ws_raw(req.dataset) or {}

    items = []
    for a in req.assignments:
        three = a.get("three")
        if three is None:
            three = _is_three_phase(a.get("meter_no", ""), a.get("cntr_clas_cd"))
        items.append({"mid": a["mid"], "three": bool(three)})

    start, width = _seal_state(raw, cfg)
    alloc, nxt = _allocate_seals(items, start, width)
    acct = _resolve_account(req.dataset)  # 계정 = 세션 아이디, 없으면 config 계정 폴백 (기록용)
    plan: Dict[str, dict] = {mid: {**v, "account": acct} for mid, v in alloc.items()}
    meta = {"start": start, "next_after": nxt, "count": len(items), "width": width}

    return {"dataset": req.dataset, "cons_no": cfg.get("cons_no", ""),
            "seal_cons_no": cfg.get("seal_cons_no", ""),
            "plan": plan, "accounts": {acct: meta}, "seal": meta}


# ══════════════════════════════════════════════════════════════════════════════
# awms 전송 실행 — /transmit/run + /transmit/job/{job_id}
#   STUB: 실제 awms(계기팀 mob/mtr) HTTP 호출 없음. 폰 리모컨 배선은 T11.
#   봉인 계산·Firebase DB 기록만 실수행.
# ══════════════════════════════════════════════════════════════════════════════

# 전송 잡 저장소 — 검증 잡(_JOBS/_RUNNING_JOB)과 완전 분리 (MPS 단일프로세스 게이트 불필요)
_TRANSMIT_JOBS: Dict[str, dict] = {}
_TRANSMIT_JOBS_LOCK = threading.Lock()
# 폰 계기큐 모니터(GET /monitor/active-job)가 폴링할 "최신 전송 잡" id — 조회 전용 캐시.
_LATEST_TRANSMIT_JOB_ID: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# CDP 공통 헬퍼 — 계기큐 UI(localhost/"AWMS Queue") 타깃 eval
#   _remote_register / /transmit/session / /transmit/login 에서 재사용.
#   타깃 선택 규칙: type==page AND (url에 localhost 포함 OR title=="AWMS Queue")
#                  AND awms.kdn.com 제외 — _remote_register 와 완전 동일.
# ══════════════════════════════════════════════════════════════════════════════

def _cdp_eval_queue(expr: str, *, await_promise: bool = False, timeout: int = 10) -> dict:
    """계기큐 UI(localhost) CDP Runtime.evaluate.

    반환: {ok:True, value: <returnByValue 결과>}  /  {ok:False, err: str}
    adb forward 는 호출 전 이미 설정돼 있어야 한다 (_cdp_connect_queue 에서 호출).
    내부 연결·forward 정리는 _cdp_connect_queue 가 담당.
    """
    import websocket as _ws_mod

    CDP_PORT = 9222
    PKG = "com.youngjun.awmsqueue"

    # 1) pid
    import subprocess
    try:
        r = subprocess.run(
            [mtr_direct.ADB, "shell", "pidof", PKG],
            timeout=5, capture_output=True, text=True,
        )
        pid_raw = (r.stdout or "").strip().split()
        if not pid_raw:
            return {"ok": False, "err": f"계기큐 프로세스 없음(pidof {PKG})"}
        pid = pid_raw[0].strip()
    except Exception as e:
        return {"ok": False, "err": f"pid 조회 실패: {e}"}

    # 2) 소켓명 탐색
    default_sock = f"webview_devtools_remote_{pid}"
    try:
        r2 = subprocess.run(
            [mtr_direct.ADB, "shell", "cat", "/proc/net/unix"],
            timeout=5, capture_output=True, text=True,
        )
        sock_name = default_sock
        for line in r2.stdout.splitlines():
            if f"webview_devtools_remote_{pid}" in line:
                parts = line.strip().split()
                if parts:
                    raw_name = parts[-1].lstrip("@")
                    if raw_name:
                        sock_name = raw_name
                break
    except Exception:
        sock_name = default_sock

    # 3) adb forward
    try:
        subprocess.run(
            [mtr_direct.ADB, "forward", f"tcp:{CDP_PORT}", f"localabstract:{sock_name}"],
            timeout=5, capture_output=True, check=True,
        )
    except Exception as e:
        return {"ok": False, "err": f"adb forward 실패: {e}"}

    try:
        # 4) 타깃 선택 — localhost/"AWMS Queue", awms.kdn.com 제외
        try:
            raw_json = urllib.request.urlopen(
                f"http://localhost:{CDP_PORT}/json", timeout=5
            ).read()
            targets = json.loads(raw_json)
        except Exception as e:
            return {"ok": False, "err": f"/json 조회 실패: {e}"}

        ws_url = None
        for t in targets:
            url_t = t.get("url", "")
            title_t = t.get("title", "")
            if t.get("type") == "page" and (
                "localhost" in url_t or title_t == "AWMS Queue"
            ) and "awms.kdn.com" not in url_t:
                ws_url = t.get("webSocketDebuggerUrl")
                break

        if not ws_url:
            return {
                "ok": False,
                "err": "계기큐 UI 타깃 없음 (https://localhost/ 페이지 미발견)",
                "targets": [{"url": t.get("url"), "title": t.get("title")} for t in targets],
            }

        # 5) Runtime.evaluate
        try:
            ws = _ws_mod.create_connection(
                ws_url, timeout=timeout, max_size=None, suppress_origin=True
            )
            msg = json.dumps({
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": expr,
                    "awaitPromise": await_promise,
                    "returnByValue": True,
                    "userGesture": True,
                },
            })
            ws.send(msg)
            while True:
                r_raw = json.loads(ws.recv())
                if r_raw.get("id") == 1:
                    ws.close()
                    res = r_raw.get("result", {})
                    if "exceptionDetails" in res:
                        return {"ok": False, "err": f"JS 예외: {res['exceptionDetails']}"}
                    value = res.get("result", {}).get("value")
                    return {"ok": True, "value": value}
        except Exception as e:
            return {"ok": False, "err": f"CDP eval 실패: {e}"}

    finally:
        try:
            subprocess.run(
                [mtr_direct.ADB, "forward", "--remove", f"tcp:{CDP_PORT}"],
                timeout=5, capture_output=True,
            )
        except Exception:
            pass


def _remote_register(dataset: str, mid: str, payload: dict) -> dict:
    """맥→폰 계기큐 리모컨 — CDP 배선 구현 (T11).

    기본(AWMS_LIVE_SEND != '1'): 연결검증 표현식만 실행, registerReplacement 호출 안 함.
    실등록 모드(AWMS_LIVE_SEND=1 또는 payload.get('live')): 실등록 표현식 실행.

    실제 awms(계기팀 mob/mtr) HTTP 호출은 절대 여기서 하지 않는다.
    계기큐 UI 타깃(https://localhost/, title 'AWMS Queue')에만 eval.
    """
    import subprocess
    import websocket as _ws_mod

    CDP_PORT = 9222
    PKG = "com.youngjun.awmsqueue"

    # 화면 깨우기 (freeze 방지, 실패 무시)
    try:
        subprocess.run(
            [mtr_direct.ADB, "shell", "input", "keyevent", "KEYCODE_WAKEUP"],
            timeout=5, capture_output=True,
        )
    except Exception:
        pass

    # pid 탐색
    try:
        r = subprocess.run(
            [mtr_direct.ADB, "shell", "pidof", PKG],
            timeout=5, capture_output=True, text=True,
        )
        pid_raw = (r.stdout or "").strip().split()
        if not pid_raw:
            return {"ok": False, "err": f"계기큐 프로세스 없음(pidof {PKG})"}
        pid = pid_raw[0].strip()
    except Exception as e:
        return {"ok": False, "err": f"pid 조회 실패: {e}"}

    # 소켓명 동적 탐색 (/proc/net/unix의 @ 제거)
    default_sock = f"webview_devtools_remote_{pid}"
    try:
        r2 = subprocess.run(
            [mtr_direct.ADB, "shell", "cat", "/proc/net/unix"],
            timeout=5, capture_output=True, text=True,
        )
        sock_name = default_sock
        for line in r2.stdout.splitlines():
            if f"webview_devtools_remote_{pid}" in line:
                # 마지막 필드가 소켓 경로, @ 접두사 제거
                parts = line.strip().split()
                if parts:
                    raw_name = parts[-1].lstrip("@")
                    if raw_name:
                        sock_name = raw_name
                break
    except Exception:
        sock_name = default_sock

    # adb forward 설정
    try:
        subprocess.run(
            [mtr_direct.ADB, "forward", f"tcp:{CDP_PORT}", f"localabstract:{sock_name}"],
            timeout=5, capture_output=True, check=True,
        )
    except Exception as e:
        return {"ok": False, "err": f"adb forward 실패: {e}"}

    ws_url = None
    try:
        # /json 에서 계기큐 UI 타깃 선택 (awms.kdn.com 타깃 아님)
        try:
            raw_json = urllib.request.urlopen(
                f"http://localhost:{CDP_PORT}/json", timeout=5
            ).read()
            targets = json.loads(raw_json)
        except Exception as e:
            return {"ok": False, "err": f"/json 조회 실패: {e}"}

        for t in targets:
            url_t = t.get("url", "")
            title_t = t.get("title", "")
            if t.get("type") == "page" and (
                "localhost" in url_t or title_t == "AWMS Queue"
            ) and "awms.kdn.com" not in url_t:
                ws_url = t.get("webSocketDebuggerUrl")
                break

        if not ws_url:
            return {
                "ok": False,
                "err": "계기큐 UI 타깃 없음 (https://localhost/ 페이지 미발견)",
                "targets": [{"url": t.get("url"), "title": t.get("title")} for t in targets],
            }

        # 실등록 모드 여부 — 기본 False
        live_mode = (os.environ.get("AWMS_LIVE_SEND", "") == "1") or bool(payload.get("live"))

        if live_mode:
            # 실등록 표현식 (AWMS_LIVE_SEND=1 또는 payload.live=True 일 때만)
            # ★ 폰이 Firebase _db에서 rep를 직접 읽어 사진필드(Storage URL) 그대로 사용.
            #   맥에서 사진을 주입하거나 _queue를 경유하지 않는다.
            #   (검증패턴 /tmp/live_register.py 이식 — 사진주입 3줄만 제거)
            addr_j = json.dumps(payload.get("addr", ""))
            meter_j = json.dumps(str(payload.get("mid", "")))
            account_j = json.dumps(payload.get("account", ""))
            cons_no_j = json.dumps(payload.get("cons_no", ""))
            seal_no_j = json.dumps(str(payload.get("seal_no", "")))
            seal_no2_j = json.dumps(str(payload.get("seal_no2", "")))

            # ★ 이 표현식은 코드로만 준비. 실행은 live_mode 게이트 통과 시만.
            expr = (
                "(async()=>{"
                f"const ADDR={addr_j};"
                f"const METER={meter_j};"
                f"const ACCOUNT={account_j};"
                f"const CONS_NO={cons_no_j};"
                f"const SEAL_NO={seal_no_j};"
                f"const SEAL_NO2={seal_no2_j};"
                # 폰 _db에서 rep 직접 로드 (workStatus/jongno/<addr>/replacement_list/<meter>)
                "const path='workStatus/jongno/'+ADDR+'/replacement_list/'+METER;"
                "const snap=await _db.ref(path).once('value');"
                "const rep=snap.val();"
                "if(!rep)return {ok:false,err:'rep-not-found:'+path};"
                # 사진필드는 Storage URL 그대로 (재압축 주입 없음)
                "try{"
                "const r=await registerReplacement("
                "{addr:ADDR,meter:METER,rep},"
                "{injectedSeal:{seal_no:SEAL_NO,seal_no2:SEAL_NO2},"
                "injectedConsNo:CONS_NO,injectedAccount:ACCOUNT}"
                ");"
                "return {ok:true,result:r};"
                "}catch(e){"
                "return {ok:false,err:String(e&&e.message||e)};"
                "}"
                "})()"
            )
        else:
            # 연결검증 표현식 — registerReplacement 호출 없음
            expr = (
                "JSON.stringify({"
                "rr:typeof window.registerReplacement,"
                "ro:typeof window.runOne,"
                "q:(window._queue||[]).length,"
                "url:location.href,"
                "title:document.title"
                "})"
            )

        # CDP Runtime.evaluate
        # timeout=240: live 등록은 awms 서버 왕복이 최대 수분 걸릴 수 있음
        try:
            ws = _ws_mod.create_connection(
                ws_url, timeout=240, max_size=None, suppress_origin=True
            )
            msg = json.dumps({
                "id": 1,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": expr,
                    "awaitPromise": True,
                    "returnByValue": True,
                    "userGesture": True,
                },
            })
            ws.send(msg)
            eval_result = None
            while True:
                r_raw = json.loads(ws.recv())
                if r_raw.get("id") == 1:
                    ws.close()
                    res = r_raw.get("result", {})
                    if "exceptionDetails" in res:
                        return {
                            "ok": False,
                            "err": f"JS 예외: {res['exceptionDetails']}",
                        }
                    eval_result = res.get("result", {}).get("value")
                    break
        except Exception as e:
            return {"ok": False, "err": f"CDP eval 실패: {e}"}

        if live_mode:
            # 실등록 모드: eval_result = {ok:true, result: r} or {ok:false, err:...}
            # r(registerReplacement 반환값)에서 status/"ok" or awms_seal 존재 여부로 성공 판정
            if isinstance(eval_result, dict):
                if not eval_result.get("ok"):
                    return {
                        "ok": False,
                        "err": eval_result.get("err"),
                        "live": True,
                        "raw": eval_result,
                    }
                result = eval_result.get("result") or {}
                ok = (result.get("status") == "ok") or bool(result.get("awms_seal"))
                return {
                    "ok": ok,
                    "live": True,
                    "awms_seal": result.get("awms_seal"),
                    "raw": result,
                }
            return {"ok": False, "err": f"실등록 응답 비정상: {eval_result}", "live": True}
        else:
            # 연결검증 모드: eval_result = JSON 문자열
            if isinstance(eval_result, str):
                try:
                    probe = json.loads(eval_result)
                except Exception:
                    probe = {"raw": eval_result}
            else:
                probe = eval_result or {}
            return {"ok": True, "wired": True, "probe": probe}

    finally:
        # forward 반드시 정리
        try:
            subprocess.run(
                [mtr_direct.ADB, "forward", "--remove", f"tcp:{CDP_PORT}"],
                timeout=5, capture_output=True,
            )
        except Exception:
            pass


def _get_transmit_fa_app(ds: dict):
    """전송용 Firebase 앱 핸들 획득. set_validated 패턴 재사용."""
    import firebase_admin
    from firebase_admin import credentials as fb_creds
    rtdb_base = ds.get("rtdb_review_url", "").rstrip("/")
    cred_path = ds.get("cred", "")
    existing = firebase_admin._apps.get("[DEFAULT]")
    if existing is not None and existing.options and existing.options.get("databaseURL"):
        return existing
    for nm in ("admin_verdict", "admin_apply"):
        named = firebase_admin._apps.get(nm)
        if named is not None:
            return named
    if cred_path and Path(cred_path).exists():
        cred = fb_creds.Certificate(cred_path)
    else:
        cred = fb_creds.ApplicationDefault()
    return firebase_admin.initialize_app(cred, {"databaseURL": rtdb_base}, name="admin_apply")


class TransmitRunReq(BaseModel):
    dataset: str
    # [{"mid", "addr"(opt), "account", "three"(opt bool), "meter_no"(opt), "cntr_clas_cd"(opt)}]
    assignments: list
    # rep_override: 맥이 Firebase에서 공급한 rep dict (선택적). 없으면 폰 _queue.find 경로.
    rep_override: dict | None = None
    # photo_override: {field: "data:image/jpeg;base64,..."} — 저용량 사진 주입 (선택적).
    #   field 예시: "old_meter_photo", "new_meter_photo", "removal_photos_whme_day"
    photo_override: dict | None = None
    # live: True 시 실등록 활성화 (AWMS_LIVE_SEND=1 환경변수와 동일 효과, 요청당 제어 가능)
    live: bool = False
    # exec_mode: "direct"(기본, 맥 세션 직접) / "cdp"(구 폰 리모컨 폴백)
    exec_mode: str = "direct"
    # verify: 실등록 배치 후 awms 재조회 필드대조 (P4 사후검증, direct+live에서만 동작)
    verify: bool = True


@app.post("/transmit/run")
def post_transmit_run(req: TransmitRunReq):
    """awms 전송 실행 — 백그라운드 잡. job_id 즉시 반환, GET /transmit/job/{id}로 폴링.
    실제 awms 호출 없음(STUB). 봉인 배정·Firebase DB 기록·잡 진행 로그만 실수행."""
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(req.dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")
    if not req.assignments:
        raise HTTPException(status_code=400, detail="assignments 비어있음")

    global _LATEST_TRANSMIT_JOB_ID
    job_id = str(uuid.uuid4())[:8]
    total = len(req.assignments)

    with _TRANSMIT_JOBS_LOCK:
        _LATEST_TRANSMIT_JOB_ID = job_id  # 모니터(GET /monitor/active-job)용 최신 잡 추적
        _TRANSMIT_JOBS[job_id] = {
            "status": "running",
            "total": total,
            "done": 0,
            "ok_count": 0,
            "fail_count": 0,
            "progress": 0,
            "logs": [],
            "accounts": {},
            "cons_no": "",          # 공사번호 — _run 시작 시 채움
            "seal_start": "",       # 첫 번째 계정 봉인 시작번호 (요약 표시용)
            "seal_current": "",     # 진행 중 최신 봉인번호 (완료건 기준)
            "started_at": datetime.now(KST).isoformat(),
            "finished_at": None,
        }

    def _append_log(msg_dict: dict):
        with _TRANSMIT_JOBS_LOCK:
            j = _TRANSMIT_JOBS.get(job_id)
            if j is not None:
                j["logs"].append(msg_dict)

    def _update_progress(done: int, ok: int, fail: int):
        with _TRANSMIT_JOBS_LOCK:
            j = _TRANSMIT_JOBS.get(job_id)
            if j is not None:
                j["done"] = done
                j["ok_count"] = ok
                j["fail_count"] = fail
                j["progress"] = int(done / total * 100) if total else 100

    def _update_seal_current(seal_no: str):
        """완료/검증 성공 시 현재 봉인번호 갱신 (상단 요약 표시용)."""
        if not seal_no:
            return
        with _TRANSMIT_JOBS_LOCK:
            j = _TRANSMIT_JOBS.get(job_id)
            if j is not None:
                j["seal_current"] = seal_no

    def _run():
        from firebase_admin import db as fb_db
        ok_count = 0
        fail_count = 0

        try:
            # 전송 설정 로드 (공사번호·봉인 공사번호·전역 봉인 상태)
            t_cfg = _load_transmit_config().get(req.dataset, {})
            cons_no = t_cfg.get("cons_no", "")
            seal_cons_no = t_cfg.get("seal_cons_no", "") or cons_no  # 봉인차수 별도선택, 없으면 등록차수

            # direct 모드 + 실등록이면 세션 선확인 (건별 실패 전에 잡 레벨에서 차단)
            if req.exec_mode != "cdp" and req.live and not mtr_direct.session_alive():
                raise RuntimeError("awms 세션 없음/만료 — [세션 가져오기] 후 재시도")

            # workStatus 전체 트리 — 봉인 최대값 조회 + addr 역탐색에 사용 (1회만)
            raw = _get_ws_raw(req.dataset) or {}

            # 삼상 판정 (루프 전 일괄) — ★봉인은 전역 시퀀스(계정 무관), 계정 = 세션 아이디
            _session_acct = _resolve_account(req.dataset)
            items = []
            for a in req.assignments:
                three = a.get("three")
                if three is None:
                    three = _is_three_phase(
                        a.get("meter_no", "") or "",
                        a.get("cntr_clas_cd") or 0,
                    )
                items.append({"mid": a["mid"], "three": bool(three)})

            # 전역 봉인 배정 (자릿수 zfill 보존, 단상+1/삼상+2 — DB+config는 전송 전 1회만 읽음)
            seal_start, seal_width = _seal_state(raw, t_cfg)
            alloc, seal_next_after = _allocate_seals(items, seal_start, seal_width)
            mid_seal: Dict[str, dict] = {}   # mid → {seal_no, seal_no2, account}
            for mid, seal in alloc.items():
                mid_seal[mid] = {**seal, "account": _session_acct}
            acct_meta: Dict[str, dict] = {
                (_session_acct or "세션없음"): {"start": seal_start, "next_after": seal_next_after}
            }

            with _TRANSMIT_JOBS_LOCK:
                j = _TRANSMIT_JOBS.get(job_id)
                if j is not None:
                    j["accounts"] = acct_meta
                    j["cons_no"] = cons_no
                    # 첫 번째 계정의 시작 봉인번호 (요약 표시: "봉인 <시작>~<현재>")
                    first_acct = next(iter(acct_meta), None)
                    if first_acct:
                        j["seal_start"] = str(acct_meta[first_acct]["start"])

            # addr 역탐색 인덱스: mid → addr (replacement_list 키 직접 확인)
            mid_addr_idx: Dict[str, str] = {}
            if isinstance(raw, dict):
                for addr, av in raw.items():
                    if not isinstance(av, dict):
                        continue
                    for m in (av.get("replacement_list") or {}):
                        mid_addr_idx[str(m)] = addr

            # Firebase 앱 초기화 (전송 루프 전 1회)
            fa_app = _get_transmit_fa_app(ds)
            ws_path = ds.get("ws_path", "workStatus/jongno")

            # 전송 진행 모니터 초기화 — transmit_monitor/{dataset}
            def _push_monitor(status: str, done: int, total_: int,
                               current_mid: str = "", current_seal: str = ""):
                try:
                    from firebase_admin import db as fb_db
                    fb_db.reference(f"transmit_monitor/{req.dataset}", app=fa_app).set({
                        "status": status,
                        "done": done,
                        "total": total_,
                        "current_mid": current_mid,
                        "current_seal": current_seal,
                        "ts": int(time.time() * 1000),
                    })
                except Exception as mon_err:
                    print(f"[transmit] monitor push 실패(무시): {mon_err}", flush=True)

            _push_monitor("running", 0, total)

            # P4 사후검증(필드대조) 대상 수집 (direct 실등록 성공분)
            _verify_items: list = []

            # 건별 전송 루프
            for idx, a in enumerate(req.assignments):
                mid = str(a.get("mid", "")).strip()
                now_ms = int(time.time() * 1000)
                seal = mid_seal.get(mid, {})
                acct = seal.get("account", a.get("account", ""))

                # 공통 로그 필드 — try 진입 전 미리 확보 (실패 경로에서도 사용)
                addr = str(a.get("addr", "")).strip() or mid_addr_idx.get(mid, "")
                _rep = (raw.get(addr) or {}).get("replacement_list", {}).get(mid) or {}
                _old_mid = mid
                _new_mid = str(_rep.get("new_meter_id", "") or "")
                _seq     = _rep.get("daily_seq", "")

                try:
                    # addr 확보 확인
                    if not addr:
                        raise ValueError(f"addr 역탐색 실패: mid={mid} (workStatus에 없음)")

                    # 건별 모니터 push — 현재 처리 중인 계기 번호·봉인 번호
                    _push_monitor("running", idx, total,
                                  current_mid=mid,
                                  current_seal=seal.get("seal_no", ""))

                    # 실행부 분기: direct(기본, 맥 세션 직접) / cdp(구 폰 리모컨 폴백)
                    if req.exec_mode == "cdp":
                        payload = {
                            "mid": mid,
                            "addr": addr,
                            "account": acct,
                            "cons_no": cons_no,
                            "seal_no": seal.get("seal_no", ""),
                            "seal_no2": seal.get("seal_no2", ""),
                        }
                        # rep_override/photo_override: 요청에 있으면 전달 (맥 → 폰 사진 주입 경로)
                        if req.rep_override is not None:
                            payload["rep_override"] = req.rep_override
                        if req.photo_override:
                            payload["photo_override"] = req.photo_override
                        if req.live:
                            payload["live"] = True
                        remote_result = _remote_register(req.dataset, mid, payload)
                    elif not req.live:
                        # direct 연결검증 모드: 실등록 없이 세션 생존만 확인 (wired)
                        alive = mtr_direct.session_alive()
                        remote_result = (
                            {"ok": True, "wired": True, "live": False}
                            if alive else
                            {"ok": False, "err": "awms 세션 없음/만료 (직접모드 배선검증)"}
                        )
                    else:
                        # direct 실등록: 맥이 awms mob/mtr 직접 호출 (철거→신설25→완료28+사진)
                        d = mtr_direct.register_replacement_direct({
                            "meter": mid,
                            "addr": addr,
                            "rep": req.rep_override if req.rep_override is not None else _rep,
                            "injected": {
                                "seal_no": seal.get("seal_no", ""),
                                "seal_no2": seal.get("seal_no2", ""),
                                "cons_no": cons_no,
                                "account": acct,
                            },
                            # ★영준님 방침(2026-07-20): 완료(28) 절대 금지 — 임시저장(25)까지만.
                            #   하드코딩 True. 완료가 필요하면 이 코드를 명시적으로 바꿀 것.
                            "no_complete": True,
                        })
                        remote_result = {
                            "ok": d.get("ok"),
                            "live": True,
                            "awms_seal": d.get("awms_seal"),
                            "err": d.get("err"),
                            "raw": d,
                        }
                        # 사후검증(P4)용 컨텍스트 수집
                        if d.get("ok"):
                            _verify_items.append({
                                "meter": mid,
                                "new_meter_id": _new_mid,
                                "cons_no": d.get("consNo") or cons_no,
                                "cntr_no": d.get("cntrNo") or "",
                                "cons_tgt_seqno": d.get("consTgtSeqno") or "",
                                "expect": {
                                    "seal_no": seal.get("seal_no", ""),
                                    "seal_no2": seal.get("seal_no2", ""),
                                    "removal_values": _rep.get("removal_values") or {},
                                    "mfg_ym": _rep.get("new_meter_mfg_ym") or "",
                                    # 임시저장(25) 전용이므로 검증도 25 기대
                                    "work_step": "25",
                                },
                            })
                        # 모듈 상세로그 → 잡 로그에 병기 (건별 1줄, 28 미달 경고 포함)
                        _append_log({
                            "ts": now_ms, "mid": _old_mid, "account": acct,
                            "seal": seal.get("seal_no", ""), "ok": bool(d.get("ok")),
                            "seq": _seq, "old_mid": _old_mid, "new_mid": _new_mid,
                            "phase": "상세",
                            "msg": " | ".join((d.get("log") or [])[-6:]),
                        })

                    if not remote_result.get("ok"):
                        raise ValueError(f"리모컨 전송 실패: {remote_result}")

                    # 연결검증 모드(wired-only, 실등록 아님): awms에 실제 등록 안 됨 →
                    # DB에 awms_synced=True(전송완료) 기록 금지. 실전송은 AWMS_LIVE_SEND=1(live) 필요.
                    if remote_result.get("wired") and not remote_result.get("live"):
                        ok_count += 1
                        _append_log({
                            "ts": now_ms, "mid": _old_mid, "account": acct,
                            "seal": seal.get("seal_no", ""), "ok": True,
                            "seq": _seq, "old_mid": _old_mid, "new_mid": _new_mid,
                            "phase": "검증",
                            "msg": "배선검증 OK(실전송 아님, AWMS_LIVE_SEND=1 필요)",
                        })
                        _update_seal_current(seal.get("seal_no", ""))
                        _update_progress(idx + 1, ok_count, fail_count)
                        continue

                    # Firebase DB 기록 — replacement_list/{mid} 에 awms_seal + awms_synced 머지 (실등록 성공분만)
                    rl_ref = fb_db.reference(ws_path, app=fa_app) \
                        .child(addr).child("replacement_list").child(mid)
                    rl_ref.update({
                        "awms_seal": {
                            "account": acct,
                            "seal_no": seal.get("seal_no", ""),
                            "seal_no2": seal.get("seal_no2", ""),
                            "cons_no": cons_no,
                        },
                        "awms_synced": True,
                        "awms_synced_at": now_ms,
                    })

                    ok_count += 1
                    _append_log({
                        "ts": now_ms, "mid": _old_mid, "account": acct,
                        "seal": seal.get("seal_no", ""), "ok": True,
                        "seq": _seq, "old_mid": _old_mid, "new_mid": _new_mid,
                        "phase": "완료",
                        "msg": f"전송완료 seal={seal.get('seal_no','')} addr={addr}",
                    })
                    _update_seal_current(seal.get("seal_no", ""))

                except Exception as item_err:
                    fail_count += 1
                    _append_log({
                        "ts": int(time.time() * 1000), "mid": _old_mid, "account": acct,
                        "seal": seal.get("seal_no", ""), "ok": False,
                        "seq": _seq, "old_mid": _old_mid, "new_mid": _new_mid,
                        "phase": "실패", "reason": str(item_err),
                        "msg": str(item_err),
                    })

                _update_progress(idx + 1, ok_count, fail_count)

            # 전송 완료 후 — 계정별 최종 봉인 서버저장 (P3, direct 실등록에서만)
            #   봉인은 시스템이 기억(단상+1/삼상+2 소모) → 배치 끝에 마지막 사용값을 awms에 1회 저장.
            #   봉인 공사번호(seal_cons_no)는 등록 차수와 별도 선택값.
            # 마지막 사용 봉인 (자릿수 zfill 보존)
            last_seal_s = str(seal_next_after - 1).zfill(seal_width) if seal_width else str(seal_next_after - 1)
            if req.exec_mode != "cdp" and req.live and ok_count > 0:
                # 시스템 기억 갱신 — config.seal_last = 마지막 사용값 (전역, 계정 무관)
                try:
                    cfg_all = _load_transmit_config()
                    ds_c = cfg_all.get(req.dataset) or {"dataset": req.dataset}
                    ds_c["seal_last"] = last_seal_s
                    ds_c["seal_width"] = seal_width or len(last_seal_s)
                    cfg_all[req.dataset] = ds_c
                    _save_transmit_config(cfg_all)
                except Exception as cerr:
                    print(f"[transmit] seal_last 저장 실패(무시): {cerr}", flush=True)
                # awms 봉인 서버저장 1회 (세션 계정 앞으로)
                sres = mtr_direct.save_final_seal(seal_cons_no, last_seal_s)
                _append_log({
                    "ts": int(time.time() * 1000), "mid": "", "account": _session_acct,
                    "seal": last_seal_s, "ok": bool(sres.get("ok")),
                    "phase": "시스템",
                    "msg": (f"최종봉인 서버저장 {'OK' if sres.get('ok') else '실패(수동 보정/동기화 필요)'}: "
                            f"seal_cons_no={seal_cons_no} last_seal={last_seal_s} "
                            f"status={sres.get('status_code')} — 다른 아이디 사용 시 [봉인 동기화] 필요"),
                })
            else:
                _append_log({
                    "ts": int(time.time() * 1000), "mid": "", "account": _session_acct,
                    "seal": last_seal_s, "ok": True,
                    "phase": "시스템",
                    "msg": f"최종봉인 서버저장 생략(검증모드/CDP): last_seal={last_seal_s}",
                })

            # P4 사후검증 — awms 재조회 필드대조. 통과건 = 전송완료 확정(이후 재조회 없음).
            if req.exec_mode != "cdp" and req.live and req.verify and _verify_items:
                _push_monitor("verifying", ok_count + fail_count, total)
                try:
                    vres = mtr_direct.verify_registration(_verify_items)
                    for v in vres:
                        if v.get("ok"):
                            _append_log({
                                "ts": int(time.time() * 1000), "mid": v.get("meter", ""),
                                "account": "", "seal": "", "ok": True,
                                "phase": "대조",
                                "msg": "필드대조 통과 — 전송완료 확정",
                            })
                        else:
                            mism = "; ".join(
                                f"{m.get('field')}: 기대={m.get('expect')} 실제={m.get('got')}"
                                for m in (v.get("mismatches") or [])
                            )
                            _append_log({
                                "ts": int(time.time() * 1000), "mid": v.get("meter", ""),
                                "account": "", "seal": "", "ok": False,
                                "phase": "대조",
                                "msg": f"필드 불일치: {mism}",
                            })
                            # Firebase에 불일치 기록 (awms_synced는 유지 — 등록 자체는 됨)
                            try:
                                v_addr = mid_addr_idx.get(str(v.get("meter", "")), "")
                                if v_addr:
                                    fb_db.reference(ws_path, app=fa_app) \
                                        .child(v_addr).child("replacement_list") \
                                        .child(str(v.get("meter", ""))) \
                                        .update({"awms_verify_mismatch": v.get("mismatches")})
                            except Exception:
                                pass
                except Exception as verr:
                    _append_log({
                        "ts": int(time.time() * 1000), "mid": "", "account": "",
                        "seal": "", "ok": False, "phase": "대조",
                        "msg": f"사후검증 실행 오류(전송 자체는 완료): {verr}",
                    })

            with _TRANSMIT_JOBS_LOCK:
                j = _TRANSMIT_JOBS.get(job_id)
                if j is not None:
                    j.update({
                        "status": "done",
                        "finished_at": datetime.now(KST).isoformat(),
                    })

            # 모니터 완료 push
            _push_monitor("done", ok_count + fail_count, total)

        except Exception as job_err:
            # 잡 레벨 예외 (설정 로드 실패 등)
            _append_log({
                "ts": int(time.time() * 1000), "mid": "", "account": "",
                "seal": "", "ok": False,
                "phase": "시스템", "reason": traceback.format_exc(),
                "msg": f"잡 오류: {traceback.format_exc()}",
            })
            with _TRANSMIT_JOBS_LOCK:
                j = _TRANSMIT_JOBS.get(job_id)
                if j is not None:
                    j.update({
                        "status": "error",
                        "finished_at": datetime.now(KST).isoformat(),
                    })
            # 모니터 에러 push (fa_app이 초기화 전에 예외 날 수 있으므로 try)
            try:
                _push_monitor("error", 0, total)
            except Exception:
                pass
        finally:
            # workStatus 캐시 무효화 — awms_synced 기록이 다음 /results에 즉시 반영되도록
            _invalidate_ws_raw(req.dataset)

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {"job_id": job_id, "status": "running", "total": total}


@app.get("/transmit/job/{job_id}")
def get_transmit_job(job_id: str):
    """전송 잡 상태 조회. status: running / done / error"""
    with _TRANSMIT_JOBS_LOCK:
        job = _TRANSMIT_JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"transmit job '{job_id}' 없음")
    return job


# ══════════════════════════════════════════════════════════════════════════════
# 수동 일괄 전송완료 마킹 — POST /transmit/mark
#   ★awms 조회·폰 없이 Firebase awms_synced 플래그만 쓴다(읽기/쓰기 안전, 되돌리기 가능).
#   배경(영준님 2026-07-03): awms 계정이 여러 곳에 흩어져 조회 대조 불가 + 종로는 데이터관리
#   연습 단계. 이미 awms에 들어간(전송완료) 건을 사람이 아는 대로 일괄 전송완료로 찍고,
#   실패분만 제외한다. 실awms 등록(/transmit/run 라이브)과 별개 — 수동 마킹은 awms_synced_manual=True.
# ══════════════════════════════════════════════════════════════════════════════

class TransmitMarkReq(BaseModel):
    dataset: str
    mids: list                 # 철거계기번호(old meter) 목록 — replacement_list 키
    synced: bool = True        # True=전송완료 마킹 / False=되돌리기(미전송)
    cons_no: str = ""          # (선택) 공사번호 — 전송완료탭 표시용
    account: str = ""          # (선택) 계정 id — 전송완료탭 표시용


@app.post("/transmit/mark")
def post_transmit_mark(req: TransmitMarkReq):
    """검증완료 계기를 수동으로 전송완료(awms_synced) 일괄 마킹/해제.

    실제 awms 전송 없음 — 이미 awms에 등록된(전송완료) 건을 데이터관리자에서 반영하는 용도.
    synced=True: awms_synced=True + awms_synced_manual=True(+선택 cons_no/account) 머지.
    synced=False: 되돌리기 — 수동 마킹(awms_synced_manual)만 해제. 실전송(라이브) 기록은 보호(건드리지 않음).
    반환: {ok, marked, skipped, not_found}
    """
    cfg = _load_config()
    ds = cfg.get("datasets", {}).get(req.dataset)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"dataset '{req.dataset}' 없음")
    mids = [str(m).strip() for m in (req.mids or []) if str(m).strip()]
    if not mids:
        raise HTTPException(status_code=400, detail="mids 비어있음")

    raw = _get_ws_raw(req.dataset) or {}
    # mid → addr 역탐색 인덱스 (replacement_list 키 직접 확인)
    mid_addr: Dict[str, str] = {}
    if isinstance(raw, dict):
        for addr, av in raw.items():
            if not isinstance(av, dict):
                continue
            for m in (av.get("replacement_list") or {}):
                mid_addr[str(m)] = addr

    from firebase_admin import db as fb_db
    fa_app = _get_transmit_fa_app(ds)
    ws_path = ds.get("ws_path", "workStatus/jongno")
    now_ms = int(time.time() * 1000)

    marked, skipped, not_found = [], [], []
    for mid in mids:
        addr = mid_addr.get(mid, "")
        if not addr:
            not_found.append(mid)
            continue
        rec = (raw.get(addr) or {}).get("replacement_list", {}).get(mid) or {}
        rl_ref = fb_db.reference(ws_path, app=fa_app) \
            .child(addr).child("replacement_list").child(mid)
        if req.synced:
            patch = {
                "awms_synced": True,
                "awms_synced_manual": True,
                "awms_synced_at": now_ms,
            }
            # 선택 봉인/공사/계정 정보 — 있으면 표시용으로 채움(수동이라 봉인번호는 없음)
            if req.cons_no or req.account:
                seal = dict(rec.get("awms_seal") or {})
                if req.account:
                    seal["account"] = req.account
                if req.cons_no:
                    seal["cons_no"] = req.cons_no
                seal.setdefault("seal_no", "")
                seal.setdefault("seal_no2", "")
                patch["awms_seal"] = seal
            rl_ref.update(patch)
            marked.append(mid)
        else:
            # 되돌리기 — 수동 마킹만 해제. 실전송(라이브: awms_synced_manual 없음) 기록은 보호.
            if rec.get("awms_synced") and not rec.get("awms_synced_manual"):
                skipped.append(mid)   # 실전송 기록 — 되돌리기 거부(보호)
                continue
            rl_ref.update({
                "awms_synced": False,
                "awms_synced_manual": None,   # 키 삭제
                "awms_synced_at": None,
            })
            marked.append(mid)

    _invalidate_ws_raw(req.dataset)
    return {"ok": True, "synced": req.synced,
            "marked": marked, "skipped": skipped, "not_found": not_found,
            "counts": {"marked": len(marked), "skipped": len(skipped), "not_found": len(not_found)}}


# ══════════════════════════════════════════════════════════════════════════════
# OTP 로그인 리모컨 + 세션 확인
#   /transmit/login  — 폰 계기큐 awms 로그인 폼 자동입력 + 버튼 클릭 (OTP는 사람 수동)
#   /transmit/session — 현재 awms 로그인 상태 확인 (조회 전용, 실행 안전)
# ══════════════════════════════════════════════════════════════════════════════

class TransmitLoginReq(BaseModel):
    dataset: str
    # account = awms_id_profiles 의 id 값 (또는 label 폴백)
    account: str


@app.post("/transmit/login")
def post_transmit_login(req: TransmitLoginReq):
    """계기큐 awms 로그인 자동입력 + 버튼 클릭.

    1) 계기큐 localStorage 'awms_id_profiles' 에서 account id/pw 조회.
    2) localStorage helper_cred_id/pw 에 기록 (아이디 전환).
    3) awms 로그인 폼(awmsEval 경유 #id/#pw 직접 강제 입력 + #btnLogin 클릭).
    4) 반환: {ok, msg:"폰에서 OTP 입력하세요"}.

    ★ 이 엔드포인트 자체를 호출하지 않으면 실행 없음 — 코드만 준비.
    """
    # ── CDP eval 표현식 ─────────────────────────────────────────────────────
    # account_j: 외부에서 받은 account 문자열을 JS 리터럴로 안전하게 이스케이프
    account_j = json.dumps(req.account)

    # 1단계: localStorage 프로필에서 id/pw 조회 + helper_cred 갱신
    # 2단계: awmsEval (계기큐 → awms 웹뷰 XHR 브릿지)로 폼 직접 강제 입력
    # 3단계: #btnLogin 클릭 → OTP 화면 진입
    # 주의: awmsEval 내부 표현식은 awms.kdn.com 컨텍스트에서 평가됨.
    #        #id/#pw 는 awms 로그인 폼 DOM (awmsEval 필수, 계기큐 DOM 아님).
    expr = (
        "(async()=>{"
        f"const TARGET_ACCOUNT={account_j};"
        # 프로필 탐색 (id 또는 label 매칭)
        "const raw=localStorage.getItem('awms_id_profiles');"
        "const profiles=raw?JSON.parse(raw):[];"
        "const prof=profiles.find(p=>p.id===TARGET_ACCOUNT||p.label===TARGET_ACCOUNT);"
        "if(!prof)return {ok:false,err:'프로필 없음: '+TARGET_ACCOUNT};"
        "const cid=prof.id, cpw=prof.pw||'';"
        # localStorage 기록 (아이디 전환 — 이후 세션체크에서 인식)
        "localStorage.setItem('helper_cred_id',cid);"
        "if(cpw) localStorage.setItem('helper_cred_pw',cpw);"
        # awmsEval 존재 확인
        "if(typeof awmsEval!=='function') return {ok:false,err:'awmsEval 미정의'};"
        # awms 로그인 폼 강제 입력 — awmsEval 경유 (awms.kdn.com 컨텍스트)
        # awmsEval 은 Promise 반환 (session.js 참조)
        "const fillResult=await awmsEval("
        "  `(()=>{try{"
        "    var idEl=document.getElementById('id'),"
        "        pwEl=document.getElementById('pw'),"
        "        btn=document.getElementById('btnLogin');"
        "    if(!idEl||!pwEl) return 'no-form';"
        "    var sid=${JSON.stringify(cid)}, spw=${JSON.stringify(cpw)};"
        "    idEl.value=sid;"
        "    idEl.dispatchEvent(new Event('input',{bubbles:true}));"
        "    idEl.dispatchEvent(new Event('change',{bubbles:true}));"
        "    if(spw){"
        "      pwEl.value=spw;"
        "      pwEl.dispatchEvent(new Event('input',{bubbles:true}));"
        "      pwEl.dispatchEvent(new Event('change',{bubbles:true}));"
        "    }"
        "    if(btn) btn.click();"
        "    return 'clicked:id='+sid;"
        "  }catch(e){return 'err:'+String(e&&e.message||e);}"
        "  })()`"
        ");"
        "return {ok:true,account:cid,fill:fillResult};"
        "})()"
    )

    # 화면 깨우기
    import subprocess
    try:
        subprocess.run(
            [mtr_direct.ADB, "shell", "input", "keyevent", "KEYCODE_WAKEUP"],
            timeout=5, capture_output=True,
        )
    except Exception:
        pass

    result = _cdp_eval_queue(expr, await_promise=True, timeout=20)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("err", "CDP 실패"))

    val = result.get("value") or {}
    if isinstance(val, str):
        # awmsEval 반환이 JSON 문자열인 경우
        try:
            val = json.loads(val)
        except Exception:
            val = {"raw": val}

    if not val.get("ok"):
        return {
            "ok": False,
            "msg": val.get("err", "로그인 폼 입력 실패"),
            "fill": val.get("fill"),
            "account": req.account,
        }

    return {
        "ok": True,
        "msg": "폰에서 OTP 입력하세요",
        "account": val.get("account", req.account),
        "fill": val.get("fill"),
    }


@app.get("/transmit/session")
def get_transmit_session(dataset: str = Query(...)):
    """폰 계기큐 현재 awms 로그인 상태 확인 (조회 전용, 실행 안전).

    _lookupSeal() 을 eval 해 LV_CONS_NO 응답 여부로 로그인 판정.
    로그인돼 있으면 appIndexVm.sessionInfo.USER_ID 도 추출해 반환.
    """
    # _lookupSeal() 은 awms-saverow.js 에서 정의된 전역 함수 (계기큐 localhost 컨텍스트)
    # awmsEval 경유 없이 계기큐 UI 컨텍스트에서 직접 호출 가능.
    expr = (
        "(async()=>{"
        "try{"
        "  if(typeof _lookupSeal!=='function') return {ok:false,err:'_lookupSeal 미정의'};"
        "  const seal=await _lookupSeal();"
        "  const logged_in=!!(seal&&seal.LV_CONS_NO);"
        "  let acct='';"
        "  try{"
        "    if(typeof awmsEval==='function'){"
        "      acct=await awmsEval("
        "        \"(function(){try{return appIndexVm&&appIndexVm.sessionInfo&&appIndexVm.sessionInfo.USER_ID||'';}catch(e){return '';}})()\""
        "      );"
        "    }"
        "  }catch(ae){}"
        "  return {ok:true,logged_in:logged_in,cons_no:seal?seal.LV_CONS_NO||'':'',account:acct||''};"
        "}catch(e){"
        "  return {ok:false,logged_in:false,err:String(e&&e.message||e)};"
        "}"
        "})()"
    )

    # 화면 깨우기
    import subprocess
    try:
        subprocess.run(
            [mtr_direct.ADB, "shell", "input", "keyevent", "KEYCODE_WAKEUP"],
            timeout=5, capture_output=True,
        )
    except Exception:
        pass

    result = _cdp_eval_queue(expr, await_promise=True, timeout=30)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("err", "CDP 실패"))

    val = result.get("value") or {}
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except Exception:
            val = {"raw": val}

    return {
        "dataset": dataset,
        "logged_in": bool(val.get("logged_in")),
        "cons_no": val.get("cons_no", ""),
        "account": val.get("account", ""),
        "err": val.get("err"),
    }


# ══════════════════════════════════════════════════════════════════════════════
# P0 자동검증 워처 — 근무시간 1시간 1회 오늘 완료건 자동 검증
#   지도앱에서 완료하면 포털 안 열어도 백엔드가 검증. 60초 폴링은 낭비라 1시간(영준님).
#   _RUNNING_JOB 게이트 존중(수동 검증/전송 잡과 충돌 안 함). config auto_validate_watch=True로 켬.
# ══════════════════════════════════════════════════════════════════════════════

_WATCH_STATE: dict = {"last_run": {}}   # dataset → 마지막 자동검증 일시(ISO)
_WATCH_WORK_HOURS = (8, 20)             # KST 08~20시만


def _autovalidate_once(dataset: str) -> None:
    """오늘(KST) 날짜 검증을 내부 실행. run_daily 직접 호출(HTTP 우회), _RUNNING_JOB 게이트 준수."""
    global _RUNNING_JOB
    today = datetime.now(KST).strftime("%Y%m%d")
    with _JOB_LOCK:
        if _RUNNING_JOB is not None:
            print(f"[autoval] 다른 잡 실행 중 → 이번 주기 건너뜀 (dataset={dataset})", flush=True)
            return
        job_id = "auto-" + str(uuid.uuid4())[:6]
        _RUNNING_JOB = job_id
    try:
        _ws_url, _out_dir = _dataset_ocr_ctx(dataset)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            daily_cycle.run_daily(date=today, ws_url=_ws_url, out_dir=_out_dir,
                                  no_sync=bool(_out_dir), only_mids=None)
        _WATCH_STATE["last_run"][dataset] = datetime.now(KST).isoformat()
        print(f"[autoval] 완료 dataset={dataset} date={today}", flush=True)
    except Exception:
        print(f"[autoval] 오류(무시): {traceback.format_exc()}", flush=True)
    finally:
        with _JOB_LOCK:
            _RUNNING_JOB = None
        _invalidate_ws_raw(dataset)


def _autovalidate_loop() -> None:
    """1시간 주기 루프. config auto_validate_watch=True 인 dataset만, 근무시간에만 실행."""
    # 기동 직후 60초 대기(서버 워밍업 후 시작)
    time.sleep(60)
    while True:
        try:
            hour = datetime.now(KST).hour
            if _WATCH_WORK_HOURS[0] <= hour < _WATCH_WORK_HOURS[1]:
                t_all = _load_transmit_config()
                for ds, dcfg in t_all.items():
                    if isinstance(dcfg, dict) and dcfg.get("auto_validate_watch"):
                        _autovalidate_once(ds)
        except Exception:
            print(f"[autoval-loop] 오류(무시): {traceback.format_exc()}", flush=True)
        time.sleep(3600)   # 1시간


# 워처 스레드 기동 (모듈 로드 시 1회)
_watch_thread = threading.Thread(target=_autovalidate_loop, daemon=True)
_watch_thread.start()


class AutoWatchReq(BaseModel):
    dataset: str
    enabled: bool


@app.post("/transmit/auto-validate")
def post_auto_validate(req: AutoWatchReq):
    """P0 자동검증 워처 on/off (dataset별). config auto_validate_watch 저장."""
    cfg = _load_transmit_config()
    ds_c = cfg.get(req.dataset) or {"dataset": req.dataset}
    ds_c["auto_validate_watch"] = bool(req.enabled)
    cfg[req.dataset] = ds_c
    _save_transmit_config(cfg)
    return {"ok": True, "dataset": req.dataset, "enabled": bool(req.enabled),
            "last_run": _WATCH_STATE["last_run"].get(req.dataset)}


@app.get("/transmit/auto-validate")
def get_auto_validate(dataset: str = Query(...)):
    dcfg = _load_transmit_config().get(dataset, {})
    return {"dataset": dataset, "enabled": bool(dcfg.get("auto_validate_watch")),
            "last_run": _WATCH_STATE["last_run"].get(dataset),
            "work_hours": _WATCH_WORK_HOURS}


# ── 헬스체크 ─────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"service": "admin-validation API", "version": "1.0.0",
            "phase": "Phase 1 (로컬 FastAPI)"}

@app.get("/health")
def health():
    return {"ok": True, "time": datetime.now(KST).isoformat()}
