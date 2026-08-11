#!/usr/bin/env python3
"""
트랙2: 기존 건 보강필드 갱신
- 입력: data/계기교체_보강현황_20260528.xlsx + data/site-data.json
- 출력: data/site-data-enriched.json
- site-data.json 인플레이스 수정 금지
"""

import json
import openpyxl
from datetime import datetime

XLSX_PATH = "data/계기교체_보강현황_20260528.xlsx"
SITE_DATA_PATH = "data/site-data.json"
OUTPUT_PATH = "data/site-data-enriched.json"

# 계기번호 [2:4] → 계기타입 매핑
# 미지정 코드(30,85)는 col27 사용, 52/54는 보안계기
METER_TYPE_MAP = {
    "17": "E타입",
    "19": "AE타입",
    "25": "G타입", "26": "G타입", "27": "G타입",
    "45": "G타입", "46": "G타입", "47": "G타입",
    "52": "보안계기", "53": "보안계기", "54": "보안계기", "55": "보안계기",
}


def normalize_meter(v) -> str:
    """계기번호 정규화: str→strip→zfill(11)"""
    if v is None:
        return ""
    s = str(v).strip()
    # float로 읽힌 경우 처리 (e.g. 79450045094.0)
    if "." in s:
        try:
            s = str(int(float(s)))
        except ValueError:
            pass
    return s.zfill(11)


def fmt_date(v) -> str:
    """날짜 변환: datetime→'%Y-%m-%d', None/'#N/A'/''→''"""
    if v is None or v == "#N/A" or v == "":
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if s in ("#N/A", ""):
        return ""
    return s


def fmt_str(v) -> str:
    """일반 문자열 변환"""
    if v is None or v == "#N/A":
        return ""
    return str(v).strip()


def parse_meter_type(meter: str, excel_col27=None) -> str:
    """
    계기번호 [2:4]로 계기타입 파싱.
    미지정 코드면 excel_col27 사용, 그것도 없으면 UNKNOWN:코드 반환.
    """
    if len(meter) < 4:
        return ""
    code = meter[2:4]
    if code in METER_TYPE_MAP:
        return METER_TYPE_MAP[code]
    # 미지정 코드: col27 값 사용
    if excel_col27 and excel_col27 not in (None, "#N/A", ""):
        return str(excel_col27).strip()
    return f"UNKNOWN:{code}"


def main():
    print("=== 트랙2: 기존 건 보강필드 갱신 ===")

    # 1. 엑셀 로드 — col22=='대상' 행만
    print(f"엑셀 로드 중: {XLSX_PATH}")
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    total_excel = len(rows) - 1  # 헤더 제외
    dae_rows = [r for r in rows[1:] if len(r) > 22 and r[22] == "대상"]
    print(f"엑셀 전체: {total_excel:,}건 / 작업대상: {len(dae_rows):,}건")

    # 2. 엑셀 인덱스 구성 (계기번호 → 행)
    excel_index = {}
    dupe_meters = []
    for r in dae_rows:
        meter = normalize_meter(r[21])
        if meter in excel_index:
            dupe_meters.append(meter)
        excel_index[meter] = r  # 마지막 행 우선 (last-wins)

    if dupe_meters:
        print(f"[경고] 엑셀 내 중복 계기번호 {len(dupe_meters)}건 (last-wins 처리):", dupe_meters[:10])
    print(f"엑셀 인덱스 구성 완료: {len(excel_index):,}건")

    # 3. site-data.json 로드
    print(f"\nsite-data.json 로드 중: {SITE_DATA_PATH}")
    with open(SITE_DATA_PATH, encoding="utf-8") as f:
        site_data = json.load(f)
    print(f"site-data 전체: {len(site_data):,}건")

    # 4. 갱신 처리
    matched = 0
    field_update_counts = {
        "DCU장애여부": 0, "교체사유": 0, "검기만료년월": 0,
        "시스템등록일": 0, "계기교체일": 0, "연계수신일": 0,
        "등록소요일": 0, "검침방법": 0, "계기타입": 0,
    }
    fill_empty_counts = {"변대주": 0, "DCUID": 0}
    unknown_type_meters = []
    type_mismatch_flags = []

    result = []
    for rec in site_data:
        meter = normalize_meter(rec.get("계기번호", ""))
        if meter not in excel_index:
            result.append(rec)
            continue

        matched += 1
        r = excel_index[meter]
        new_rec = dict(rec)  # 복사본

        # --- 갱신 필드 (엑셀 최신값 덮어씀) ---
        # col4: DCU장애여부
        v = fmt_str(r[4])
        if v != new_rec.get("DCU장애여부", ""):
            field_update_counts["DCU장애여부"] += 1
        new_rec["DCU장애여부"] = v

        # col5: 교체사유
        v = fmt_str(r[5])
        if v != new_rec.get("교체사유", ""):
            field_update_counts["교체사유"] += 1
        new_rec["교체사유"] = v

        # col7: 검기만료년월
        v = fmt_str(r[7])
        if v != new_rec.get("검기만료년월", ""):
            field_update_counts["검기만료년월"] += 1
        new_rec["검기만료년월"] = v

        # col6: 시스템등록일 (datetime)
        v = fmt_date(r[6])
        if v != new_rec.get("시스템등록일", ""):
            field_update_counts["시스템등록일"] += 1
        new_rec["시스템등록일"] = v

        # col8: 계기교체일 (datetime)
        v = fmt_date(r[8])
        if v != new_rec.get("계기교체일", ""):
            field_update_counts["계기교체일"] += 1
        new_rec["계기교체일"] = v

        # col9: 연계수신일 (datetime)
        v = fmt_date(r[9])
        if v != new_rec.get("연계수신일", ""):
            field_update_counts["연계수신일"] += 1
        new_rec["연계수신일"] = v

        # col12: 등록소요일
        v12 = r[12]
        if v12 is None or v12 == "#N/A":
            v = ""
        else:
            v = str(v12).strip().replace(".0", "")
            if v == "#N/A":
                v = ""
        if v != str(new_rec.get("등록소요일", "")):
            field_update_counts["등록소요일"] += 1
        new_rec["등록소요일"] = v

        # col18: 검침방법
        v = fmt_str(r[18])
        if v != new_rec.get("검침방법", ""):
            field_update_counts["검침방법"] += 1
        new_rec["검침방법"] = v

        # --- 계기타입 재파싱 ---
        col27 = r[27] if len(r) > 27 else None
        new_type = parse_meter_type(meter, col27)
        if new_type.startswith("UNKNOWN:"):
            unknown_type_meters.append((meter, new_type))
            # 기존값 유지
            new_type = new_rec.get("계기타입", "")
        else:
            if new_type != new_rec.get("계기타입", ""):
                field_update_counts["계기타입"] += 1
                type_mismatch_flags.append((meter, new_rec.get("계기타입"), new_type))
        new_rec["계기타입"] = new_type

        # --- fill-empty: 변대주 ---
        if not new_rec.get("변대주", ""):
            col31 = r[31] if len(r) > 31 else None
            v = fmt_str(col31)
            if v:
                new_rec["변대주"] = v
                fill_empty_counts["변대주"] += 1

        # --- fill-empty: DCUID (블록A=col15) ---
        if not new_rec.get("DCUID", ""):
            col15 = r[15] if len(r) > 15 else None
            v = fmt_str(col15)
            if v:
                new_rec["DCUID"] = v
                fill_empty_counts["DCUID"] += 1

        result.append(new_rec)

    # 5. 결과 저장
    print(f"\n결과 저장 중: {OUTPUT_PATH}")
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=None, separators=(",", ":"))
    print(f"저장 완료: {len(result):,}건")

    # 6. 통계 보고
    print("\n=== 통계 ===")
    print(f"전체 레코드: {len(site_data):,}건")
    print(f"매칭 건수: {matched:,}건 (예상 ~10,889)")
    print(f"미매칭(유지): {len(site_data) - matched:,}건")
    print()
    print("필드별 변경 카운트:")
    for field, cnt in field_update_counts.items():
        print(f"  {field}: {cnt:,}건")
    print()
    print("fill-empty로 채운 건수:")
    for field, cnt in fill_empty_counts.items():
        print(f"  {field}: {cnt:,}건")

    if unknown_type_meters:
        print(f"\n[플래그] 미지정 계기타입 코드 {len(unknown_type_meters)}건 (기존값 유지):")
        for m, t in unknown_type_meters[:10]:
            print(f"  계기번호={m}, 코드={t}")

    if type_mismatch_flags:
        print(f"\n계기타입 정정 건수: {field_update_counts['계기타입']:,}건")
        print(f"  샘플 (최대 5건): {type_mismatch_flags[:5]}")

    print("\n=== 완료 ===")


if __name__ == "__main__":
    main()
