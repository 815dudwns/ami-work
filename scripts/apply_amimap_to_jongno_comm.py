# -*- coding: utf-8 -*-
"""
apply_amimap_to_jongno_comm.py — 아미맵(단독시공) 완료건을 종로 통신팀 완료로 일괄 반영

무엇을 하나:
  후보 목록(json)을 읽어 ami-jongno `workStatus/jongno/{addrKey}/comm_completed_list/{old_meter_id}`
  에 `{done_at, worker}` 를 추가한다. 기존에 이미 있는 계기는 절대 덮어쓰지 않는다.

조인 규칙 (dry-run 조사 2026-07-28에서 확정):
  종로 replacement_list[old_meter_id].new_meter_id  ==  아미맵 site-data 계기번호
  → 그 계기의 아미맵 주소 workStatus.state == 'complete' 이면 통신팀이 이미 연계 완료한 것.
  comm_completed_list 의 키는 종로 기준인 **old_meter_id** 다 (bulkCommComplete 와 동일).

안전장치:
  - 기본 dry-run. `--apply` 를 명시해야 쓰기.
  - 쓰기 직전 라이브를 다시 읽어 (a) 주소 존재 (b) old_meter 가 replacement_list 에 있음
    (c) comm_completed_list 에 아직 없음 3가지를 재검증. 하나라도 어긋나면 skip.
  - 쓰기 전에 대상 주소 서브트리 전체를 백업 파일로 덤프.
  - 주소 단위 PATCH (comm_completed_list 하위만). 다른 필드·기존 값 손대지 않음.

사용:
  python3 scripts/apply_amimap_to_jongno_comm.py                       # dry-run
  python3 scripts/apply_amimap_to_jongno_comm.py --apply               # 실제 반영
  python3 scripts/apply_amimap_to_jongno_comm.py --apply --worker 0728일괄완료

★ 주의(적용 전 확인 필요):
  scripts/weekly_workstatus_merge.py 의 TOP_KEEP 화이트리스트에 'comm_completed_list' 가 없다.
  현재 대상 주소는 전부 이미 archived 라 재stub 대상이 아니지만(is_archived → skip),
  향후 미archive 주소에 이 기록을 넣으면 주간 아카이브가 라이브에서 지울 수 있다.
  TOP_KEEP 에 'comm_completed_list' 추가는 계기팀/PM 소관.
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
DB = "https://ami-jongno-default-rtdb.asia-southeast1.firebasedatabase.app"
NODE = "workStatus/jongno"
SA_KEY = os.path.expanduser("~/.firebase-keys/ami-jongno-firebase-adminsdk-fbsvc-dfacd1e2ad.json")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CANDIDATES = "/tmp/relay/amimap_to_jongno_comm_candidates.json"
DEFAULT_WORKER = "0728일괄완료"


def now_ms():
    return int(time.time() * 1000)


def parse_ts(v):
    """ISO 문자열/unix(ms|s) → ms. 실패 시 None. (KST 기준, tz 없으면 KST로 간주)"""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        n = float(v)
        if n < 2e10:
            n *= 1000
        return int(n)
    s = str(v).strip()
    if not s:
        return None
    if s.isdigit():
        return parse_ts(int(s))
    try:
        dt = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=KST)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def http_get(url):
    with urllib.request.urlopen(url, timeout=180) as r:
        return json.loads(r.read())


def sa_token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    scopes = ["https://www.googleapis.com/auth/firebase.database",
              "https://www.googleapis.com/auth/userinfo.email"]
    creds = service_account.Credentials.from_service_account_file(SA_KEY, scopes=scopes)
    creds.refresh(Request())
    return creds.token


def http_patch(path, body, token):
    # ★주소 키에 공백·한글이 있어 반드시 인코딩해야 한다(미인코딩 시 urllib이 전건 실패)
    url = "%s/%s.json?access_token=%s" % (DB, urllib.parse.quote(path, safe="/"), token)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", default=DEFAULT_CANDIDATES, help="후보 목록 json 경로")
    ap.add_argument("--apply", action="store_true", help="실제 쓰기(기본 dry-run)")
    ap.add_argument("--worker", default=DEFAULT_WORKER, help="comm_completed_list.worker 값")
    ap.add_argument("--limit", type=int, default=0, help="테스트용: 주소 N개만")
    ap.add_argument("--only-live-complete", action="store_true", default=True,
                    help="아미맵 라이브 state=complete 인 후보만 (기본 on)")
    ap.add_argument("--include-backup-only", action="store_true",
                    help="백업에만 complete 인 후보도 포함(권장하지 않음)")
    args = ap.parse_args()
    apply_mode = args.apply

    print("=== apply_amimap_to_jongno_comm %s ===" % ("APPLY" if apply_mode else "DRY-RUN"))
    print("worker 값:", args.worker)

    if not os.path.exists(args.candidates):
        print("ERR: 후보 파일 없음:", args.candidates)
        sys.exit(1)
    cands = json.load(open(args.candidates))
    if isinstance(cands, dict):
        cands = cands.get("candidates") or []
    print("후보 로드:", len(cands))

    if not args.include_backup_only:
        before = len(cands)
        cands = [c for c in cands if c.get("in_live_complete")]
        print("아미맵 라이브 complete 필터: %d → %d" % (before, len(cands)))

    print("라이브 노드 조회 중...")
    live = http_get("%s/%s.json" % (DB, NODE))
    if not isinstance(live, dict):
        print("ERR: 노드 형태 이상", type(live))
        sys.exit(1)
    print("주소 수:", len(live))

    # ── 재검증 + 주소별 묶기 ───────────────────────────────
    plan = {}          # addrKey -> {old_meter: {done_at, worker}}
    skip = {"addr_missing": 0, "not_in_repl": 0, "already_done": 0, "no_new_meter": 0, "excluded": 0}
    for c in cands:
        if c.get("excluded"):          # 조사에서 제외 판정된 건(구 불일치 등)
            skip["excluded"] += 1
            continue
        ak = c.get("jongno_addr_key")
        old = c.get("old_meter_id")
        if not ak or not old:
            skip["no_new_meter"] += 1
            continue
        val = live.get(ak)
        if not isinstance(val, dict):
            skip["addr_missing"] += 1
            continue
        rl = val.get("replacement_list") or {}
        if old not in rl:
            skip["not_in_repl"] += 1
            continue
        ccl = val.get("comm_completed_list") or {}
        if old in ccl:                      # ★기존 값 절대 덮어쓰지 않음
            skip["already_done"] += 1
            continue
        done_at = parse_ts(c.get("amimap_updatedAt")) or now_ms()
        plan.setdefault(ak, {})[old] = {"done_at": done_at, "worker": args.worker}

    if args.limit:
        plan = dict(list(plan.items())[:args.limit])

    total_m = sum(len(v) for v in plan.values())
    print("반영 대상: 주소 %d개 / 계기 %d건" % (len(plan), total_m))
    print("skip:", skip)

    stamp = datetime.datetime.now(KST).strftime("%Y%m%d-%H%M%S")
    outdir = os.path.join(REPO, "data")
    plan_path = os.path.join(outdir, "amimap-comm-apply-plan-%s.json" % stamp)
    json.dump(plan, open(plan_path, "w"), ensure_ascii=False, indent=1)
    print("계획 저장:", plan_path)

    if not apply_mode:
        for ak in list(plan)[:5]:
            print("  예시", ak, "→", list(plan[ak].items())[:3])
        print("DRY-RUN 종료 (쓰기 없음). 실제 반영은 --apply")
        return

    # ── 백업 (대상 주소 서브트리 전체) ─────────────────────
    backup = {ak: live[ak] for ak in plan}
    bpath = os.path.join(outdir, "ami-jongno-workStatus-backup-comm일괄전-%s.json" % stamp)
    json.dump(backup, open(bpath, "w"), ensure_ascii=False, indent=1)
    print("백업 저장:", bpath, "(%d 주소)" % len(backup))

    token = sa_token()
    ok = fail = 0
    errs = []
    for i, (ak, meters) in enumerate(plan.items(), 1):
        body = {"comm_completed_list/%s" % m: v for m, v in meters.items()}
        try:
            http_patch("%s/%s" % (NODE, ak), body, token)
            ok += len(meters)
        except Exception as e:
            fail += len(meters)
            errs.append((ak, str(e)))
            print("  PATCH 실패:", ak, e)
        if i % 50 == 0:
            print("  진행 %d/%d 주소" % (i, len(plan)))
            token = sa_token()      # 토큰 갱신(장시간 실행 대비)

    print("=== 완료: 성공 %d건 / 실패 %d건 / 주소 %d개" % (ok, fail, len(plan)))
    if errs:
        epath = os.path.join(outdir, "amimap-comm-apply-errors-%s.json" % stamp)
        json.dump(errs, open(epath, "w"), ensure_ascii=False, indent=1)
        print("에러 목록:", epath)
    print("롤백: 백업 파일의 주소별 comm_completed_list 로 되돌리거나, 추가된 키만 삭제")


if __name__ == "__main__":
    main()
