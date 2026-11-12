#!/usr/bin/env python3
"""미조치(lte) 상태 기록을 자기 키로 옮기기 — '주소|미조치' -> '주소|미조치lte' (2026-11-12, 영준님 "모든리스트 개별동작하게").

11/10~11/12 엔 미조치(lte)가 미조치와 같은 '주소|미조치' 를 써서, 한 주소에 두 리스트가 다 있으면 한쪽 완료가
다른 쪽 마커에도 찍혔다. 레지스트리에서 공유를 없앤 뒤(js/datasets.js · scripts/datasets.py) 그 사이 lte 개소에
쌓인 기록을 새 키로 복사한다.

규칙 (PM 발주 2026-11-12):
  - lte 리스트(data/michochi-lte/*.json)의 개소 키마다, 옛 키 '주소|미조치' 에 기록이 있으면 '주소|미조치lte' 로 복사.
    주소 부분은 그대로다 — 접미만 바뀐다(scripts/test_status_key_registry.py 가 보장).
  - 개소 칸(state·reason·rework·updatedAt·updatedBy·updatedByName)은 그대로. meterChecks · failedMeters(개별불가)는
    그 개소의 lte 계기 것만. 남는 게 없으면(상태도 없음) 안 쓴다.
  - syncAt = 서버 시각({".sv": "timestamp"}) — 안 밀면 폰의 델타 범위 밖이라 영영 못 받는다.
  - migratedFrom = 옛 키(원문) — 이 스크립트가 쓴 기록 표시.
  - ★옛 '|미조치' 기록은 지우지 않는다(미조치 쪽 키이기도 하고, 되돌릴 근거다).
  - ★새 키에 이미 기록이 있으면 건드리지 않고 보고한다(배포 뒤 폰이 먼저 쓴 것).
  - 섞인 개소(같은 옛 키에 미조치 계기도 있음) 중 기록 있는 곳은 따로 목록으로 낸다 — lte 쪽 상태를 그대로 둘지
    되돌릴지는 영준님 결정. --skip-mixed 면 섞인 개소는 복사하지 않는다.

  python3 scripts/migrate_michochi_lte_keys.py                    # 드라이런(기본) — 라이브 GET 만, 쓰기 없음
  python3 scripts/migrate_michochi_lte_keys.py --ws-file ws.json  # 받아 둔 workStatus 로 드라이런
  python3 scripts/migrate_michochi_lte_keys.py --out plan.json    # 계획(복사할 기록·섞인 개소·충돌) 파일로
  python3 scripts/migrate_michochi_lte_keys.py --go               # ★실 DB 쓰기 — PM 만. 쓰기 직전 새 키를 다시 읽어 충돌 재확인
"""
import argparse
import copy
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import status_key as S  # noqa: E402

DB_URL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
WS_PATH = "workStatus/charger4eleccar"
CRED = ROOT / "ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json"
OLD_CAT, NEW_CAT = "미조치", "미조치lte"
SEP = S.STATUS_KEY_SEP
SITE_FIELDS = ("state", "reason", "rework", "updatedAt", "updatedBy", "updatedByName")


def _token():
    import google.oauth2.service_account as sa
    import google.auth.transport.requests as gr
    c = sa.Credentials.from_service_account_file(
        str(CRED), scopes=["https://www.googleapis.com/auth/firebase.database",
                           "https://www.googleapis.com/auth/userinfo.email"])
    c.refresh(gr.Request())
    return c.token


def _req(method, path, body=None, auth=True, query=""):
    url = f"{DB_URL}/{urllib.parse.quote(path)}.json" + (f"?{query}" if query else "")
    headers = {"Authorization": "Bearer " + _token()} if auth else {}
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    if data is not None:
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.loads(resp.read().decode() or "null")


def meters_by_old_key():
    """옛 키 '주소|미조치' -> {'c': {계기}, 'l': {계기}}, 그리고 옛 키 -> 새 lte 키."""
    rows = [r for r in S.load_rows(str(ROOT / "data")) if r["category"] in (OLD_CAT, NEW_CAT)]
    bm, _ = S.build_status_key_index(rows)
    by, new_of = {}, {}
    for r in rows:
        k = S.status_key_of(r, bm)
        if r["category"] == NEW_CAT:
            if not k.endswith(SEP + NEW_CAT):
                sys.exit(f"★lte 행 키가 '{SEP}{NEW_CAT}' 로 안 끝난다 — 레지스트리 분리가 안 됐다: {k}")
            old = k[: -len(NEW_CAT)] + OLD_CAT
            prev = new_of.setdefault(old, k)
            if prev != k:
                sys.exit(f"★옛 키 하나가 lte 키 둘로 갈린다: {old} -> {prev} / {k}")
            side = "l"
        else:
            old, side = k, "c"
        by.setdefault(old, {"c": set(), "l": set()})[side].add(str(r.get("계기번호") or ""))
    return by, new_of


def filtered(rec, lte_meters):
    """옛 기록에서 lte 쪽으로 가져갈 기록. 가져갈 게 없으면 None."""
    out = {f: copy.deepcopy(rec[f]) for f in SITE_FIELDS if f in rec}
    for f in ("meterChecks", "failedMeters"):
        sub = rec.get(f)
        if isinstance(sub, dict):
            keep = {mk: copy.deepcopy(v) for mk, v in sub.items() if S.decode_key(mk) in lte_meters}
            if keep:
                out[f] = keep
    if "state" not in out and not out.get("meterChecks") and not out.get("failedMeters"):
        return None
    return out


def summary(rec, meters):
    mc = rec.get("meterChecks") or {}
    fm = rec.get("failedMeters") or {}
    return {
        "state": rec.get("state"), "updatedAt": rec.get("updatedAt"), "updatedByName": rec.get("updatedByName"),
        "checked": sorted(S.decode_key(k) for k, v in mc.items() if isinstance(v, dict) and v.get("checked")
                          and S.decode_key(k) in meters),
        "failed": sorted(S.decode_key(k) for k in fm if S.decode_key(k) in meters),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--go", action="store_true", help="실 DB 에 쓴다(PM 만)")
    ap.add_argument("--ws-file", default="", help="받아 둔 workStatus JSON(드라이런 전용)")
    ap.add_argument("--skip-mixed", action="store_true", help="섞인 개소는 복사하지 않는다")
    ap.add_argument("--out", default="", help="계획을 JSON 으로 저장")
    a = ap.parse_args()
    if a.go and a.ws_file:
        sys.exit("--go 는 라이브를 다시 읽어야 한다 — --ws-file 과 같이 못 쓴다")

    by, new_of = meters_by_old_key()
    ws = json.loads(Path(a.ws_file).read_text(encoding="utf-8")) if a.ws_file else (_req("GET", WS_PATH, auth=False) or {})
    print(f"workStatus {len(ws):,}키 · lte 개소(옛 키) {len(new_of):,} · 미조치 개소 {sum(1 for v in by.values() if v['c']):,}")

    plan, conflicts, mixed, empty = {}, [], [], []
    n_checks = n_failed = 0
    for old, new in sorted(new_of.items()):
        rec = ws.get(S.encode_key(old))
        if not isinstance(rec, dict):
            continue
        m = by[old]
        is_mixed = bool(m["c"])
        if is_mixed:
            mixed.append({"key": old, "lteMeters": sorted(m["l"]), "michochiMeters": sorted(m["c"]),
                          "lte": summary(rec, m["l"]), "michochi": summary(rec, m["c"])})
        if S.encode_key(new) in ws:
            conflicts.append({"key": new, "old": old, "existing": ws[S.encode_key(new)]})
            continue
        if is_mixed and a.skip_mixed:
            continue
        out = filtered(rec, m["l"])
        if out is None:
            empty.append(old)
            continue
        out["syncAt"] = {".sv": "timestamp"}
        out["migratedFrom"] = old
        plan[new] = out
        n_checks += sum(1 for v in (out.get("meterChecks") or {}).values() if isinstance(v, dict) and v.get("checked"))
        n_failed += len(out.get("failedMeters") or {})

    from collections import Counter
    st = Counter(v.get("state") for v in plan.values())
    print(f"복사할 키 {len(plan):,} (상태 {dict(st)}) · 계기 체크(checked) {n_checks:,} · 개별불가 {n_failed:,}")
    print(f"새 키에 이미 기록(건드리지 않음) {len(conflicts):,} · lte 계기 몫이 없어 안 씀 {len(empty):,}")
    print(f"섞인 개소 중 기록 있는 곳 {len(mixed):,}" + (" — --skip-mixed 라 복사 안 함" if a.skip_mixed else " — 복사 계획에 포함"))
    for x in mixed:
        print(f"   {x['key']} · {x['lte']['state']} {x['lte']['updatedAt']} {x['lte']['updatedByName']}"
              f" · lte 체크 {len(x['lte']['checked'])}/{len(x['lteMeters'])} · 미조치 체크 {len(x['michochi']['checked'])}/{len(x['michochiMeters'])}")
    for c in conflicts:
        print(f"   ★충돌 {c['key']} (옛 {c['old']})")
    if a.out:
        Path(a.out).write_text(json.dumps({"plan": plan, "mixed": mixed, "conflicts": conflicts, "empty": empty},
                                          ensure_ascii=False, indent=1), encoding="utf-8")
        print("계획 저장:", a.out)

    if not a.go:
        print("[드라이런] 쓰기 없음 — --go 는 PM")
        return
    # 쓰기 직전 새 키를 다시 본다 — 드라이런 뒤 폰이 새 키에 먼저 쓴 것은 건드리지 않는다
    fresh = _req("GET", WS_PATH, auth=False, query="shallow=true") or {}
    late = [k for k in plan if S.encode_key(k) in fresh]
    for k in late:
        plan.pop(k)
    if late:
        print(f"★쓰기 직전 새 키에 기록이 생겨 뺐다 {len(late)}: {late[:5]}")
    if not plan:
        print("쓸 것 없음")
        return
    body = {S.encode_key(k): v for k, v in plan.items()}
    _req("PATCH", WS_PATH, body)
    print(f"[go] {WS_PATH} 에 {len(body):,}키 씀(옛 키 그대로)")


if __name__ == "__main__":
    main()
