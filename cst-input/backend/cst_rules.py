"""아미큐 판정 규칙 — 모뎀맥 형식 · 통신방식(INST_S suffix) · 계기유형(INST_M) · 슬레이브 분기(BUNGI).

★단일 출처(2026-11-14 공용화). 쓰는 곳:
  cst-input/backend/app.py          — saveAct 를 만들 때(화면 cst-app autoBungi·칩 조건과 같은 식)
  scripts/cst_daily_check.py        — 작업검사에서 awms 에 실제 들어간 값과 대조할 때
같은 법칙을 다른 파일에 다시 쓰지 마라. 고칠 일이 생기면 여기만 고치고, 백엔드는 restart.sh 로 재구동해야
반영된다(검사 스크립트는 다음 실행부터).
이 파일은 표준 라이브러리만 쓴다 — 검사 스크립트가 백엔드(app.py)를 import 하지 않고 이것만 불러 쓴다.
"""
import re


# ── 모뎀맥 형식 법칙 (영준님 2026-09-09 확정 · 실측 modem_work 51,779행) ─────────
# 정상은 두 갈래뿐이고, 그 밖은 전부 오독이다.
#   LTE류  '012' + 숫자 8자리 = 총 11자리, 전부 숫자   (SMGW-C·LTE_IV·SMGW-A·LTE = 99.97%)
#   PLC류  hex 12자리, 앞 6자리는 아래 MAC_OUI 5개뿐  (KS-PLC·K-DCU·HPGP·IoT-PLC = 99.6%)
#
# ★글자는 0-9·A-F 만이다 — 모든 타입 공통. 실측에서 나온 G·I·L·N·O·P·R·S 는 전부 스캐너 오독이었다
#   (0↔O, 1↔I, 5↔S, 6↔G, 8↔B/R/S, D↔N, F↔P). 138건 전수 확인.
# ★앞 6자리도 5개 밖이 없다 — 947207·B47207·547207·874207·840207·E0AEE5·E0AEE9·E0AEDE·E01EED·
#   E0A42D·AC5EBC·AC5E80·44B430 은 전부 한 글자 오독이었다.
# 새 모뎀이 실제로 들어오면 이 목록에 추가한다 — 다른 곳에 목록을 또 만들지 마라.
MAC_OUI = ("847207", "E0AEED", "AC5E8C", "44B433", "0014B0")
MAC_847207_C7 = ("0", "B", "C", "D", "E")   # 847207 의 7번째 자리(통신방식을 가르는 자리)
_MAC_HEX = set("0123456789ABCDEF")


def mac_format_error(mac: str) -> dict:
    """모뎀맥 형식 검사 = 글자 → 자릿수 → 앞 6자리 순. 정상이면 {}.

    반환 {reason, suggest}. reason 은 사람이 읽을 사유, suggest 는 한 글자 차이 후보(있을 때만).
    ★자릿수가 아직 모자란 '입력 중' 판정은 여기서 하지 않는다 — 그건 화면(아미큐/헬퍼) 몫이다.
      여기 오는 값은 이미 다 입력된(또는 스캔된) 값으로 본다.
    """
    s = re.sub(r'[\s:\-*]', '', str(mac or '')).upper()
    if not s:
        return {"reason": "비어 있음", "suggest": ""}

    # 1) 글자 — 0-9·A-F 밖은 무조건 오독
    bad = sorted(set(ch for ch in s if ch not in _MAC_HEX))
    if bad:
        return {"reason": "맥에 없는 글자 %s — 0~9·A~F 만 쓴다" % "".join(bad), "suggest": ""}

    # 2) 자릿수 — LTE 11자리(전부 숫자) / hex 12자리 둘뿐
    if s.startswith("012") and s.isdigit():
        if len(s) != 11:
            return {"reason": "LTE 맥은 012+8자리=11자리인데 %d자리" % len(s), "suggest": ""}
        return {}
    if len(s) != 12:
        return {"reason": "자릿수 안 맞음 %d자리 — hex 12자리 또는 012+8자리" % len(s), "suggest": ""}

    # 3) 앞 6자리 — 5개 밖은 없다. 한 글자 차이면 후보를 알려준다(자동 고치지는 않는다)
    oui = s[:6]
    if oui not in MAC_OUI:
        near = [o for o in MAC_OUI if sum(1 for a, b in zip(o, oui) if a != b) == 1]
        return {"reason": "쓰지 않는 앞자리 %s" % oui, "suggest": " / ".join(near)}
    if oui == "847207" and s[6] not in MAC_847207_C7:
        return {"reason": "847207 의 7번째 자리는 0·B·C·D·E 인데 %s" % s[6], "suggest": ""}
    return {}


# ── 통신방식 자동판별 (헬퍼 awms-bridge-inject.js macToSuffix/inferMasterINST_S 이식) ──
def _mac_raw_suffix(mac: str) -> str:
    """모뎀맥 → 통신방식 마커: 'LTE'/'SKIP'/'10'/'20'/'90' 또는 ''(미상).
    suffix: 10=ks-plc 20=hpgp 70=lte_IV 90=k-dcu 92=smgw-c."""
    raw = re.sub(r'\D', '', str(mac or ''))
    m = re.sub(r'[^0-9A-F]', '', str(mac or '').upper())
    if re.match(r'^012\d{8}$', raw):
        return 'LTE'
    if m.startswith('847207'):
        c = m[6:7]
        if c == '0':
            c89 = m[7:9]
            return '10' if c89 in ('E3', 'E4', 'D9') else '90'   # E3/E4/D9=ks-plc, 그외 0=k-dcu
        if c == 'E':
            return '90'                                          # k-dcu
        if c in ('B', 'C', 'D'):
            return '10'                                          # ks-plc
    if m.startswith('E0AEED'):
        return '10'                                              # ks-plc
    if m.startswith('44B433') or m.startswith('0014B0'):
        return '20'                                              # hpgp
    if m.startswith('AC5E8C'):
        return '90'                                              # k-dcu (영준님 2026-10-20: AC 모뎀은 전부 k-dcu)
    return ''


def infer_inst_s(inst_m: str, mac: str) -> str:
    """INST_S = INST_M + suffix. 미상/SKIP이면 ''(프론트 직접선택 필요)."""
    if not inst_m:
        return ''
    suf = _mac_raw_suffix(mac)
    if suf in ('', 'SKIP'):
        return ''
    if suf == 'LTE':
        return inst_m + ('92' if inst_m == 'HW4050' else '70')  # 아미고=smgw-c, 그외=lte_IV
    return inst_m + suf                                          # PLC/k-dcu/hpgp = 맥으로 확정




# 통신방식 suffix 코드표 (헬퍼 awms-bridge-inject.js L1102 일치). 직접선택 UI 옵션 단일출처.
COMM_SUFFIX_LABELS = [
    ("10", "KS-PLC"), ("20", "HPGP"), ("40", "LTE"),
    ("70", "LTE_IV"), ("80", "IoT-PLC"), ("90", "K-DCU"), ("92", "SMGW-C(아미고)"),
]
_COMM_LABEL = dict(COMM_SUFFIX_LABELS)


# 계기유형(INST_M) = 계기번호 타입코드 자동판별 (daily_cycle TYPE_MAP 이식)
_TYPE_MAP = {'17': 'E', '19': 'EA', '25': 'G', '26': 'G', '27': 'G',
             '45': 'G', '46': 'G', '47': 'G', '52': 'Amigo', '53': 'Amigo', '54': 'Amigo', '55': 'Amigo'}
_TYPE_TO_INSTM = {'E': 'HW4020', 'EA': 'HW4040', 'G': 'HW4030', 'Amigo': 'HW4050'}


# 슬레이브 분기(BUNGI) 허용값 — 영준님 2026-09-29 "강제로 0.5를 넣을지 무선으로 할지만".
#   ★`무선` 이 자동값이라 앞에 둔다(화면 cst-app BUNGI_CHOICES 와 같은 순서).
#     검증은 포함 여부만 보므로 순서는 동작에 영향이 없으나, 양쪽을 대조할 때 헷갈리지 않게 맞춘다.
#   원장 실측: '없음'·'1' 도 존재하지만 **선택지로 주지 않는다**(현장이 쓰는 두 값만).
BUNGI_CHOICES = ("무선", "0.5")


def infer_inst_m(meter_no: str) -> str:
    """계기번호 → INST_M. mid[2:4](3~4번째)가 타입코드. 표준/미상=HW4010(표준)."""
    code = str(meter_no or '').zfill(11)[2:4]
    return _TYPE_TO_INSTM.get(_TYPE_MAP.get(code, ''), 'HW4010')


def slave_bungi(master_suffix: str, slave_inst_m: str):
    """슬레이브 분기 자동값과 고를 수 있는지 -> (자동값, 고를 수 있음).

    ★아미고 모뎀(마스터 suffix 92 = SMGW-C) 함체의 아미고 슬레이브(HW4050)만 무선이 자동이고
      무선·0.5 중 고를 수 있다. 그 밖은 전부 0.5 강제(영준님 2026-09-29 "lte류 모뎀에서 ae나 g 마스터
      번호 입력하면은 강제로 0.5로 바뀌어야지"). `master_suffix == "92"` 조건을 빼면 법칙이 깨진다.
    """
    can_pick = (master_suffix == "92") and slave_inst_m == "HW4050"
    return ("무선" if can_pick else "0.5"), can_pick
