#!/usr/bin/env python3
"""25년 미청구 대상 8,994 -> 아미맵 데이터셋 (PM 발주 2026-09-18)

발주서: research/발주_미청구_리스트업_20260918.md

산출
  data/michunggu-data.json     주소 보유 7,366 — 지도용(좌표 있음)
  data/michunggu-pending.json  주소 결손 1,628 — 주 과장 회신 오면 승격

값 출처 = research/미청구_보강_보정_20260918.json (계기키 오염 무효화한 보정판)
  ★awms 회수분(917건)은 **쓰지 않는다** — 발주서가 보정판을 출처로 못박았고
    주소 보유 7,366 / 결손 1,628 도 awms 를 뺀 기준선 수치다.
    awms 를 얹으면 7,366 -> 8,283 이 되므로, 쓸지 말지는 PM 판단이다.

★변대주 필드는 **의미로** 매핑한다 [[bdju_field_meaning_flipped]] —
  아미맵의 `변대주` 는 **전주 이름**('서강간 5')이고 `DCUID` 가 ID 다.
  보정판의 `변대주명` -> `변대주`, `DCU_ID` -> `DCUID`.
  `변대주번호`(8자 코드)는 아미맵에 대응 칸이 없지만 **버리지 않고** 별도 칸으로 남긴다.
★계기번호는 원문 보존 [[meter_no_prefix_preserve]].
★좌표가 실패해도 레코드를 버리지 않는다 — 동 중심(approximate)으로 넣는다.
"""
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import exclusions as EX   # 제외 이력 자동 누적(영준님 2026-09-20)

BOOST = ROOT / 'research/미청구_보강_보정_20260918.json'
# ★9/20 갱신: 9/8 이후 이미 시공된 475계기를 뺀 8,519 목록
PM_LIST = Path('/Users/woodelight/Projects/ami-work/research/미청구_최종대상_계기목록_20260920.txt')
OUT_MAP = ROOT / 'data/michunggu-data.json'
OUT_PEND = ROOT / 'data/michunggu-pending.json'
AWMS = ROOT / 'research/미청구_awms주소회수_20260918.json'

_s = importlib.util.spec_from_file_location(
    'bld', str(ROOT / 'scripts/build_michunggu_boost_20260918.py'))
B = importlib.util.module_from_spec(_s)
_s.loader.exec_module(B)
nm = B.norm_meter

# 합동 빌더의 좌표 파이프라인을 그대로 쓴다(같은 캐시를 공유해 재조회를 아낀다)
_h = importlib.util.spec_from_file_location(
    'hap', str(ROOT / 'scripts/build_hapdong_data.py'))
H = importlib.util.module_from_spec(_h)
_h.loader.exec_module(H)

_r2 = importlib.util.spec_from_file_location(
    'rc2', str(ROOT / 'scripts/미청구-필터역산-재현-20260917.py'))
_R2 = importlib.util.module_from_spec(_r2)
_r2.loader.exec_module(_R2)
H_LOAD = _R2.load_sheet


# ─── 주소 정리 ───────────────────────────────────────────────────────────────
# ★원장 주소에는 '우선_0611_' 같은 **작업 태그**가 앞에 붙어 온다. 주소의 일부가 아니다.
#   떼지 않으면 지오코더가 통째로 못 읽어 좌표가 실패한다(실측 9건 중 8건이 이것이었다).
#   뗀 값은 `주소` 에 넣고, 원문은 `주소_원문` 에 남겨 버리지 않는다.
TAG_RE = re.compile(r'^[가-힣]*_?\d{3,}_\s*')


# ─── 계기번호 오타 제외 (PM 2026-09-20) ─────────────────────────────────────
# 형태 법칙 위반 6건을 MAC·고객번호로 역추적한 결과 4건은 **제대로 된 번호가 이미 처리돼
# 있었다.** 오타본을 그대로 두면 없는 계기를 현장에 보내게 된다.
# ★자동 교정은 하지 않는다 — 정답을 확인한 것만 이름으로 빼고 사유를 남긴다.
# ─── 계기번호 오타 교정 (PM 2026-09-20 재판정) ──────────────────────────────
# 아래 2건은 **제외가 아니라 번호만 고쳐 대상에 남긴다.** 근거:
#   ① 25년 원장에서 오타번호가 **미청구** 상태다(시공일 20260604 · 20260420)
#   ② 정답번호는 원장에 없다 = 25년에 청구된 적이 없다
#   ③ modem_work(awms 26년)에 오타·정답 모두 0행 = 26년 자재로 간 적도 없다
#   ④ 보강현황에서 사라진 것은 계기팀이 26년 3~4월에 **계기를 교체해 LP 가 붙은** 탓이지
#      우리 모뎀이 청구됐다는 뜻이 아니다
#   ⑤ 종암동은 같은 MAC 함체 10계기가 전부 미청구라 어차피 통째로 가야 한다
# ★교정 근거는 같은 MAC · 같은 주소 · 연번 · 보강현황 실재다. 출처를 레코드에 남긴다.
#   이 목록에 없는 형태 위반은 **고치지 마라** — 정답을 특정 못 하면 보류가 맞다.
# ─── 미연계 제외 (영준님 확정 2026-09-20) ───────────────────────────────────
# 과장이 `25년미청구분_v2` Sheet1 에서 빼내 `미연계` 시트로 따로 정리한 개소다(126행·계기 124).
# ★**제외한다.** 과장 의견을 일단 따르고, '미연계' 가 무엇을 뜻하는지는 메일로 따로 묻는다.
#   (한전 대장 미등재인지 · DCU 연계 실패인지 · 청구 라인 제외인지 파일에 근거가 없다.
#    LP 는 126건 중 125건이 정상이라 모뎀은 돌고 있고, 전부 '신규' 시공 기록이 있다.)
# ★되살릴 수 있게 제외분 전체를 research/미청구_미연계제외_20260920.json 에 남긴다 —
#   답이 오면 이 플래그를 False 로 되돌리면 그대로 복귀한다.
EXCLUDE_MIYEONGYE = True
MIYEONGYE_TABLE = '미연계'
MIYEONGYE_OUT = ROOT / 'research/미청구_미연계제외_20260920.json'

METER_TYPO_FIX = {
    '4719B160548': ('47198160548', 'MAC E0AEED95323B · 성북구 종암동 125-40'),
    '3919048106A': ('39190481064', 'MAC 847207B592E2 · 성북구 석관동 334-63'),
}

METER_TYPO_EXCLUDE = {
    '0753G186525': '정답 07530186525 — 원장 상태 청구완료',
    '071909442S1': '정답 02190944829 — awms 에 신설 2행·2026-09-08 개통',
    '2450090698': '정답 02450090698 — 원장 상태 청구완료',
    '9419007057': '정답 94199007057 — 같은 주소(중구 신당동 304-488)에 정상 번호가 이미 대상',
}


def clean_addr(a):
    return TAG_RE.sub('', str(a or '')).strip()


GU_RE = re.compile(r'(서울특별시\s*[가-힣]+구)')


def gu_of(a):
    m = GU_RE.search(str(a or ''))
    return m.group(1) if m else ''


# ─── 현장 필드 보강 (PM 발주 2026-09-18) ────────────────────────────────────
# ★매칭키는 **고객번호 · 모뎀MAC** 만 쓴다. 계기번호 단독 교차매칭은 금지다 —
#   계기가 재사용돼 같은 번호가 딴 개소에 살아 있어 오염이 17~51% 다(실측).
# ★원장 필드는 예외다. '그 계기의 미청구 원장 행'에서 가져오므로 **교차매칭이 아니라
#   같은 레코드의 다른 칸**을 읽는 것이다(우리 8,994 가 바로 그 행들에서 나왔다).
# ★modem_work 는 쓰지 않는다 — 26년 시공분이고, 그 계기들은 애초에 대상에서 뺐다.
# ★못 채운 것은 빈칸으로 둔다. 추정으로 메우지 않는다.
LEDGER_EXTRA = {
    'N': '계기번호', 'O': '상태', 'R': 'MAC', 'AS': '고객번호',
    'S': '시설형태', 'T': 'M/S', 'U': '집단', 'V': '485타입', 'W': '케이블',
    'X': '커넥터', 'Y': '신호레벨', 'AF': '시공자', 'AG': '추가계기',
    'AI': '비고1', 'AJ': '비고2', 'AK': '앱변대주', 'D': '시공일',
}
# ★AH(지도구분)은 넣지 않는다 — 원장 287,860행 전체에서 **값이 0건**인 빈 열이다(실측).
#   Y(신호레벨)는 요청 항목이라 칸은 두되, 원장 전체에 6건뿐이고 미청구에는 0건이다.
LEDGER_FIELDS = ['시설형태', 'M/S', '집단', '485타입', '케이블', '커넥터', '신호레벨',
                 '시공자', '추가계기', '비고1', '비고2', '앱변대주']
# boranggi 에서 고객번호(또는 MAC)로 끌어오는 것. 값마다 <필드>출처 를 따로 남긴다.
# ★DCU 필드 정책 (영준님 2026-09-18 최종: "회선여부나 장애 같은 것은 DCU DB 에 반영해라")
#   **DCU 상태값을 리스트마다 복사해 박지 않는다.** dcu_all 이 단일 출처이고,
#   리스트는 `DCUID` 로 조인해서 본다(data/dcu-db.json + js/dcu-db.js).
#   싣는다   — DCUID(조인 키) · dcu_철거예정(+딸린 dcu_잔여호수·dcu_전체호수)
#   안 싣는다 — DCU회선상태 · DCU장애여부 계열. 상태는 조인해서 읽는다.
#              (상태를 복사해 두면 dcu_all 이 갱신돼도 리스트가 옛 값을 들고 있게 된다)
BORANGGI_FIELDS = ['인입주', '공동주택명', '상호', '계약종별', '검침방법']
DCU_FIELDS = []   # 상태값은 싣지 않는다 — DCUID 로 조인한다


def blank(v):
    s = str(v if v is not None else '').strip()
    return '' if s.upper() in ('', '0', 'NAN', 'NONE', '#N/A', 'NAT') else s


def build_ledger_extra():
    """계기 -> 원장 미청구 행에서 뽑은 현장 필드. 최신 시공일 행의 값을 우선한다."""
    L = H_LOAD(str(B.XL), 'xl/worksheets/sheet1.xml', LEDGER_EXTRA, '원장(현장필드)')
    mc = L[L['상태'] == '미청구']
    per = {}
    for r in sorted(mc.to_dict('records'), key=lambda x: str(x.get('시공일') or ''), reverse=True):
        m = nm(r.get('계기번호'))
        if not m:
            continue
        d = per.setdefault(m, {})
        for f in LEDGER_FIELDS:
            if not d.get(f):
                v = blank(r.get(f))
                if v:
                    d[f] = v
    return per


def build_boranggi_index():
    """고객번호 -> boranggi 현장 필드. 신선한 판부터 넣어 먼저 넣은 값이 이긴다.
    MAC 색인도 같이 만든다(고객번호가 없는 건의 보조키)."""
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    c = con.cursor()
    by_cust, by_mac = {}, {}
    snaps = [r[0] for r in c.execute(
        'SELECT DISTINCT snapshot FROM boranggi ORDER BY snapshot DESC')]
    for sn in snaps:
        for (cust, ipju, apt, sangho, cls, dcufault, chim, chim2, mac, mac2) in c.execute(
                'SELECT 고객번호,인입주,공동주택명,상호명,계약종별,"DCU 장애여부",'
                '검침방법,검침방법_2,"모뎀 MAC","모뎀 MAC_2" FROM boranggi WHERE snapshot=?', (sn,)):
            rec = {'인입주': blank(ipju), '공동주택명': blank(apt), '상호': blank(sangho),
                   '계약종별': blank(cls), 'DCU장애여부': blank(dcufault),
                   '검침방법': blank(chim2) or blank(chim)}
            rec = {k: v for k, v in rec.items() if v}
            if not rec:
                continue
            src = f'boranggi:{sn}'
            cu = B.norm_cust(cust)
            if cu and cu not in by_cust:
                by_cust[cu] = (rec, src)
            for mm in (B.norm_mac(mac2), B.norm_mac(mac)):
                if mm and mm not in by_mac:
                    by_mac[mm] = (rec, src)
    dcu_no, dcu_id = {}, {}
    for did, no, line, fault in c.execute(
            'SELECT "DCU ID",변대주번호,회선상태,장애여부 FROM dcu_all'):
        rec = {'DCU회선상태': blank(line), 'DCU장애여부_대장': blank(fault)}
        n8 = B.norm_bdju_no(no)
        d10 = B.norm_dcuid(did)
        if n8 and n8 not in dcu_no:
            dcu_no[n8] = rec
        if d10 and d10 not in dcu_id:
            dcu_id[d10] = rec
    con.close()
    log(f'boranggi 색인 고객번호 {len(by_cust):,} · MAC {len(by_mac):,}'
        f' · dcu_all 변대주 {len(dcu_no):,}')
    return by_cust, by_mac, dcu_no, dcu_id


# ─── 전수 재보강 (PM 발주 2026-09-18) ────────────────────────────────────────
# 왜: 1차 보강은 boranggi 를 **고객번호가 있는 건에만** 걸었고, 필드도 빈 칸 위주로만 봤다.
#     그래서 원장 주소를 가진 5,899건이 오히려 부실했다(인입주 55% vs 고객번호로 찾아온
#     824건은 93%). **주소가 있다고 다른 리스트를 안 본 것**이 원인이다.
# 규칙(영준님)
#   ① 키는 고객번호 우선 -> 모뎀MAC 보조. **계기번호 단독 금지**(재사용 오염 17~51%)
#   ② 빈 칸만 채운다. 값이 있으면 덮지 않는다(원장 값 우선)
#   ③ 값이 있는데 소스가 **다른 값**을 주면 덮지 말고 <필드>_대안 에 따로 남긴다
#   ④ 보강현황은 판이 여럿이라 최신판부터 훑고 출처에 판 날짜를 남긴다
# ★`DCUID`·`변대주번호` 를 뺐다(영준님 2026-09-20 사고 후).
#   상단 변대주 영역의 원천은 **dcu_master 하나뿐**이다([[bdju_field_purpose_dcu]]).
#   resweep 이 boranggi·한전회신을 **MAC/고객번호 키로** 훑어 DCUID 를 심어 놓으면,
#   그 뒤 fix_bdju 가 그 값을 **조회 키로 써서 남의 변대주를 끌어온다** — 실측 2026-09-20:
#   345건이 'DCUID 앞8 != 변대주번호' 였고 그중 82건은 DCUID 자체가 다른 개소 것이었다
#   (예 갈현간 61R2R1 은 대장 9629S81200 인데 한전회신 MAC 경유로 3800531841 이 박혔다).
#   변대주**명**은 남긴다 — 대장 조회 키로 쓰이고, 못 찾아도 전주 표찰 이름은 현장에서 쓴다.
RESWEEP_FIELDS = ['인입주', '공동주택명', '상호', '계약종별', '변대주',
                  '검침방법', '도로명주소']

# ─── 매칭 축 분리 원칙 (영준님 2026-09-18) ──────────────────────────────────
# "변대주명 매칭 · 전산화번호(변대주번호) 매칭 · DCUID 매칭 — 끼리끼리 해야만 한다."
#   축을 넘나들며 유도하지 마라. 이름으로 찾은 것에 번호를 붙이거나, DCUID 앞 8자리로
#   변대주번호를 만들어 본값에 넣는 식은 금지다.
#   ★축을 넘을 수밖에 없으면 그 값은 **<필드>_유도** 에 넣고 본값에 섞지 않는다.
#   ★검증 불가한 유도값은 값을 빼고 출처만 남긴다 — 빈칸이 틀린 값보다 낫다.
# ※실측 2026-09-18: 대장(dcu_master 19,007) 안에서는 'DCU_ID 앞 8자리 == 변대주번호'가
#   19,007/19,007 로 **예외가 없다.** 그래도 대장에 없는 DCUID 에 그 규칙을 적용한 값은
#   확인할 길이 없으므로 본값에 넣지 않는다.
CROSS_MARK = ('역산', '규칙/', '앞8')


def split_cross_axis(rows):
    """축을 넘어 유도된 값을 본값에서 빼 <필드>_유도 로 옮긴다.

    ★어느 필드를 옮길지 주의. 보정판이 `변대주출처` 한 칸에 **번호의 출처를 먼저** 담는다
      (t['출처']['변대주번호'] or t['출처']['변대주명']). 그래서 거기 붙은 '역산/규칙' 표시는
      사실상 **변대주번호**의 내력이다. 이름(`변대주`)을 지우면 안 된다 —
      처음에 그렇게 짰다가 이름 6,941 -> 5,933 으로 떨어지는 걸 보고 잡았다.
    """
    moved, dropped = Counter(), Counter()
    for x in rows:
        # (본값 필드, 출처가 실린 칸)
        for f, srcfield in (('변대주번호', '변대주출처'), ('DCUID', 'DCUID출처')):
            src = x.get(srcfield) or ''
            if not any(k in src for k in CROSS_MARK):
                continue
            v = x.get(f)
            if not v:
                continue
            if '대장미확인' in src:
                # 대장에 없는 DCUID 로 만든 값 — 확인할 방법이 없다. 값을 버리고 출처만 남긴다
                x[f] = ''
                x[f + '출처'] = src + ' /검증불가라 값 제거'
                dropped[f] += 1
            else:
                x[f + '_유도'] = v
                x[f + '_유도출처'] = src
                x[f] = ''
                x[f + '출처'] = ''
                moved[f] += 1
    return moved, dropped


ROAD_RE = re.compile(r'[가-힣0-9]+(?:로|길)\d*[가-힣]*\s*\d')


def _norm_cmp(v):
    return re.sub(r'\s+', '', str(v or '')).upper()


# ─── 제외축: 고객번호 경유 26년 신설 (영준님 2026-09-20) ─────────────────────
# 우리 계기가 modem_work_all 에 **직접 없어도**, 고객번호로 보강현황을 거쳐 그 개소의
# 다른 계기번호를 찾고 그 계기가 awms 에 있으면 '26년에 시공된 개소' 다.
# 계기가 교체돼 번호가 바뀐 경우가 이렇게 잡힌다(modem_work_all 에 고객번호 열이 없어
# boranggi 를 다리로 쓴다).
#
# ★다리는 boranggi 의 **`계기번호`(철거 쪽) 열만** 쓴다. `계기번호_2` 는 계기팀이 26년에
#   새로 단 계기라 그걸로 이으면 과잉 매칭이 된다 — 실측 2026-09-20: `_2` 를 함께 쓰면
#   57건(신설 33)이 되는데 늘어난 9건이 전부 **방학동 715-7 한 덩어리**였다.
#   철거 열만 쓰면 48건(신설 24 · 기설 24)으로 PM 실측과 정확히 맞는다.
#   [[boranggi_meter_column_pair_removed_new]]
#
# ★**신설만 제외하고 기설은 절대 빼지 않는다**(영준님).
#   신설 = 기존모뎀MAC 이 23/24 에서 바뀌었다 = 26년에 모뎀을 새로 달았다 -> 우리 대상 아님.
#   기설 = MAC 이 23/24 그대로다 = **우리가 갈아야 할 25년 모뎀에 26년에 계기를 추가로 물린 것**.
#          그 모뎀은 여전히 25년 자재라 우리 대상이고, 오히려 계기가 늘어 작업량이 커졌다.
#          (관련 MAC 11개에 우리 계기 30건이 매달려 있고 그중 마스터는 1건뿐이다 —
#           현장에서 모뎀 교체 시 붙은 계기를 전부 재결합해야 한다.)
# ─── 제외축: 계기번호 타입코드 오류 (영준님 2026-09-20 "계기번호 오류면 다 빼") ────
# 계기번호 3~4번째가 **타입코드**다. 대장(boranggi)에 단 한 번도 안 나오는 코드면 오타다.
# ★형태 게이트(^[0-9A-Z]{2}[0-9]{9}$)로는 안 걸리는 종류다 — 자릿수·형태는 멀쩡하다.
# ★코드 집합을 하드코딩하지 않는다. 대장에서 뽑아 쓴다 — 새 타입이 생기면 따라간다.
#   대신 **표본이 적은 코드(5건 미만)는 로그로 찍어** 사람이 보게 한다. 대장에 몇 건 있다고
#   무조건 정상은 아니고, 거기도 오타가 섞여 있을 수 있기 때문이다.
# ★번호를 고치지 않는다 — 빼기만 한다. 추정으로 고치면 없는 계기를 만든다
#   (07510112531 은 고객번호 경유로 07530112533 이 보이지만 그래도 교정하지 않는다).
METER_CODE_RARE_N = 5
METER_CODE_OUT = ROOT / 'research/계기번호오류제외_20260920.json'


def meter_code_index():
    """(대장 실재 타입코드 집합, 표본 적은 코드 dict, 고객번호->대장 계기 dict)"""
    import sqlite3
    from collections import defaultdict
    con = sqlite3.connect(ROOT / 'data/ami.db')
    c = con.cursor()
    seen = Counter()
    by_cust = defaultdict(set)
    for cust, m1, m2 in c.execute('SELECT 고객번호,계기번호,계기번호_2 FROM boranggi'):
        cu = B.norm_cust(cust)
        for m in (m1, m2):
            s = str(m or '').strip()
            if len(s) >= 4 and _re2.fullmatch(r'\d{2}', s[2:4]):
                seen[s[2:4]] += 1
            v = nm(m)
            if cu and v:
                by_cust[cu].add(v)
    con.close()
    rare = {k: v for k, v in sorted(seen.items()) if v < METER_CODE_RARE_N}
    log(f'대장 타입코드 {len(seen)}종 — ' + ' · '.join(f'{k}:{v:,}' for k, v in sorted(seen.items())))
    if rare:
        log(f'  ★표본 {METER_CODE_RARE_N}건 미만이라 사람이 볼 코드: {rare}'
            f'  (대장에 있다고 무조건 정상은 아니다)')
    return set(seen), rare, by_cust


def meter_code_bad(rows, idx=None):
    """타입코드가 대장에 없는 건 + 판정근거. 반환 [(row, 근거dict)]"""
    real, _rare, by_cust = idx or meter_code_index()
    out = []
    for r in rows:
        m = str(r.get('계기번호') or '').strip()
        code = m[2:4]
        if code in real:
            continue
        # 고객번호로 대장을 거치면 정답이 보이는가 — 근거로만 적고 **고치지는 않는다**
        cu = B.norm_cust(r.get('고객번호'))
        cand = sorted(x for x in by_cust.get(cu or '', ()) if x != nm(m))
        out.append((r, {'타입코드': code,
                        '판정근거': ('대장 0건 · 고객번호 경유 정답 후보 있음'
                                     if cand else '대장 0건 · 정답 못 찾음'),
                        '고객번호경유_후보': cand}))
    return out


def meter_code_write(list_name, bad):
    """제외분 기록. 두 빌더가 따로 도니 자기 리스트 몫만 갈아끼운다."""
    prev = []
    if METER_CODE_OUT.exists():
        try:
            prev = [x for x in json.loads(METER_CODE_OUT.read_text())
                    if x.get('리스트') != list_name]
        except Exception:
            prev = []
    rows = [{'리스트': list_name, '계기번호': r.get('계기번호'), '타입코드': ev['타입코드'],
             '계기타입': r.get('계기타입'), '고객번호': r.get('고객번호'),
             '모뎀MAC': r.get('모뎀MAC'), '주소': r.get('주소'), '지사': r.get('지사'),
             '판정근거': ev['판정근거'], '고객번호경유_후보': ev['고객번호경유_후보'],
             # 되살리기용
             '도로명주소': r.get('도로명주소'), '변대주': r.get('변대주'),
             'DCUID': r.get('DCUID'), '최종시공일': r.get('최종시공일'),
             '불가사유': r.get('불가사유'), '불가상세': r.get('불가상세')}
            for r, ev in bad]
    METER_CODE_OUT.write_text(json.dumps(prev + rows, ensure_ascii=False, indent=1))


# ─── 제외축: 기설(이미 설치됨) · 계기교체됨 — 영준님 2026-09-21 ──────────────
# 현장이 불가사유·불가상세에 "이미 설치돼 있다" 고 적은 건. 우리가 또 갈 일이 없다.
# ★판정은 (불가사유+불가상세)를 **공백 제거해** 이어붙인 문자열로 한다 —
#   '6차 기설치' · 'LTE 기설치' 처럼 띄어쓰기 변형이 실제로 있다.
# ★**오타 변형까지 잡는다.** 고유문구 346종을 전수로 훑어 찾았다:
#   '기시설' 4건 · 'LTE기서치' 1건. 좁은 정규식이었으면 통째로 놓쳤을 것들이다.
# ★'기타cnu1차' 는 **빼지 않는다** — 씨앤유 계기 건이지 기설이 아니다(실측 18건, 0건 매칭).
GISUL_RE = re.compile(r'기설|기시설|기서치|긷설')
GISUL_EXACT = re.compile(r'^기타6차$')      # '6차기설치' 축약. 영준님 '6차' 지시
# 계기가 이미 교체된 건. ★B6(25년 청구 겹침)와 **축을 가른다** —
#   B6 는 '원장에 청구된 다른 계기가 있다' 는 외부 근거가 붙은 2조건 판정이고,
#   여기는 **현장 문구뿐**이다. 근거 강도가 다르니 나중에 되살릴 때 구분돼야 한다.
SWAPPED_RE = re.compile(r'계기교체|교체계기|>>')


def _flat_reason(x):
    return _re2.sub(r'\s+', '', f"{x.get('불가사유') or ''} {x.get('불가상세') or ''}")


def gisul_bad(rows):
    """[(row, 걸린 문구)] — 기설 계열 + '기타6차'"""
    out = []
    for x in rows:
        s = _flat_reason(x)
        mm = GISUL_RE.search(s) or GISUL_EXACT.match(s)
        if mm:
            out.append((x, mm.group(0)))
    return out


def swapped_bad(rows):
    """[(row, 걸린 문구)] — 계기교체됨"""
    out = []
    for x in rows:
        mm = SWAPPED_RE.search(_flat_reason(x))
        if mm:
            out.append((x, mm.group(0)))
    return out


# ─── 제외축: 25년 청구 겹침 (고객번호 경유) — 영준님 2026-09-21 ────────────
# 같은 고객번호에 25년에 **이미 청구된 다른 계기**가 있고, 현장도 불가상세에
# '교체·기설치' 라고 적은 건. 그 개소는 이미 해결돼 우리가 또 갈 일이 없다.
# ★둘 중 **하나만으로는 빼지 않는다.** 겹침만 있는 21건은 근거가 부족하다
#   (기계식 4 · 문잠김/주차 5 · 계기못찾음 8 · 기타 4) — 다른 계기가 청구됐을 뿐일 수 있다.
# ★가장 강한 증거는 **현장이 적은 번호가 원장 청구 계기와 글자까지 같은** 경우다
#   (37450092655 -> 79450047940 · 02450085783 -> 25450129899).
BILLED_SWAP_RE = re.compile(r'기설치|계기교체|계기변경|교체기설')
LEDGER_TABLE = '20260227다운로드_2025_03_24에서2026_0'
LEDGER_STATE_COL = 'col_15'      # ★엑셀 O열인데 헤더가 비어 이 이름으로 적재됐다


def billed_index():
    """고객번호 -> 상태=청구 인 계기 집합 (원장)"""
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    out = {}
    for cust, m, st in con.execute(
            f'SELECT 고객번호,계기번호,{LEDGER_STATE_COL} FROM "{LEDGER_TABLE}"'):
        if str(st or '').strip() != '청구':
            continue
        cu = B.norm_cust(cust)
        v = nm(m)
        if cu and v:
            out.setdefault(cu, set()).add(v)
    con.close()
    log(f'원장 청구 색인 — 고객번호 {len(out):,}')
    return out


def billed_overlap_bad(rows, idx=None):
    """반환 [(row, 근거dict)] — 겹침 AND 교체표현 둘 다일 때만."""
    idx = idx if idx is not None else billed_index()
    out = []
    for x in rows:
        cu = B.norm_cust(x.get('고객번호'))
        if not cu:
            continue
        others = sorted(v for v in idx.get(cu, ()) if v and v != nm(x.get('계기번호')))
        if not others:
            continue
        s = _re2.sub(r'\s+', '', f"{x.get('불가사유') or ''} {x.get('불가상세') or ''}")
        mm = BILLED_SWAP_RE.search(s)
        if not mm:
            continue
        out.append((x, {'청구계기': others, '표현': mm.group(0)}))
    return out


# ─── 제외축: S(표준형) 계기 (영준님 2026-09-20 "S타입 표준형이면 다 빼") ──────
# ★판정은 **계기타입 문자열**이다 — 타입코드가 아니다.
#   타입코드로 걸면 틀린다: 실측 37건이 코드 35(32) · 15(3) · 34(1) · 14(1) 로 흩어져 있고,
#   그 코드들은 다른 타입 계기도 함께 쓴다(코드와 타입은 1:1 이 아니다).
# ★표기가 흔들린다 — 우리 원장은 'S', 보강현황은 '표준형' 이다. 둘 다 잡는다.
#   ※'S' 로 **시작**하는 다른 타입이 있는지 전 데이터셋을 확인했다(없다). 그래서 정확 일치로 건다 —
#     부분일치로 걸면 나중에 'SMGW' 같은 값이 들어올 때 조용히 같이 빠진다.
STANDARD_TYPES = {'S', '표준형', 'S타입', '표준형계기'}
STANDARD_OUT = ROOT / 'research/S표준형제외_20260920.json'


def standard_type_bad(rows):
    """계기타입이 S(표준형)인 건. 반환 [(row, 타입원문)]"""
    out = []
    for r in rows:
        v = str(r.get('계기타입') or '').strip()
        if v.upper().replace(' ', '') in {x.upper() for x in STANDARD_TYPES}:
            out.append((r, v))
    return out


def standard_type_write(list_name, bad):
    """제외분 기록. 두 빌더가 따로 도니 자기 리스트 몫만 갈아끼운다."""
    prev = []
    if STANDARD_OUT.exists():
        try:
            prev = [x for x in json.loads(STANDARD_OUT.read_text())
                    if x.get('리스트') != list_name]
        except Exception:
            prev = []
    rows = [{'리스트': list_name, '계기번호': r.get('계기번호'),
             '타입코드': str(r.get('계기번호') or '')[2:4], '계기타입': v,
             '고객번호': r.get('고객번호'), '주소': r.get('주소'), '지사': r.get('지사'),
             # 되살리기용
             '도로명주소': r.get('도로명주소'), '변대주': r.get('변대주'),
             'DCUID': r.get('DCUID'), '최종시공일': r.get('최종시공일'),
             '불가사유': r.get('불가사유'), '불가상세': r.get('불가상세')}
            for r, v in bad]
    STANDARD_OUT.write_text(json.dumps(prev + rows, ensure_ascii=False, indent=1))


# ─── 제외축: 계기번호 오류 계열 (영준님 2026-09-20 "필터해") ─────────────────
# 불가사유·불가상세에 **현장이 '번호가 틀렸다' 고 적어 보낸** 건이다.
# ★판정은 (불가사유 + 불가상세)를 **공백 전부 제거해 이어붙인 문자열**로 한다 —
#   '계기번호 불일치' · '계기번호불일치' 처럼 띄어쓰기가 제각각이라 그대로 두면 절반을 놓친다.
# ★우선순위대로 **첫 매칭에서 멈춘다.** 한 건이 여러 문구를 갖고 있어도 한 유형으로만 센다.
# ★'주소불일치' 는 분류만 하고 **빼지 않는다** — 계기번호 문제가 아니라 주소가 틀린 것이라
#   주소만 맞으면 작업한다.
METER_ERR_RULES = [
    ('오계기',        re.compile(r'오계기')),
    ('계기번호오류',   re.compile(r'계기번호오류|계기번호.{0,4}오류|실계기.{0,6}오류')),
    ('각인번호오류',   re.compile(r'각인번호오류|각인.{0,4}오류')),
    ('계기번호불일치', re.compile(r'계기번호불일치|계기불일치|지도계기번호')),
    # ★오타·다른 표현까지 잡는다(영준님 2026-09-21 "비스무리한것도 다 서치해야해").
    #   첫 판 정규식이 '오계기' 는 잡고 '오게기'·'오계ㅊ' 같은 오타와
    #   '계기번호틀림/오입력/오타' 는 못 잡아 5건을 놓쳤다.
    ('계기번호오타표기', re.compile(r'오게기|오계ㅊ|계기번호틀림|계기번호오입력|계기번호오타')),
    ('주소불일치',     re.compile(r'주소불일치')),
]
METER_ERR_DROP = {'오계기', '계기번호오류', '각인번호오류', '계기번호불일치',
                  '계기번호오타표기'}
METER_ERR_OUT = ROOT / 'research/계기번호오류계열제외_20260920.json'
# 현장이 상세 칸에 적어 놓은 **실제 계기번호**. 11자리만 긁는다.
#   ★리스트를 이 번호로 고치지 않는다 — 담기만 한다(영준님). 추정으로 고치면 없는 계기를 만든다.
_M11 = re.compile(r'(?<![0-9])([0-9]{11})(?![0-9])')


def meter_err_kind(r):
    s = re.sub(r'\s+', '', f"{r.get('불가사유') or ''} {r.get('불가상세') or ''}")
    for name, rx in METER_ERR_RULES:
        if rx.search(s):
            return name
    return ''


_METER_FORM = re.compile(r'^[0-9A-Z]{2}[0-9]{9}$')
_field_hint_codes = None


def field_meter_hint(r, real_codes=None):
    """상세 칸에서 원본과 **다른** 11자리 번호를 뽑아 갈라 담는다.

    반환 = (계기번호 후보 문자열, 모뎀MAC 후보 문자열) — 없으면 ''.

    ★11자리만 긁으면 **모뎀 MAC 이 계기번호 칸에 섞인다**(실측 2026-09-20: 6건).
      현장이 '기설치 01230201260' 처럼 MAC 을 적어 보내기 때문이다. 게이트 둘을 건다:
        ① '012' 로 시작하면 계기번호가 아니라 **MAC** 이다 -> 따로 담는다.
           ★MAC 은 11·12 자리가 섞이니 zfill 금지 [[boranggi_mac_restore_and_amigo_wireless]].
        ② 계기 형태 법칙 통과 + **타입코드가 대장 실재 집합에 있을 때만** 계기번호로 담는다.
           집합은 meter_code_index() 가 대장에서 뽑아 쓰는 그것이다(하드코딩 금지).
      어느 쪽도 아니면 **담지 않는다.** 원문은 불가상세에 그대로 있으니 잃는 것이 없다
      (실측: 타입코드 72 인 84720704975 한 건이 이렇게 걸러진다).
    """
    global _field_hint_codes
    if real_codes is None:
        if _field_hint_codes is None:
            _field_hint_codes = meter_code_index()[0]
        real_codes = _field_hint_codes
    s = f"{r.get('불가사유') or ''} {r.get('불가상세') or ''}"
    me = str(r.get('계기번호') or '').strip()
    meters, macs = [], []
    for x in dict.fromkeys(_M11.findall(s)):
        if x == me:
            continue
        if x.startswith('012'):
            macs.append(x)
        elif _METER_FORM.match(x) and x[2:4] in real_codes:
            meters.append(x)
    return ' / '.join(meters), ' / '.join(macs)


def meter_err_bad(rows):
    """제외 대상 [(row, 유형)]. 주소불일치는 빼지 않으므로 여기 안 들어온다."""
    return [(r, k) for r in rows
            if (k := meter_err_kind(r)) in METER_ERR_DROP]


def meter_err_write(list_name, bad):
    prev = []
    if METER_ERR_OUT.exists():
        try:
            prev = [x for x in json.loads(METER_ERR_OUT.read_text())
                    if x.get('리스트') != list_name]
        except Exception:
            prev = []
    rows = [{'리스트': list_name, '유형': k, '계기번호': r.get('계기번호'),
             '현장계기번호_추정': field_meter_hint(r)[0],
             '현장모뎀MAC_추정': field_meter_hint(r)[1],
             '고객번호': r.get('고객번호'), '주소': r.get('주소'), '지사': r.get('지사'),
             '불가사유': r.get('불가사유'), '불가상세': r.get('불가상세'),
             # 되살리기용
             '도로명주소': r.get('도로명주소'), '변대주': r.get('변대주'),
             'DCUID': r.get('DCUID'), '계기타입': r.get('계기타입')}
            for r, k in bad]
    METER_ERR_OUT.write_text(json.dumps(prev + rows, ensure_ascii=False, indent=1))


# 원장 변대주번호 칸의 **미입력 표기** — 전산화번호가 아니다. 디테일에도 싣지 않는다.
LEDGER_NO_EMPTY = {'LTEDCUSU', 'LTEDCU', 'NONE', 'NULL', '-'}

VIA_CUST_DROP_KINDS = ('신설',)
VIA_CUST_OUT = ROOT / 'research/미청구_고객번호경유_26년신설제외_20260920.json'


def via_cust_write(list_name, drop, keep):
    """제외분 기록. 두 빌더가 따로 도니 **자기 리스트 몫만 갈아끼우고 남은 건 보존**한다."""
    prev = []
    if VIA_CUST_OUT.exists():
        try:
            prev = [x for x in json.loads(VIA_CUST_OUT.read_text())
                    if x.get('리스트') != list_name]
        except Exception:
            prev = []
    def row(r, ev, act):
        return {'리스트': list_name, '처리': act,
                '계기번호': r.get('계기번호'), '고객번호': r.get('고객번호'),
                'awms계기': ev['awms계기'], '작업일': ev['작업일'],
                '작업구분': ev['작업구분'], 'MAC': ev['MAC'],
                '주소': r.get('주소'), '지사': r.get('지사'),
                # 되살리기용 — 원본 레코드의 주요 필드
                '변대주': r.get('변대주'), '변대주번호': r.get('변대주번호'),
                '모뎀MAC': r.get('모뎀MAC'), '최종시공일': r.get('최종시공일')}
    out = prev + [row(r, ev, '제외') for r, ev in drop] \
               + [row(r, ev, '유지(기설 — 25년 모뎀에 계기 추가)') for r, ev in keep]
    VIA_CUST_OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    return len(out)


def via_cust_26_index():
    """(고객번호 -> 철거계기 집합, awms 계기 -> (작업일, 작업구분, MAC, 지사))"""
    import sqlite3
    from collections import defaultdict
    con = sqlite3.connect(ROOT / 'data/ami.db')
    c = con.cursor()
    bridge = defaultdict(set)
    for cust, m in c.execute('SELECT 고객번호,계기번호 FROM boranggi'):
        cu, v = B.norm_cust(cust), nm(m)
        if cu and v:
            bridge[cu].add(v)
    aw = {}
    for m, day, kind, mac, jisa in c.execute(
            'SELECT 계기번호_norm,작업일자,작업구분,기존모뎀MAC,지사 FROM modem_work_all'):
        if m and m not in aw:
            aw[m] = (day, kind, mac, jisa)
    con.close()
    log(f'고객번호경유 색인 — 다리(고객번호) {len(bridge):,} · awms 고유계기 {len(aw):,}')
    return bridge, aw


def via_cust_26_hits(rows, bridge=None, aw=None):
    """rows(레코드 리스트) 중 고객번호 경유로 26년 시공이 확인된 건.

    반환 = (제외 대상 [(row, 근거)], 유지 [(row, 근거)]) — 유지는 기설이라 **빼지 않는다**.
    """
    if bridge is None or aw is None:
        bridge, aw = via_cust_26_index()
    drop, keep = [], []
    for r in rows:
        me, cu = nm(r.get('계기번호')), B.norm_cust(r.get('고객번호'))
        if not cu or me in aw:          # 계기번호로 직접 걸리는 건 다른 축이 잡는다
            continue
        for other in sorted(bridge.get(cu, ())):
            if other == me or other not in aw:
                continue
            day, kind, mac, jisa = aw[other]
            ev = {'awms계기': other, '작업일': day, '작업구분': kind, 'MAC': mac, 'awms지사': jisa}
            (drop if kind in VIA_CUST_DROP_KINDS else keep).append((r, ev))
            break
    return drop, keep


def build_resweep_index():
    """[(출처명, by_cust, by_mac)] — 우선순위 순(먼저 온 것이 이긴다)."""
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    c = con.cursor()
    out = []

    snaps = [r[0] for r in c.execute(
        'SELECT DISTINCT snapshot FROM boranggi ORDER BY snapshot DESC')]
    for sn in snaps:
        bc, bm = {}, {}
        for (cust, ipju, apt, sangho, cls, fault, chim, chim2,
             did, did2, bdju, road, mac, mac2) in c.execute(
                'SELECT 고객번호,인입주,공동주택명,상호명,계약종별,"DCU 장애여부",'
                '검침방법,검침방법_2,"DCU ID","DCU ID_2",변대주,도로명,'
                '"모뎀 MAC","모뎀 MAC_2" FROM boranggi WHERE snapshot=?', (sn,)):
            d10 = B.norm_dcuid(did2) or B.norm_dcuid(did)
            rec = {'인입주': blank(ipju), '공동주택명': blank(apt), '상호': blank(sangho),
                   '계약종별': blank(cls),
                   '검침방법': blank(chim2) or blank(chim),
                   'DCUID': d10, '변대주': blank(bdju),
                   # ★변대주번호를 DCU ID 앞 8자리로 만들지 않는다(축 넘기 금지).
                   #   boranggi 에는 변대주번호 열이 없으므로 여기서는 채우지 않는다.
                   '도로명주소': blank(road)}
            rec = {k: v for k, v in rec.items() if v}
            if not rec:
                continue
            cu = B.norm_cust(cust)
            if cu:
                bc.setdefault(cu, rec)
            for mm in (B.norm_mac(mac2), B.norm_mac(mac)):
                if mm:
                    bm.setdefault(mm, rec)
        out.append((f'boranggi:{sn}', bc, bm))

    # site-data(실효) — 같은 스키마 계열이라 필드가 그대로 맞는다
    sc, sm = {}, {}
    sd = ROOT / 'data/site-data.json'
    if sd.exists():
        for x in json.loads(sd.read_text()):
            rec = {'인입주': blank(x.get('인입주')), '공동주택명': blank(x.get('공동주택명')),
                   '상호': blank(x.get('상호')), '계약종별': blank(x.get('계약종별')),
                   'DCUID': B.norm_dcuid(x.get('DCUID')), '변대주': blank(x.get('변대주')),
                   '검침방법': blank(x.get('검침방법')),
                   '도로명주소': blank(x.get('도로명주소'))}
            # ★site-data 에도 변대주번호 열이 없다. DCUID 앞 8자리로 만들지 않는다(축 넘기 금지)
            rec = {k: v for k, v in rec.items() if v}
            if not rec:
                continue
            cu = B.norm_cust(x.get('고객번호'))
            if cu:
                sc.setdefault(cu, rec)
            mm = B.norm_mac(x.get('모뎀MAC'))
            if mm:
                sm.setdefault(mm, rec)
        out.append(('site-data', sc, sm))

    # jongno_jungong — 계약번호=고객번호. 주소만 있고 MAC 은 없다
    jc = {}
    for cust, addr in c.execute('SELECT 계약번호,주소 FROM jongno_jungong'):
        cu = B.norm_cust(cust)
        a = blank(addr)
        if cu and a:
            jc.setdefault(cu, {'도로명주소': a} if ROAD_RE.search(a) else {})
    jc = {k: v for k, v in jc.items() if v}
    out.append(('jongno_jungong', jc, {}))

    con.close()
    log('재보강 색인: ' + ' · '.join(
        f'{n}(고객 {len(a):,}/MAC {len(b):,})' for n, a, b in out))
    return out


def build_dcu_index():
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    by_no, by_id = {}, {}
    for did, no, nmz, line, fault in con.execute(
            'SELECT "DCU ID",변대주번호,변대주명,회선상태,장애여부 FROM dcu_all'):
        d10, n8 = B.norm_dcuid(did), B.norm_bdju_no(no)
        rec = {'DCUID': d10, '변대주번호': n8, '변대주': blank(nmz),
               'DCU회선상태': blank(line)}
        rec = {k: v for k, v in rec.items() if v}
        if n8:
            by_no.setdefault(n8, rec)
        if d10:
            by_id.setdefault(d10, rec)
    con.close()
    return by_no, by_id


def resweep(rows, idx, dcu_no, dcu_id):
    """전수 재보강. 반환 = (채운 건수 Counter, 대안 건수 Counter)"""
    filled, alt = Counter(), Counter()
    for x in rows:
        cu, mac = B.norm_cust(x.get('고객번호')), B.norm_mac(x.get('모뎀MAC'))
        for src, by_cust, by_mac in idx:
            rec, how = None, ''
            if cu and cu in by_cust:
                rec, how = by_cust[cu], '고객번호'
            elif mac and mac in by_mac:
                rec, how = by_mac[mac], 'MAC'
            if not rec:
                continue
            for f in RESWEEP_FIELDS:
                v = rec.get(f)
                if not v:
                    continue
                cur = x.get(f) or ''
                if not cur:
                    x[f] = v
                    x[f + '출처'] = f'{src}/{how}'
                    filled[f] += 1
                elif _norm_cmp(cur) != _norm_cmp(v) and not x.get(f + '_대안'):
                    # ★덮지 않는다. 다른 값이 있다는 사실만 남긴다(판정은 나중에)
                    x[f + '_대안'] = v
                    x[f + '_대안출처'] = f'{src}/{how}'
                    alt[f] += 1
        # dcu_all — 변대주번호/DCUID 로 (계기번호 안 쓴다)
        d = dcu_no.get(x.get('변대주번호') or '') or dcu_id.get(x.get('DCUID') or '')
        dsrc = ('dcu_all/변대주번호' if dcu_no.get(x.get('변대주번호') or '')
                else ('dcu_all/DCUID' if dcu_id.get(x.get('DCUID') or '') else ''))
        if d:
            for f in ('DCUID', '변대주번호', '변대주'):
                v = d.get(f)
                if not v:
                    continue
                cur = x.get(f) or ''
                if not cur:
                    x[f] = v
                    x[f + '출처'] = dsrc
                    filled[f] += 1
                elif _norm_cmp(cur) != _norm_cmp(v) and not x.get(f + '_대안'):
                    x[f + '_대안'] = v
                    x[f + '_대안출처'] = dsrc
                    alt[f] += 1
    return filled, alt


def multi_box_stats(map_rows):
    """한 주소 함체 2개 이상 — 무엇으로 갈라지나."""
    import collections as _c
    by = _c.defaultdict(list)
    for x in map_rows:
        by[x['주소']].append(x)
    multi = {a: v for a, v in by.items() if len({y['모뎀MAC'] for y in v if y['모뎀MAC']}) > 1}
    tot = sum(len(v) for v in multi.values())
    per = {}
    for f in ('공동주택명', '상호', '비고1', '비고2', '인입주'):
        per[f] = sum(len(v) for v in multi.values()
                     if len({y.get(f, '') for y in v if y.get(f)}) > 1)
    combo = sum(len(v) for v in multi.values()
                if len({(y.get('공동주택명', ''), y.get('상호', ''), y.get('비고1', ''),
                         y.get('인입주', '')) for y in v}) > 1)
    return len(multi), tot, per, combo


# ─── 변대주 3축 교정 (영준님 2026-09-20) ────────────────────────────────────
# "변대주명 매칭 · 전산화번호 매칭 · DCUID 매칭 — 끼리끼리 해야만 한다."
#   한전 회신을 붙일 때 전산화번호를 **이름 칸에도 복사**해 NG 1,555건이 났다.
#   형태로 판정해 제자리에 넣고, 이름은 dcu_master 에서 **조회해서만** 채운다.
# ★DCUID 앞 8자리 = 전산화번호 는 대장 19,007건 예외 0 인 **계산**이라 유도해도 된다.
#   (조회와 다르다 — 계산은 입력만 맞으면 결과가 결정된다)
#   단 원장 번호와 어긋나면 **원장을 남기고** 파생은 `_대안` 으로만 둔다.
import re as _re2

_NAME_RE = _re2.compile(r'[가-힣]')
_NUM8_RE = _re2.compile(r'^[0-9A-Z]{8}$')
_DCU10_RE = _re2.compile(r'^[0-9A-Z]{10}$')


def _kind(v):
    s = str(v or '').strip().upper()
    if not s:
        return None
    if _NAME_RE.search(s):
        return 'name'
    if _DCU10_RE.match(s):
        return 'dcu'
    if _NUM8_RE.match(s):
        return 'num'
    return 'junk'


def load_dcu_master():
    import sqlite3
    con = sqlite3.connect(ROOT / 'data/ami.db')
    by_id, by_no, by_name = {}, {}, {}
    for did, no, nmz, comm, line, verdict, cha in con.execute(
            'SELECT DCU_ID,변대주번호,변대주명,인입망통신방식,회선상태,철거판정,차수'
            ' FROM dcu_master'):
        rec = {'DCU_ID': (did or '').strip(), '변대주번호': (no or '').strip(),
               '변대주명': (nmz or '').strip(), 'DCU통신방식': (comm or '').strip(),
               '회선상태': (line or '').strip(), '철거판정': (verdict or '').strip(),
               'DCU차수': (cha or '').strip()}
        if rec['DCU_ID']:
            by_id.setdefault(rec['DCU_ID'], rec)
        if rec['변대주번호']:
            by_no.setdefault(rec['변대주번호'], rec)
        if rec['변대주명']:
            # ★이름 비교는 공백만 제거(대장 고유 18,993, 충돌 0). 저장은 원문 그대로.
            by_name.setdefault(_re2.sub(r'\s+', '', rec['변대주명']).upper(), rec)
    con.close()
    log(f'dcu_master 색인 — DCUID {len(by_id):,} · 번호 {len(by_no):,} · 이름 {len(by_name):,}')
    return by_id, by_no, by_name


def fix_bdju(rows, by_id, by_no, by_name):
    """3축 제자리 배치 -> 대장 조회 -> DCUID 앞8 계산으로 번호 보완."""
    st = Counter()
    for x in rows:
        vals = {'name': '', 'num': '', 'dcu': ''}
        srcs = {}
        for f, want in (('변대주', 'name'), ('변대주번호', 'num'), ('DCUID', 'dcu')):
            v = str(x.get(f) or '').strip()
            k = _kind(v)
            if k is None:
                continue
            if k == 'junk':
                st['버림(형태 불명)'] += 1
                continue
            if k != want:
                st[f'자리옮김 {want}칸->{k}'] += 1
            if not vals[k]:
                # ★번호·DCUID 는 코드다 — 대문자로 저장한다(대장도 대문자).
                #   원장에 '0000q000' 처럼 소문자가 섞여 오면 게이트가 형태 불일치로 잡는다.
                #   이름만 원문 그대로 둔다(표기가 곧 정보다).
                vals[k] = v if k == 'name' else v.upper()
                srcs[k] = x.get(f + '출처') or ''
        x['변대주'], x['변대주번호'], x['DCUID'] = vals['name'], vals['num'], vals['dcu']
        for f, k in (('변대주', 'name'), ('변대주번호', 'num'), ('DCUID', 'dcu')):
            x[f + '출처'] = srcs.get(k, '') if vals[k] else ''

        # ── 원장·보강현황에서 온 값은 **조회 키로만** 쓴다 ────────────────────
        #   ★상단 변대주 영역의 원천은 dcu_master 하나뿐이다([[bdju_field_purpose_dcu]]).
        #     원장 값을 상단에 남기면 '하나는 대장 · 하나는 원장' 으로 원천이 섞인다 —
        #     2026-09-20 에 345건이 그렇게 어긋났다(이 함수가 '빈 칸만 채웠던' 탓).
        #   ★조회 축은 **전산화번호 -> 변대주명 -> DCUID** 순이다. DCUID 를 맨 뒤로 내린 이유:
        #     resweep 이 boranggi·한전회신을 MAC/고객번호 키로 훑어 DCUID 를 심어 놓는데,
        #     그걸 먼저 키로 쓰면 **남의 변대주를 끌어온다**(실측 82건. 갈현간 61R2R1 은
        #     대장 9629S81200 인데 한전회신 MAC 경유 3800531841 로 조회돼 딴 개소가 붙었다).
        #     번호·이름은 그 계기의 원장 행에서 온 값이라 훨씬 믿을 만하다.
        ledger_no = x['변대주번호']          # 원장 번호 — 디테일로 내린다(PM 지시 2026-09-20)
        hit, axis = None, ''
        if x['변대주번호']:
            hit, axis = by_no.get(x['변대주번호'].upper()), '전산화번호'
        if not hit and x['변대주']:
            hit, axis = by_name.get(_re2.sub(r'\s+', '', x['변대주']).upper()), '변대주명'
        if not hit and x['DCUID']:
            hit, axis = by_id.get(x['DCUID'].upper()), 'DCUID'
        if hit:
            st['대장 매칭'] += 1
            st[f'  축 {axis}'] += 1
            # ★한 묶음으로 **전부 덮는다.** 하나만 채우고 나머지를 원장 값으로 두는 게 사고였다.
            #   이름·번호·DCU_ID·통신방식·회선상태·철거판정·차수가 전부 같은 대장 행에서 온다.
            if x['변대주'] and _norm_cmp(x['변대주']) != _norm_cmp(hit['변대주명']):
                x['변대주_원장'] = x['변대주']         # 표찰 이름이 다르면 버리지 말고 내린다
                st['이름 원장과 다름(대장 채택·원장은 디테일로)'] += 1
            x['변대주'] = hit['변대주명']
            x['변대주출처'] = f'dcu_master/{axis}'
            x['변대주번호'] = hit['변대주번호']
            x['변대주번호출처'] = f'dcu_master/{axis}'
            x['DCUID'] = hit['DCU_ID']
            x['DCUID출처'] = f'dcu_master/{axis}'
            # ★디테일(원장·현장 기록)과 서로 메우지 않는다(영준님 2026-09-20).
            #   상단 PLC · 디테일 LTE 는 모순이 아니다 — 그 변대주엔 PLC DCU 가 달려 있고
            #   우리 계기는 LTE 로 따로 간 것이다. 둘을 비교해 한쪽을 고치지 마라.
            x['DCU통신방식'] = hit['DCU통신방식']
            x['회선상태'] = hit['회선상태']
            x['철거판정'] = hit['철거판정']
            x['DCU차수'] = hit['DCU차수']
            x['대장출처'] = f'dcu_master/{axis}'
            if ledger_no and ledger_no.upper() != (hit['변대주번호'] or '').upper():
                st['번호 원장과 다름(대장 채택)'] += 1
        else:
            # ★대장에서 못 찾으면 상단은 **판별 결과로 비운다.** 원장 번호·DCUID 로 메우지 마라.
            #   그건 결손이 아니라 'DCU 통신 개소가 아니다' 라는 답이다.
            #   이름만 남긴다 — 전주 표찰이라 현장에서 쓴다.
            if x['변대주번호'] or x['DCUID']:
                st['대장미등재 — 번호·DCUID 비움(원장값은 디테일로)'] += 1
            x['변대주번호'] = x['DCUID'] = ''
            x['변대주번호출처'] = x['DCUID출처'] = ''
            x['DCU통신방식'] = x['회선상태'] = x['철거판정'] = x['DCU차수'] = ''
            x['대장출처'] = '대장미등재'
            st['대장 미등재'] += 1

        # ★원장 변대주번호는 버리지 않고 **계기 디테일 쪽**에 둔다(영준님 2026-09-20).
        #   상단은 대장, 디테일은 원장 — 자리를 갈라 두면 어느 쪽이 무엇인지 헷갈리지 않는다.
        #   ★단 미입력 표기는 싣지 않는다 — '00000000' 58건 · 'LTEDCUSU' 63건은
        #     전산화번호가 아니라 빈 칸 표시다(봉인의 9999999 와 같은 성격).
        if (ledger_no and ledger_no.upper() != (x['변대주번호'] or '').upper()
                and ledger_no.upper() not in LEDGER_NO_EMPTY
                and not _re2.fullmatch(r'0+|9+', ledger_no)):
            x['변대주번호_원장'] = ledger_no
    log('3축 교정: ' + ' · '.join(f'{k} {v:,}' for k, v in st.most_common()))
    return st


def log(m):
    print(m, flush=True)


def main():
    EX.stage_reset(EX.L_MICH)   # 재실행이 멱등이어야 한다
    pm_all = [nm(x) for x in PM_LIST.read_text().split() if nm(x)]
    _ex = {nm(k): v for k, v in METER_TYPO_EXCLUDE.items()}
    pm = [m for m in pm_all if m not in _ex]
    for m in pm_all:
        if m in _ex:
            log(f'계기번호 오타 제외: {m} — {_ex[m]}')
    if len(pm) != len(pm_all):
        log(f'대상 {len(pm_all):,} -> {len(pm):,} (오타 제외 {len(pm_all)-len(pm)})')

    # ── 미연계 제외 ─────────────────────────────────────────────────────────
    import sqlite3 as _sq3
    _mc = _sq3.connect(ROOT / 'data/ami.db').cursor()
    _mi_cols = [r[1] for r in _mc.execute(f'PRAGMA table_info("{MIYEONGYE_TABLE}")')]
    _lpc = [x for x in _mi_cols if x.startswith('LP')]
    # 작성툴 = 고유키(플러스 / 현장관리 / 구시공앱) — 어느 앱으로 쓴 건인지가 되살릴 때 단서다
    _sel = ['계기번호', '주소', '고객번호', '비고1', '비고2', '고유키'] + _lpc
    _mi = {}
    for _r in _mc.execute(f'SELECT {",".join(chr(34)+x+chr(34) for x in _sel)}'
                          f' FROM "{MIYEONGYE_TABLE}"'):
        _d = dict(zip(_sel, _r))
        _k = nm(_d['계기번호'])
        if _k and _k not in _mi:
            _mi[_k] = _d
    before_mi = len(pm)
    _hit = [m for m in pm if m in _mi]
    if EXCLUDE_MIYEONGYE:
        pm = [m for m in pm if m not in _mi]
        log(f'미연계 제외 {len(_hit):,}건 — 대상 {before_mi:,} -> {len(pm):,}')
    else:
        log(f'미연계 ★제외 보류 — 겹침 {len(_hit):,}건을 **대상에 남긴다**'
            f' (과장 확인 대기). 미연계 시트 계기 {len(_mi):,}')
    MIYEONGYE_OUT.write_text(json.dumps({
        '생성': '2026-09-20',
        '출처': 'data/inbox_jdg_20260920/25년미청구분_v2.xlsx · 미연계 시트',
        '상태': '제외됨(2026-09-20). 과장 답이 오면 EXCLUDE_MIYEONGYE=False 로 되살린다',
        '물어볼 것': ("'미연계' 가 무엇을 뜻하는가 — 한전 대장 미등재인지 · DCU 연계 실패인지"
                  " · 청구 라인 제외인지. 파일에 근거가 없다."
                  " LP 는 126건 중 125건이 정상이라 모뎀은 돌고 있고 전부 '신규' 시공 기록이 있다."),
        '제외건수': len(_hit),
        '목록': [{'계기번호': str(_mi[m]['계기번호']).strip(),
                '주소': _mi[m].get('주소') or '',
                '고객번호': _mi[m].get('고객번호') or '',
                'LP': {k: (str(_mi[m][k]).strip() if _mi[m][k] is not None else '')
                       for k in _lpc},
                '비고1': _mi[m].get('비고1') or '', '비고2': _mi[m].get('비고2') or '',
                '작성툴': _mi[m].get('고유키') or ''}
               for m in _hit],
    }, ensure_ascii=False, indent=1))
    log(f'저장 {MIYEONGYE_OUT} {len(_hit):,}건 (되살리기용)')
    boost = {nm(r['계기번호']): r for r in json.loads(BOOST.read_text())}
    log(f'PM 목록 {len(pm):,} · 고유 {len(set(pm)):,}')

    tgt = []
    for m in pm:
        r = boost.get(m)
        if not r:
            log(f'★보정판에 없는 계기 {m} — 중단')
            return 1
        tgt.append(r)

    # ── 한전 회신(주덕기 9/20) 주소·변대주 얹기 ───────────────────────────────
    # ★키는 고객번호 우선 -> MAC 보조. 계기번호 단독 금지(재사용 오염 17~51%).
    #   과장 파일은 고객번호가 10,333행 전건에 있어 키가 충분하다.
    # ★빈 칸만 채운다. 원장 값은 덮지 않는다.
    import sqlite3 as _sq
    _con = _sq.connect(ROOT / 'data/ami.db')
    _cur = _con.cursor()
    kep_c, kep_m = {}, {}
    # ★고객번호가 두 칸으로 나뉘어 온다 — O열 `고객번호` 는 #N/A 가 많고(유효 4,926),
    #   BC열 `고객번호_2` 가 따로 4,612 있다. 둘을 coalesce 해야 키가 9,538행으로 는다.
    #   발주서의 "고객번호 전건 10,333" 은 O열만 보면 성립하지 않는다.
    # ★LP 는 **7열 전부** 원문 그대로 싣는다(영준님 2026-09-20).
    #   1=정상수신 · 0=무수신 · #N/A=조회불가 · 소수=부분수신율.
    #   반올림하거나 정상/실패로 뭉개지 마라 — **추이가 정보다**
    #   (6월 0 인데 9월 1 이면 그사이 해결 · 9월 중 1->0 이면 최근에 끊긴 것).
    #   ★단 LP 는 대상 판정에 쓰지 않는다 — LP 무관 전 개소 방문이 방침이다. 참고 정보다.
    LPC = ['LP 06/10', 'LP 09-05', 'LP 09-06', 'LP 09-07', 'LP 09-08', 'LP 09-09', 'LP 09-13']
    _q = ('SELECT 고객번호,고객번호_2,MAC,주소,기존변대주,변경변대주,"25대상",'
          + ','.join(f'"{x}"' for x in LPC) + ' FROM "25년미청구분_v2__sheet1"')
    for _row in _cur.execute(_q):
        _cu, _cu2, _mac, _ad, _b1, _b2, _w = _row[:7]
        _lp = dict(zip(LPC, _row[7:]))
        _rec = {'지번주소': blank(_ad),
                '변대주명': (blank(_b1) or blank(_b2))}
        _rec = {k: v for k, v in _rec.items() if v and v != '0'}
        # W·LP 는 값이 비어도 싣는다(디테일 표시용) — 주소·변대주와 달리 '채우기'가 아니다
        _rec['_W'] = blank(_w)
        _rec['_LP'] = {k: (str(v).strip() if v is not None else '') for k, v in _lp.items()}
        if not any(k for k in _rec if not k.startswith('_')) and not _rec['_W'] \
                and not any(_rec['_LP'].values()):
            continue
        _c2 = B.norm_cust(_cu) or B.norm_cust(_cu2)
        if _c2 and _c2 not in kep_c:
            kep_c[_c2] = _rec
        _mm = B.norm_mac(_mac)
        if _mm and _mm not in kep_m:
            kep_m[_mm] = _rec
    _con.close()
    log(f'한전 회신 색인 — 고객번호 {len(kep_c):,} · MAC {len(kep_m):,}')

    kep_fill = Counter()
    for r in tgt:
        hit, how = None, ''
        if r['고객번호'] and r['고객번호'] in kep_c:
            hit, how = kep_c[r['고객번호']], '고객번호'
        elif r['MAC'] and r['MAC'] in kep_m:
            hit, how = kep_m[r['MAC']], 'MAC'
        if not hit:
            continue
        # W(25대상)·LP 7열 — 디테일 표시용. 덮어쓰기 개념이 아니라 그대로 얹는다
        if hit.get('_W'):
            r['W_25대상'] = hit['_W']
        if hit.get('_LP'):
            r['LP'] = hit['_LP']
        for f in ('지번주소', '변대주명'):
            if not r.get(f) and hit.get(f):
                r[f] = hit[f]
                if f == '지번주소':
                    r['주소출처'] = f'한전회신/주덕기 20260920/{how}'
                    r['신뢰등급'] = dict(r['신뢰등급'])
                    r['신뢰등급']['주소'] = 'A_한전회신'
                else:
                    r['변대주출처'] = f'한전회신/주덕기 20260920/{how}'
                kep_fill[f] += 1
    log(f'한전 회신으로 채움 — {dict(kep_fill)}')

    # ── awms 회수 주소 얹기 (채택 결정 2026-09-20) ────────────────────────────
    # ★한전 회신과 대조해 판정가능 159 중 불일치 1, **정확도 99.4%** 로 근거가 나와 채택했다.
    #   그래도 신뢰등급은 **B 로 유지**한다(영준님) — 한전 원천이 아니라 우리가 조회한 값이다.
    # ★한전 회신이 먼저다. awms 는 회신에도 없는 빈 칸만 메운다.
    aw_fill = 0
    if AWMS.exists():
        _aw = {}
        for x in json.loads(AWMS.read_text())['목록']:
            if x.get('결과') != '적중' or not x.get('awms_주소'):
                continue
            if not str(x.get('신뢰등급', '')).startswith(('A_', 'B_')):
                continue
            _aw[nm(x['계기번호'])] = x
        for r in tgt:
            if r['지번주소'] or r['도로명주소']:
                continue
            a = _aw.get(nm(r['계기번호']))
            if not a:
                continue
            r['지번주소'] = a['awms_주소']
            r['주소출처'] = 'awms/fmpMtr1000'
            g = str(a.get('신뢰등급', ''))
            r['신뢰등급'] = dict(r['신뢰등급'])
            # ★A_awms 로 잡힌 것도 B 로 내린다 — 등급은 출처의 성격이지 매칭 품질이 아니다
            r['신뢰등급']['주소'] = 'B_awms' + (g[g.find('('):] if '(' in g else '')
            aw_fill += 1
    log(f'awms 로 채움 — {aw_fill:,} (한전 회신에도 없던 빈 칸)')

    # 작업 태그를 떼고 원문을 따로 보관한다
    tagged = 0
    for r in tgt:
        for f in ('지번주소', '도로명주소'):
            c = clean_addr(r[f])
            if c != (r[f] or ''):
                r.setdefault('_원문', {})[f] = r[f]
                r[f] = c
                tagged += 1
    log(f'주소 작업태그 제거 {tagged:,}건')

    has = [r for r in tgt if r['지번주소'] or r['도로명주소']]
    pend = [r for r in tgt if not (r['지번주소'] or r['도로명주소'])]
    log(f'주소 보유 {len(has):,} · 결손 {len(pend):,}')

    # ── 현장 필드 보강 ──────────────────────────────────────────────────────
    led_extra = build_ledger_extra()
    bo_cust, bo_mac, dcu_no, dcu_id = build_boranggi_index()
    fill = Counter()

    # ── 좌표 ────────────────────────────────────────────────────────────────
    pairs = sorted({(r['지번주소'], r['도로명주소']) for r in has})
    log(f'좌표 대상 (지번,도로명) 쌍 {len(pairs):,}')
    cache = H.load_geo_cache()
    cache = H.geocode_all(pairs, cache)

    # ── 폴백: 그래도 실패한 주소는 **구 중심**으로 넣는다 ─────────────────────
    #   ★행을 버리지 않는다(발주서). 좌표정확도에 approximate 로 표시해 구분 가능하게 둔다.
    from geocode_cascade import resolve as geo_resolve
    globals()['geo_resolve'] = geo_resolve
    gu_cache = {}
    fixed = 0
    for jib, road in pairs:
        k = f'{jib} {road}'
        v = cache.get(k)
        if v and v[2] and v[3]:
            continue
        gu = gu_of(jib) or gu_of(road)
        if not gu:
            continue
        if gu not in gu_cache:
            gu_cache[gu] = geo_resolve(jibun=gu, road='')
        hit = gu_cache[gu]
        if hit and hit.lat:
            cache[k] = ['approximate', gu, hit.lat, hit.lng, '구중심폴백', '', '']
            fixed += 1
    if fixed:
        log(f'구 중심 폴백 {fixed:,}건 (좌표정확도=approximate)')
    H.GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')

    def rec(r, with_coord):
        out = {
            '지사': r['지사'],
            # ★'주소' 는 아미맵의 지번 칸이다(site-data 와 같은 계열)
            '주소': r['지번주소'],
            '도로명주소': r['도로명주소'],
            '계기번호': r['계기번호'],          # 원문 보존
            '계기타입': r['계기타입'],
            '고객번호': r['고객번호'],
            '통신방식': r['통신방식'],
            # ★의미로 매핑 — 변대주=전주 '이름', DCUID=ID
            '변대주': r['변대주명'],
            '변대주번호': r['변대주번호'],
            'DCUID': r['DCU_ID'],
            '모뎀MAC': r['MAC'],
            '주소_원문': (r.get('_원문') or {}).get('지번주소', ''),
            '신뢰등급': r['신뢰등급']['주소'],
            '주소출처': r['주소출처'],
            '변대주출처': r['변대주출처'],
            '최종시공일': r['최종시공일'],
            '구분': r['구분'],
            '공종': r['공종'],
            # 디테일 표시용 — 한전 회신에서 얹은 값(대상 판정에는 쓰지 않는다)
            'W_25대상': r.get('W_25대상', ''),
            'LP': r.get('LP') or {},
        }

        # ★오타 교정 — 정답이 확인된 것만. 키 조회는 **원래 번호**로 하고 출력만 바꾼다
        _fix = METER_TYPO_FIX.get(str(r['계기번호']).strip())
        if _fix:
            out['계기번호'] = _fix[0]
            out['계기번호_원문'] = str(r['계기번호']).strip()
            out['계기번호출처'] = f'계기번호 교정/MAC 역추적 ({_fix[1]})'

        m = nm(r['계기번호'])
        # ① 원장 현장 필드 — 그 계기의 미청구 행에서 온다(교차매칭 아님)
        for f, v in (led_extra.get(m) or {}).items():
            out[f] = v
            fill[f] += 1
        for f in LEDGER_FIELDS:
            out.setdefault(f, '')

        # ② boranggi — 고객번호 우선, 없으면 MAC. ★계기번호로는 붙이지 않는다
        hit, src = None, ''
        if r['고객번호'] and r['고객번호'] in bo_cust:
            hit, src = bo_cust[r['고객번호']][0], bo_cust[r['고객번호']][1] + '/고객번호'
        elif r['MAC'] and r['MAC'] in bo_mac:
            hit, src = bo_mac[r['MAC']][0], bo_mac[r['MAC']][1] + '/MAC'
        for f in BORANGGI_FIELDS:
            v = (hit or {}).get(f, '')
            out[f] = v
            out[f + '출처'] = src if v else ''
            if v:
                fill[f] += 1

        # ③ dcu_all — 변대주번호 우선, 없으면 DCU ID
        dh = dcu_no.get(r['변대주번호']) or dcu_id.get(r['DCU_ID'])
        dsrc = ('dcu_all/변대주번호' if dcu_no.get(r['변대주번호'])
                else ('dcu_all/DCUID' if dcu_id.get(r['DCU_ID']) else ''))
        for f in DCU_FIELDS:
            v = (dh or {}).get(f, '')
            out[f] = v
            out[f + '출처'] = dsrc if v else ''
            if v:
                fill[f] += 1
        if with_coord:
            key = f"{r['지번주소']} {r['도로명주소']}"
            v = cache.get(key)
            if v and v[2] and v[3]:
                out['lat'], out['lng'] = v[2], v[3]
                out['좌표정확도'] = v[0]
                if v[5]:
                    out['도로명주소'] = out['도로명주소'] or v[5]
                if v[6]:
                    out['주소'] = out['주소'] or v[6]
            else:
                # ★행을 버리지 않는다. 좌표만 비우고 표시한다(지도에서 걸러 보게)
                out['lat'] = out['lng'] = None
                out['좌표정확도'] = 'fail'
        return out

    map_rows = [rec(r, True) for r in has]
    pend_rows = [rec(r, False) for r in pend]

    # ── 제외축: 계기번호 타입코드 오류 (영준님 2026-09-20) ───────────────────
    _bad = meter_code_bad(map_rows + pend_rows)
    if _bad:
        _bset = {nm(r['계기번호']) for r, _ in _bad}
        log(f'계기번호 타입코드 오류 {len(_bad)}건 제외:')
        for r, ev in _bad:
            log(f"   {r['계기번호']} 코드={ev['타입코드']} 타입={r.get('계기타입')}"
                f" — {ev['판정근거']}")
        meter_code_write('25미청구', _bad)
        EX.stage(EX.L_MICH, [EX.row(EX.L_MICH, 'C1', r,
            f"계기번호 3~4번째 타입코드가 '{ev['타입코드']}' 인데 대장(boranggi 66만행)에"
            f" 단 1건도 없다 = 계기번호 오타다. {ev['판정근거']}",
            f"타입코드 {ev['타입코드']} · 대장 0건") for r, ev in _bad])
        map_rows = [x for x in map_rows if nm(x['계기번호']) not in _bset]
        pend_rows = [x for x in pend_rows if nm(x['계기번호']) not in _bset]
        pm = [m for m in pm if m not in _bset]          # 게이트 기대치도 같이 줄인다

    # ── 제외축: S(표준형) 계기 (영준님 2026-09-20) ──────────────────────────
    _std = standard_type_bad(map_rows + pend_rows)
    if _std:
        _sset = {nm(r['계기번호']) for r, _ in _std}
        log(f'S(표준형) 계기 {len(_std)}건 제외'
            f' — 타입코드 {dict(Counter(str(r["계기번호"])[2:4] for r, _ in _std).most_common())}')
        standard_type_write('25미청구', _std)
        EX.stage(EX.L_MICH, [EX.row(EX.L_MICH, 'C2', r,
            f"계기타입이 '{v}'(표준형)다. 코드가 무엇이든 표준형이면 제외하라는 지시다"
            f" — 이 리스트에서는 타입코드 35·15·34·14 에 흩어져 있다.",
            f'계기타입={v}') for r, v in _std])
        map_rows = [x for x in map_rows if nm(x['계기번호']) not in _sset]
        pend_rows = [x for x in pend_rows if nm(x['계기번호']) not in _sset]
        pm = [m for m in pm if m not in _sset]
    else:
        log('S(표준형) 계기 0건')

    # ── 제외축: 계기번호 오류 계열 (영준님 2026-09-20) ──────────────────────
    _err = meter_err_bad(map_rows + pend_rows)
    if _err:
        _eset = {nm(r['계기번호']) for r, _ in _err}
        log(f'계기번호 오류 계열 {len(_err)}건 제외'
            f' — {dict(Counter(k for _, k in _err).most_common())}')
        meter_err_write('25미청구', _err)
        EX.stage(EX.L_MICH, [EX.row(EX.L_MICH, 'C3', r,
            f"현장이 불가상세에 번호가 틀렸다고 적었다(유형 {k})."
            f" 원문: \"{r.get('불가사유')} / {r.get('불가상세')}\"",
            f"유형 {k} · 원문 {r.get('불가상세')}") for r, k in _err])
        map_rows = [x for x in map_rows if nm(x['계기번호']) not in _eset]
        pend_rows = [x for x in pend_rows if nm(x['계기번호']) not in _eset]
        pm = [m for m in pm if m not in _eset]
    else:
        log('계기번호 오류 계열 0건')
    # ★현장이 적어 놓은 실제 계기번호는 **남는 건에도** 담아 둔다(교정하지 않는다).
    _hint = 0
    for x in map_rows + pend_rows:
        mv, kv = field_meter_hint(x)
        if mv:
            x['현장계기번호_추정'] = mv
        if kv:
            x['현장모뎀MAC_추정'] = kv
        if mv or kv:
            _hint += 1
    if _hint:
        log(f'  현장계기번호_추정 담은 건 {_hint}(리스트에 남는 건 기준)')

    # ── 제외축: 고객번호 경유 26년 신설 (영준님 2026-09-20) ──────────────────
    #   ★신설만 뺀다. 기설은 우리가 갈아야 할 25년 모뎀에 계기가 추가된 것이라 남긴다.
    _drop, _keep = via_cust_26_hits(map_rows + pend_rows)
    if _drop or _keep:
        _dset = {nm(r['계기번호']) for r, _ in _drop}
        log(f'고객번호경유 26년시공 — 신설 {len(_drop)}건 **제외**'
            f' · 기설 {len(_keep)}건 **유지**(25년 모뎀에 계기 추가 — 빼지 않는다)')
        via_cust_write('25미청구', _drop, _keep)
        EX.stage(EX.L_MICH, [EX.row(EX.L_MICH, 'C4', r,
            f"고객번호 {r.get('고객번호')} 로 보강현황을 거쳐 같은 개소의 계기"
            f" {ev['awms계기']} 를 찾았고, 그 계기가 awms 에 '{ev['작업구분']}' 으로"
            f" {str(ev['작업일'])[:10]} 에 시공돼 있다. 계기가 교체돼 번호가 바뀐 개소다.",
            f"awms계기 {ev['awms계기']} · {str(ev['작업일'])[:10]} · {ev['작업구분']}")
                             for r, ev in _drop])
        map_rows = [x for x in map_rows if nm(x['계기번호']) not in _dset]
        pend_rows = [x for x in pend_rows if nm(x['계기번호']) not in _dset]
        pm = [m for m in pm if m not in _dset]          # 게이트 기대치도 같이 줄인다

    acc = Counter(x['좌표정확도'] for x in map_rows)
    log(f'좌표: {dict(acc)}')

    allrows = map_rows + pend_rows
    n_all = len(allrows)

    # ── 전수 재보강 ─────────────────────────────────────────────────────────
    MEASURE = LEDGER_FIELDS + BORANGGI_FIELDS + ['DCUID', '변대주', '변대주번호', '도로명주소']
    before = {f: sum(1 for x in allrows if x.get(f)) for f in MEASURE}
    b_multi, b_tot, b_per, b_combo = multi_box_stats(map_rows)

    idx = build_resweep_index()
    dcu_no, dcu_id = build_dcu_index()
    filled, alt = resweep(allrows, idx, dcu_no, dcu_id)
    after = {f: sum(1 for x in allrows if x.get(f)) for f in MEASURE}
    a_multi, a_tot, a_per, a_combo = multi_box_stats(map_rows)

    log(f'\n=== 필드 채움률 before/after (전체 {n_all:,}) ===')
    log(f'{"필드":14s} {"before":>8s} {"after":>8s} {"증가":>7s}   after%   대안')
    for f in MEASURE:
        d = after[f] - before[f]
        log(f'{f:14s} {before[f]:8,} {after[f]:8,} {d:+7,}   {after[f]/n_all*100:5.1f}%'
            f'   {alt.get(f, 0):,}')
    log(f'\n재보강으로 채운 값 {sum(filled.values()):,}개 · '
        f'원장과 다른 값 발견 {sum(alt.values()):,}개(덮지 않고 <필드>_대안 에 남겼다)')

    log(f'\n=== 한 주소 함체 2개 이상 — 주소 {a_multi:,} · 계기 {a_tot:,} ===')
    log(f'{"필드":12s} {"before":>8s} {"after":>8s}')
    for f in b_per:
        log(f'{f:12s} {b_per[f]:8,} {a_per[f]:8,}')
    log(f'{"네 필드 조합":12s} {b_combo:8,} {a_combo:8,}')
    log(f'★못 가르는 계기 {b_tot - b_combo:,} -> {a_tot - a_combo:,}'
        f' ({(b_tot-b_combo)-(a_tot-a_combo):+,})')

    # ── 재보강 뒤 주소가 생긴 대기 건을 지도로 올린다 ────────────────────────
    # ★분할(ready/await)은 주소 유무로 가르는데, 재보강이 그 **뒤에** 돌아 도로명주소를
    #   채운다. 그대로 두면 '대기인데 주소가 있는' 행이 남아 두 파일의 뜻이 어긋난다.
    #   좌표까지 붙여 지도로 옮긴다 — 주소가 있으면 지도에 있어야 한다.
    promoted = [x for x in pend_rows if x.get('주소') or x.get('도로명주소')]
    if promoted:
        newpairs = sorted({(x.get('주소', ''), x.get('도로명주소', '')) for x in promoted})
        cache = H.geocode_all(newpairs, cache)
        for jib, road in newpairs:
            k = f'{jib} {road}'
            v = cache.get(k)
            if v and v[2] and v[3]:
                continue
            gu = gu_of(jib) or gu_of(road)
            if gu:
                hit = geo_resolve(jibun=gu, road='')
                if hit and hit.lat:
                    cache[k] = ['approximate', gu, hit.lat, hit.lng, '구중심폴백', '', '']
        H.GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')
        for x in promoted:
            v = cache.get(f"{x.get('주소','')} {x.get('도로명주소','')}")
            if v and v[2] and v[3]:
                x['lat'], x['lng'], x['좌표정확도'] = v[2], v[3], v[0]
            else:
                x['lat'] = x['lng'] = None
                x['좌표정확도'] = 'fail'
        keep_pend = [x for x in pend_rows if not (x.get('주소') or x.get('도로명주소'))]
        ok_prom = [x for x in promoted if x['lat'] is not None]
        keep_pend += [x for x in promoted if x['lat'] is None]
        map_rows += ok_prom
        pend_rows[:] = keep_pend
        log(f'\n재보강으로 주소가 생긴 대기 {len(promoted):,}건 -> 지도로 이동 {len(ok_prom):,}'
            f' (좌표 실패로 대기 유지 {len(promoted)-len(ok_prom):,})')

    # ── 변대주 3축 교정 + 대장 조회 ─────────────────────────────────────────
    by_id, by_no, by_name = load_dcu_master()
    fix_bdju(map_rows + pend_rows, by_id, by_no, by_name)

    # ── DCU 철거예정 태그 ───────────────────────────────────────────────────
    # ★1차 리스트업 때는 apply_dcu_status.py 를 손으로 한 번 돌렸는데, 그 뒤 빌더를 다시
    #   돌릴 때마다 파일을 새로 써서 태그가 통째로 날아갔다(실측: 7,366건 전부 빈값).
    #   그래서 **빌더 안으로 들여왔다** — 재생성해도 항상 붙는다.
    # ★매칭키는 변대주명 + 지사다 [[dcu_removal_tag_rule]]. 우리 `변대주` 가 이름이라 그대로 맞는다.
    #   그래서 **변대주가 빈 건은 판정 자체가 불가능하다** — 건수를 따로 찍는다.
    # ★정본 파일명은 data/reference/간선망_해지_정지대상.xlsx 다.
    #   메모의 'DCU_철거_예정_개소_목록.xlsx' 와 이름이 다르다 — 스크립트가 읽는 실물이 이것이다.
    _d = importlib.util.spec_from_file_location(
        'dcu', str(ROOT / 'scripts/apply_dcu_status.py'))
    D = importlib.util.module_from_spec(_d)
    _d.loader.exec_module(D)
    removal, comm = D.load_reference()
    log(f'\nDCU 철거예정 자료 {D.XLSX.name} — 철거예정 {len(removal[0]):,}개 변대주')
    for rows_, label in ((map_rows, '지도'), (pend_rows, '대기')):
        D.apply_to(rows_, removal, comm)
        tag = Counter(x.get('dcu_철거예정') or '(없음)' for x in rows_)
        nobd = sum(1 for x in rows_ if not str(x.get('변대주') or '').strip())
        log(f'  [{label} {len(rows_):,}] ' + ' · '.join(
            f'{k} {v:,}' for k, v in tag.most_common())
            + f'  | 변대주 없어 판정불가 {nobd:,}')

    # ★저장 전에 뺄 것만 턴다 — dcu_철거예정 계열은 남긴다
    # ★빼는 것은 **장애여부 계열뿐**이다(영준님 2026-09-18 재정정).
    # ★장애여부는 상단에 안 그린다(영준님 2026-09-20 정정) — 대장 묶음은 다섯이다.
    DROP = ('DCU장애여부', 'DCU장애여부출처', 'DCU장애여부_대안', 'DCU장애여부_대안출처',
            'DCU장애여부_대장', 'DCU장애여부_대장출처',
            'DCU회선상태', 'DCU회선상태출처', 'DCU회선상태_대안', 'DCU회선상태_대안출처')
    for x in map_rows + pend_rows:
        for k in DROP:
            x.pop(k, None)
    log('제거한 DCU 필드: ' + ', '.join(DROP))

    # ★옛 split_cross_axis 는 fix_bdju 로 대체됐다 — 더 부르지 않는다.
    #   그쪽은 '축을 넘은 값은 전부 _유도로 빼라'였는데, 지금 규칙은 다르다:
    #   형태로 제자리에 놓고, 이름은 대장 조회로만 채우고,
    #   DCUID 앞 8자리 = 전산화번호는 **계산**이라 본값에 넣어도 된다(대장 예외 0).
    #   둘을 같이 돌리면 방금 제자리에 놓은 번호를 다시 _유도로 빼 간다(실측 975건).

    OUT_MAP.write_text(json.dumps(map_rows, ensure_ascii=False, indent=1))
    OUT_PEND.write_text(json.dumps(pend_rows, ensure_ascii=False, indent=1))
    log(f'저장 {OUT_MAP}  {len(map_rows):,}건')
    log(f'저장 {OUT_PEND}  {len(pend_rows):,}건')

    # ── 검증 게이트 ─────────────────────────────────────────────────────────
    log('\n=== 검증 게이트 ===')
    _fixmap = {nm(k): nm(v[0]) for k, v in METER_TYPO_FIX.items()}
    src = {_fixmap.get(m, m) for m in pm}
    got = {nm(x['계기번호']) for x in map_rows} | {nm(x['계기번호']) for x in pend_rows}
    alpha_src = sum(1 for x in src if re.search(r'[A-Za-z]', x))
    alpha_out = sum(1 for x in map_rows + pend_rows
                    if re.search(r'[A-Za-z]', str(x['계기번호'])))
    dup = len(map_rows) + len(pend_rows) - len(got)
    nullc = sum(1 for x in map_rows if x['lat'] is None or x['lng'] is None)
    checks = [
        (f'지도 {len(map_rows):,} + 대기 {len(pend_rows):,} = {len(map_rows)+len(pend_rows):,}'
         f' (기대 {len(pm):,})', len(map_rows) + len(pend_rows) == len(pm)),
        (f'계기 차집합 — 목록에만 {len(src-got)} · 산출에만 {len(got-src)}', src == got),
        (f'영문자 접두 목록 {alpha_src} · 산출 {alpha_out}', alpha_src == alpha_out),
        (f'lat/lng null {nullc}건', nullc == 0),
        (f'중복 계기번호 {dup}건', dup == 0),
    ]
    ok = True
    for msg, good in checks:
        log(f'  [{"OK" if good else "실패"}] {msg}')
        ok &= good
    # ★변대주 3축 게이트 — 실패하면 산출물을 내지 않는다(영준님 2026-09-20)
    import importlib.util as _iu
    _vs = _iu.spec_from_file_location('vb', str(ROOT / 'scripts/validate_bdju.py'))
    VB = _iu.module_from_spec(_vs)
    _vs.loader.exec_module(VB)
    bd_err = 0
    for rows_, lab in ((map_rows, 'michunggu-data'), (pend_rows, 'michunggu-pending')):
        n_, msgs = VB.check_records(rows_, lab)
        bd_err += n_
        for m_ in msgs:
            log('  ' + m_)
    log(f'  [{"OK" if bd_err == 0 else "실패"}] 변대주 3축 게이트 — 어긋난 값 {bd_err:,}')
    ok = ok and bd_err == 0

    log('  판정: ' + ('OK' if ok else '★게이트 불통과'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
