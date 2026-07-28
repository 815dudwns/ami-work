#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
weekly_workstatus_merge.py — 종로 workStatus/jongno 주간 아카이브 (P3, stub화=삭제아님)

완료(complete) & effective_date가 7일 이상 지난 주소를:
  - 원본 전체(verbatim)를 archive/workStatus/jongno/{YYYY-Www}/{addr} 로 복사
  - 라이브 workStatus/jongno/{addr} 를 경량 stub 으로 교체(사진/awms응답/검침값 등 무거운 필드는 archive에만)
멱등: 이미 stub(archived:true)이거나 미완료·최근7일분은 건드리지 않음.

기본 = --dry-run (읽기전용 리포트). --apply 시에만 백업선행+원자적 multi-path write.
주차경계 = KST(Asia/Seoul) ISO week, 월요일 시작, 키 'YYYY-Www'.

사용:
  python3 weekly_workstatus_merge.py               # dry-run 리포트
  python3 weekly_workstatus_merge.py --apply        # 실제 실행(백업선행)
설계: research/data-archive/workstatus-archive-design.md
"""
import sys, os, json, time, argparse, datetime, urllib.request, urllib.error, urllib.parse
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
DB = "https://ami-jongno-default-rtdb.asia-southeast1.firebasedatabase.app"
NODE = "workStatus/jongno"
ARCHIVE_BASE = "archive/workStatus/jongno"
SA_KEY = os.path.expanduser("~/.firebase-keys/ami-jongno-firebase-adminsdk-fbsvc-dfacd1e2ad.json")
SEVEN_DAYS_MS = 7 * 86400 * 1000
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# stub이 라이브에 남기는 화이트리스트 (나머지는 archive에만) — 설계 §3.1
TOP_KEEP = ("meter_state", "comm_state", "meter_updatedAt", "comm_updatedAt", "x", "y")
METER_KEEP = ("new_meter_id", "old_meter_id", "replaced_at", "source", "draft", "daily_seq", "quarantine", "awms_error")


def bnow():
    return int(time.time() * 1000)


def iso_week_key(ms):
    d = datetime.datetime.fromtimestamp(ms / 1000, KST)
    y, w, _ = d.isocalendar()
    return "%04d-W%02d" % (y, w)


def parse_ts(v):
    """ISO문자열 또는 unix(ms/s) → ms. 실패시 None."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        n = float(v)
        if n < 2e10:      # 초 단위로 보이면 ms 변환
            n *= 1000
        return int(n)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        if s.isdigit():
            return parse_ts(int(s))
        try:
            dt = datetime.datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=KST)
            return int(dt.timestamp() * 1000)
        except Exception:
            return None
    return None


def effective_date(val):
    """주소의 최신 활동시각(ms) = 가능한 모든 타임스탬프 신호의 max. 없으면 None."""
    cands = []
    for k in ("meter_updatedAt", "comm_updatedAt", "updatedAt"):
        t = parse_ts(val.get(k))
        if t:
            cands.append(t)
    rl = val.get("replacement_list")
    if isinstance(rl, dict):
        for m in rl.values():
            if isinstance(m, dict):
                for k in ("replaced_at", "awms_synced_at", "last_edited_at"):
                    t = parse_ts(m.get(k))
                    if t:
                        cands.append(t)
    ccl = val.get("comm_completed_list")
    if isinstance(ccl, dict):
        for m in ccl.values():
            if isinstance(m, dict):
                t = parse_ts(m.get("done_at"))
                if t:
                    cands.append(t)
    return max(cands) if cands else None


def is_complete(val):
    ms = val.get("meter_state")
    if ms == "complete":
        return True
    if ms in ("pending", "fail", "hold"):
        return False   # ★명시적 미완료는 all-replaced여도 아카이브 금지(작업중/실패 주소 보호)
    # meter_state 미설정(None) + 전건 new_meter_id = 상태미표기 완료작업 → 아카이브 대상(지도 isAllReplaced 회색)
    rl = val.get("replacement_list")
    if isinstance(rl, dict) and rl:
        return all(isinstance(m, dict) and m.get("new_meter_id") for m in rl.values())
    return False


def is_archived(val):
    return val.get("archived") is True


def make_stub(val, week):
    stub = {k: val[k] for k in TOP_KEEP if k in val}
    stub["archived"] = True
    stub["archive_week"] = week
    rl = val.get("replacement_list")
    if isinstance(rl, dict):
        srl = {}
        for mid, m in rl.items():
            if isinstance(m, dict):
                mm = {k: m[k] for k in METER_KEEP if k in m}
                mm["archived"] = True
                srl[mid] = mm
            else:
                srl[mid] = m
        stub["replacement_list"] = srl
    elif rl is not None:
        stub["replacement_list"] = rl  # AWMS_IMPORT 문자열형 — 그대로(경량)
    return stub


def nbytes(obj):
    return len(json.dumps(obj, ensure_ascii=False).encode("utf-8"))


def strip_empty(o):
    """Firebase는 저장 시 빈 dict/list/null을 제거 → 원본과 readback 비교 전 양쪽 정규화."""
    if isinstance(o, dict):
        r = {}
        for k, v in o.items():
            v2 = strip_empty(v)
            if v2 not in (None, {}, []):
                r[k] = v2
        return r
    if isinstance(o, list):
        return [strip_empty(v) for v in o]
    return o


def http_get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read())


def sa_token():
    """서비스계정으로 RTDB write용 access token 발급."""
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    scopes = ["https://www.googleapis.com/auth/firebase.database",
              "https://www.googleapis.com/auth/userinfo.email"]
    creds = service_account.Credentials.from_service_account_file(SA_KEY, scopes=scopes)
    creds.refresh(Request())
    return creds.token


def http_patch(path, body, token):
    url = "%s/%s.json?access_token=%s" % (DB, path, token)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 실행(기본은 dry-run)")
    ap.add_argument("--batch", type=int, default=50, help="apply 시 배치당 주소 수")
    args = ap.parse_args()
    apply = args.apply

    now = bnow()
    cutoff = now - SEVEN_DAYS_MS
    print("=== weekly_workstatus_merge %s ===" % ("APPLY" if apply else "DRY-RUN"))
    print("KST now:", datetime.datetime.fromtimestamp(now / 1000, KST).strftime("%Y-%m-%d %H:%M:%S"),
          "| cutoff(7d):", datetime.datetime.fromtimestamp(cutoff / 1000, KST).strftime("%Y-%m-%d"))

    print("라이브 노드 조회 중...")
    data = http_get("%s/%s.json" % (DB, NODE))
    if not isinstance(data, dict):
        print("ERR: 노드 형태 이상", type(data)); sys.exit(1)
    live_total = len(data)
    live_bytes = nbytes(data)
    print("현재 주소: %d개, %d bytes (%.2f MB)" % (live_total, live_bytes, live_bytes / 1e6))

    targets = []          # (addr, week, full_bytes, stub_bytes)
    week_hist = {}
    skip_incomplete = skip_recent = skip_already = skip_nodate = 0
    freed = stub_stay = 0
    nodate_complete = 0

    for addr, val in data.items():
        if not isinstance(val, dict):
            continue
        if is_archived(val):
            skip_already += 1
            continue
        if not is_complete(val):
            skip_incomplete += 1
            continue
        eff = effective_date(val)
        if eff is None:
            # 완료인데 날짜신호 0 = 명백한 레거시 → 아카이브 대상(설계 §3.2). very-old로 취급.
            nodate_complete += 1
            week = "legacy"
        elif eff >= cutoff:
            skip_recent += 1
            continue
        else:
            week = iso_week_key(eff)
        fb = nbytes(val)
        stub = make_stub(val, week)   # week = 'YYYY-Www' 또는 'legacy'(날짜신호0)
        sb = nbytes(stub)
        targets.append((addr, stub["archive_week"], val, stub, fb, sb))
        freed += (fb - sb)
        stub_stay += sb
        week_hist[stub["archive_week"]] = week_hist.get(stub["archive_week"], 0) + 1

    print("\n--- 판정 ---")
    print("아카이브 대상(stub화):      %d개" % len(targets))
    print("  · 날짜신호 있는 완료≥7d:  %d" % (len(targets) - nodate_complete))
    print("  · 날짜신호 0 레거시완료:   %d" % nodate_complete)
    print("스킵 미완료:                %d" % skip_incomplete)
    print("스킵 최근7d미경과 완료:     %d" % skip_recent)
    print("스킵 이미 archived(멱등):   %d" % skip_already)
    print("\n--- 용량 ---")
    would_full = sum(t[4] for t in targets)
    print("대상 원본 총량(→archive):   %d bytes (%.2f MB)" % (would_full, would_full / 1e6))
    print("대상 stub 총량(라이브잔류): %d bytes (%.2f MB)" % (stub_stay, stub_stay / 1e6))
    print("절감(freed):                %d bytes (%.2f MB, %.1f%%)" % (freed, freed / 1e6, 100.0 * freed / live_bytes))
    live_after = live_bytes - freed
    print("라이브 예상 크기:           %d → %d bytes (%.2f MB → %.2f MB)" % (live_bytes, live_after, live_bytes / 1e6, live_after / 1e6))
    print("\n--- 주차 분포 ---")
    for wk in sorted(week_hist):
        print("  %s: %d개" % (wk, week_hist[wk]))

    if not apply:
        print("\n[DRY-RUN] 실데이터 무접촉. --apply 로 실행.")
        return

    # ---- APPLY ----
    ts = datetime.datetime.fromtimestamp(now / 1000, KST).strftime("%Y%m%d-%H%M%S")
    bpath = os.path.join(REPO, "data", "ami-jongno-workStatus-backup-P3merge전-%s.json" % ts)
    with open(bpath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print("\n[APPLY] 백업 저장:", bpath)
    token = sa_token()
    done = 0
    batch = []
    def flush(batch):
        if not batch:
            return
        body = {}
        for addr, wk, full, stub, _, _ in batch:
            body["%s/%s/%s" % (ARCHIVE_BASE, wk, addr)] = full
            body["%s/%s" % (NODE, addr)] = stub
        http_patch("", body, token)  # 루트 원자 multi-path
        # 리드백 검증(배치 첫건) — 주소키에 공백/한글 있어 URL 인코딩, 비교는 구조적 동등(키순서 무관)
        a0, wk0, full0, _, _, _ = batch[0]
        rb = http_get("%s/%s/%s/%s.json" % (DB, ARCHIVE_BASE,
                                            urllib.parse.quote(wk0, safe=""),
                                            urllib.parse.quote(a0, safe="")))
        if strip_empty(rb) != strip_empty(full0):
            raise RuntimeError("리드백 불일치 %s (archive 검증 실패) — 중단" % a0)
    for t in targets:
        batch.append(t)
        if len(batch) >= args.batch:
            flush(batch); done += len(batch); print("  ...%d/%d" % (done, len(targets))); batch = []
    flush(batch); done += len(batch)
    print("[APPLY] 완료: %d개 stub화, 백업=%s" % (done, os.path.basename(bpath)))


if __name__ == "__main__":
    main()
