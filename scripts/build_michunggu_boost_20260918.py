#!/usr/bin/env python3
"""25년 미청구 계기 13,182건 주소·변대주·통신방식·DCU 보강 (발주 2026-09-18)

발주서: research/발주_미청구_주소변대주_보강_20260918.md

대상   원장(미청구2.xlsx sheet1) 상태(O열)=='미청구' → 15,069행 / 계기 고유 13,182
산출   research/미청구_보강_20260918.json
       research/미청구_미상잔량_20260918.json
       (보고서는 research/미청구_보강_보고_20260918.md — 이 스크립트가 통계를 찍어준다)

★계기번호 접두를 지우지 마라. 영문자가 섞이면 그대로(공백·하이픈만 제거·대문자),
  순수 숫자일 때만 zfill(11). [[meter_no_prefix_preserve]]
★DB 의 `계기번호_norm` 열을 매칭에 쓰지 마라 — 접두를 뭉갰다(boranggi 47,675건이
  `A0530085519` -> `00530085519`). 반드시 원문 열에서 다시 정규화한다. (2026-09-18 실측)
★매칭키 우선순위 = 고객번호 > 계기번호+주소. 계기번호 단독은 재시공으로 바뀌므로
  보조로만 쓰고 출처에 남긴다. [[ledger_match_key_rule]]
★DCU ID(10자) = 변대주번호(8자) + 2자리. dcu_all 19,007건 전수 확인.
  그래서 DCU ID 가 있으면 변대주번호를 역산할 수 있다. [[dcuid_변대주_규칙]]
★아미맵/종로맵은 변대주 필드 의미가 반대다 — 열 이름이 아니라 **의미**로 매핑한다.
  변대주번호 = 영숫자 8자 코드(0225A972) / 변대주명 = 전주 이름(서교지 14).
  [[bdju_field_meaning_flipped]]
"""
import importlib.util
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = Path('/Users/woodelight/Projects/ami-work')
XL = MAIN / 'data/inbox_jdg_20260917/25년 AMI 보강공사_미청구2.xlsx'
DB = ROOT / 'data/ami.db'
OUT = ROOT / 'research/미청구_보강_20260918.json'
OUT_GAP = ROOT / 'research/미청구_미상잔량_20260918.json'
OUT_C = ROOT / 'research/미청구_보강_보정_20260918.json'
OUT_GAP_C = ROOT / 'research/미청구_미상잔량_보정_20260918.json'

_spec = importlib.util.spec_from_file_location(
    'recon', str(ROOT / 'scripts/미청구-필터역산-재현-20260917.py'))
_recon = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_recon)
load_sheet = _recon.load_sheet

LEDGER_COLS = {
    'A': '고유키', 'B': '앱넘버', 'C': '순번', 'D': '시공일', 'E': '시공일2', 'F': '현장구분',
    'G': '현장구분코드', 'H': '구분', 'I': '1차사업소', 'J': '2차사업소', 'K': '기존변대주',
    'L': '변경변대주', 'M': '주소', 'N': '계기번호', 'O': '상태', 'P': '계기타입', 'Q': '통신방식',
    'R': 'MAC', 'S': '시설형태', 'T': 'M/S', 'AF': '시공자', 'AK': '앱변대주', 'AL': 'DCU',
    'AM': '공종', 'AN': '철거구분', 'AR': '기성완료', 'AS': '고객번호',
}

BLANK = {'', '0', 'NAN', 'NONE', '#N/A', 'NAT', '00000000'}

# ─── 계기번호 단독 매칭 신뢰 정책 (2026-09-18 추가검증 결과) ──────────────────
# ★계기는 재사용된다. 철거한 계기가 다른 개소에 재투입돼 **같은 번호가 딴 주소에 산다.**
#   그래서 계기번호 단독으로 끌어온 주소·변대주는 남의 개소 값일 수 있다.
#   실측(scripts/verify_michunggu_meterkey_20260918.py):
#     boranggi:20260917/계기번호  오염 17.6%  (정답지 기준)  ·  10.9% (적용집합 교차검증)
#     boranggi:20260730/계기번호  25.3%   ·  20260828  51.6%  ·  site-data  19.6%
#     반면 고객번호 키 0.1~1.0% · MAC 키 0.0% · 작업중/계기번호 0.0% · gapap/계기번호 0.0%
#   -> 기본(CORRECTED=True)은 **계기번호 단독 매칭을 쓰지 않는다.**
#      원장에 있던 값이 재사용 계기 때문에 덮이는 일은 없다(빈 칸만 채우므로).
SAFE_METER_SOURCES = {'작업중', 'gapap', 'gapap_sheet2'}   # 실측 오염 0.0%
CORRECTED = True


def txt(v):
    s = str(v if v is not None else '').strip()
    return '' if s.upper() in BLANK else s


def norm_meter(v):
    """계기번호 정규화 — 영문자 접두 보존."""
    s = re.sub(r'[\s\-]', '', str(v if v is not None else '')).strip()
    if not s or s.upper() in BLANK:
        return ''
    if re.search(r'[A-Za-z]', s):
        return s.upper()
    return s.zfill(11)


def norm_cust(v):
    s = re.sub(r'\D', '', str(v if v is not None else ''))
    return s.zfill(10) if s and s.strip('0') else ''


def norm_bdju_no(v):
    """변대주번호 = 영숫자 8자. dcu_all 기준."""
    s = re.sub(r'[\s\-]', '', str(v if v is not None else '')).upper()
    if not s or s in BLANK or s == 'LTEDCUSU':
        return ''
    return s if re.fullmatch(r'[0-9A-Z]{8}', s) else ''


def norm_dcuid(v):
    """DCU ID = 영숫자 10자 **중 영문자를 반드시 포함**한다.

    ★순수숫자 10자리는 DCU ID 가 아니라 **LTE 회선번호**다 — dcu_all 19,007건이
      전수 영문자를 포함하고 순수숫자는 0건이다(2026-09-18 실측). 한전은 LTE 개소의
      DCU 칸에 회선번호를 넣어 보낸다. 이것을 DCU ID 로 받으면 변대주 역산(앞 8자리)이
      통째로 오염된다 — 1차 산출에서 1,854건이 그렇게 들어와 '법칙 위반' 792건으로 잡혔다.
    """
    s = re.sub(r'[\s\-]', '', str(v if v is not None else '')).upper()
    if not s or s in BLANK:
        return ''
    if not re.fullmatch(r'[0-9A-Z]{10}', s):
        return ''
    return s if re.search(r'[A-Z]', s) else ''


def lte_line_no(v):
    """LTE 회선번호 = 순수숫자 10자리(한전이 DCU 칸에 실어 보내는 값)."""
    s = re.sub(r'[\s\-]', '', str(v if v is not None else ''))
    return s if re.fullmatch(r'\d{10}', s) else ''


def norm_mac(v):
    """모뎀 MAC 정규화. 012+8자리(LTE 회선번호형) · hex 12자리만 인정.
    ★15·16자리 순수숫자는 한전 인코딩 값이라 012 MAC 으로 복원한다.
      [[boranggi_mac_restore_and_amigo_wireless]]"""
    s = re.sub(r'[\s:\-*.]', '', str(v if v is not None else '')).upper()
    if not s or s in BLANK:
        return ''
    if re.fullmatch(r'012\d{8}', s):
        return s
    if re.fullmatch(r'[0-9A-F]{12}', s):
        return s
    if re.fullmatch(r'\d{13}', s) and s.startswith('0'):     # '0101248684679' 꼴
        c = s[1:]
        return c if re.fullmatch(r'012\d{8}', c) else ''
    if re.fullmatch(r'\d{15,16}', s):                        # 한전 인코딩 -> ASCII 복원
        try:
            asc = bytes.fromhex(s if len(s) % 2 == 0 else '0' + s).decode('ascii')
        except Exception:
            return ''
        asc = re.sub(r'\D', '', asc)
        return ('012' + asc) if re.fullmatch(r'\d{8}', asc) else (asc if re.fullmatch(r'012\d{8}', asc) else '')
    return ''


def log(m):
    print(m, flush=True)


# ─── 1. 원장 미청구 ────────────────────────────────────────────────────────────
def load_targets():
    L = load_sheet(str(XL), 'xl/worksheets/sheet1.xml', LEDGER_COLS, '원장')
    mc = L[L['상태'] == '미청구'].copy()
    log(f'미청구 행 {len(mc):,}')

    by_meter = {}
    order = []
    for r in mc.to_dict('records'):
        m = norm_meter(r.get('계기번호'))
        if not m:
            continue
        if m not in by_meter:
            by_meter[m] = {'_rows': [], '계기번호_원문': str(r.get('계기번호') or '').strip()}
            order.append(m)
        by_meter[m]['_rows'].append(r)

    out = []
    for m in order:
        rows = by_meter[m]['_rows']
        # 대표행 = 시공행(코드 0) 우선, 그 중 시공일 최신
        sig = [r for r in rows if str(r.get('현장구분코드') or '') == '0'] or rows
        sig = sorted(sig, key=lambda r: str(r.get('시공일') or ''))
        rep = sig[-1]

        def pick(col):
            """행들 중 유효값을 최신 시공일 순으로 고른다."""
            for r in sorted(rows, key=lambda x: str(x.get('시공일') or ''), reverse=True):
                v = txt(r.get(col))
                if v:
                    return v
            return ''

        out.append({
            '계기번호': by_meter[m]['계기번호_원문'],
            '_m': m,
            '고객번호': norm_cust(pick('고객번호')),
            '지사': txt(rep.get('2차사업소')),
            '지번주소': pick('주소'),
            '도로명주소': '',
            '변대주번호': norm_bdju_no(pick('기존변대주')) or norm_bdju_no(pick('변경변대주')),
            '변대주명': '',
            '통신방식': pick('통신방식'),
            'DCU_ID': norm_dcuid(pick('DCU')),
            'LTE회선번호': lte_line_no(pick('DCU')),
            'MAC': norm_mac(pick('MAC')),
            '공종': pick('공종'),
            '구분': txt(rep.get('구분')),
            '계기타입': txt(rep.get('계기타입')),
            '최종시공일': max((str(r.get('시공일') or '') for r in rows), default=''),
            '원장행수': len(rows),
        })
    log(f'계기 고유 {len(out):,}')
    return out, mc, L


# ─── 2. 소스 색인 ─────────────────────────────────────────────────────────────
class Sources:
    """각 색인은 {키: dict(필드)} 로 통일한다. 먼저 넣은 값이 이긴다(신선한 판부터 적재)."""

    def __init__(self, con, ledger_all=None):
        self.con = con
        self.by_cust = defaultdict(dict)     # 출처명 -> {고객번호: rec}
        self.by_meter = defaultdict(dict)    # 출처명 -> {계기번호: rec}
        self.by_mac = {}                     # MAC -> rec (원장 전체, 동일 모뎀=동일 개소)
        self.dcu_by_no = {}                  # 변대주번호 -> dcu_all 행
        self.dcu_by_id = {}                  # DCU ID   -> dcu_all 행
        self.dcu_by_name = {}                # (지사,변대주명) -> dcu_all 행
        self._load()
        if ledger_all is not None:
            self._load_ledger_mac(ledger_all)

    def _load_ledger_mac(self, L):
        """★같은 모뎀 MAC = 같은 개소다. 원장 **전체** 287,860행에서 MAC 색인을 만든다.
        미청구 행만으로는 안 채워지는 주소·변대주가, 같은 모뎀에 물린 청구된 계기 행에는
        들어 있다. 다만 모뎀이 이설되면 어긋나므로 출처를 따로 남겨 구분 가능하게 둔다."""
        n = 0
        for r in L.to_dict('records'):
            mac = norm_mac(r.get('MAC'))
            if not mac:
                continue
            cur = self.by_mac.setdefault(mac, {})
            for f, col in (('지번주소', '주소'), ('변대주번호', '기존변대주'),
                           ('고객번호', '고객번호'), ('지사', '2차사업소')):
                if cur.get(f):
                    continue
                v = (norm_bdju_no(r.get(col)) if f == '변대주번호'
                     else norm_cust(r.get(col)) if f == '고객번호' else txt(r.get(col)))
                if v:
                    cur[f] = v
                    n += 1
        log(f'원장전체 MAC 색인 {len(self.by_mac):,}개 (값 {n:,})')

    def _put(self, src, cust, meter, rec):
        rec = {k: v for k, v in rec.items() if v}
        if not rec:
            return
        if cust and cust not in self.by_cust[src]:
            self.by_cust[src][cust] = rec
        if meter and meter not in self.by_meter[src]:
            self.by_meter[src][meter] = rec

    def _load(self):
        c = self.con.cursor()

        # dcu_all — 변대주번호/ID 대장
        for did, no, nm, comm, dept, line in c.execute(
                'SELECT "DCU ID",변대주번호,변대주명,"인입망 통신방식",지사,회선상태 FROM dcu_all'):
            row = {'DCU_ID': norm_dcuid(did), '변대주번호': norm_bdju_no(no),
                   '변대주명': txt(nm), '통신방식': txt(comm), '지사': txt(dept), '회선상태': txt(line)}
            if row['변대주번호']:
                self.dcu_by_no.setdefault(row['변대주번호'], row)
            if row['DCU_ID']:
                self.dcu_by_id.setdefault(row['DCU_ID'], row)
            if row['변대주명']:
                # ★이름으로도 찾을 수 있게. 지사까지 맞는 쪽을 먼저 본다(동명이주 방지).
                self.dcu_by_name.setdefault((row['지사'], row['변대주명']), row)
                self.dcu_by_name.setdefault(('', row['변대주명']), row)
        log(f'dcu_all: 변대주번호 {len(self.dcu_by_no):,} · DCU ID {len(self.dcu_by_id):,}'
            f' · 변대주명 {len(self.dcu_by_name):,}')

        # boranggi — 판이 여럿이다. 신선한 판부터 넣어 먼저 넣은 값이 이기게 한다.
        snaps = [r[0] for r in c.execute(
            'SELECT DISTINCT snapshot FROM boranggi ORDER BY snapshot DESC')]
        for sn in snaps:
            for (mt, mt2, cust, bdju, ipju, did, did2, comm, comm2, jibun, road,
                 mac, mac2, dept) in c.execute(
                    'SELECT 계기번호,계기번호_2,고객번호,변대주,인입주,"DCU ID","DCU ID_2",'
                    '통신방식,통신방식_2,지번,도로명,"모뎀 MAC","모뎀 MAC_2",지사 '
                    'FROM boranggi WHERE snapshot=?', (sn,)):
                # ★접미 없는 쪽 = 철거계기, _2 = 신설계기. 신설이 지금 달려 있는 계기다.
                #   [[boranggi_meter_column_pair_removed_new]]
                cu = norm_cust(cust)
                rec = {'지번주소': txt(jibun), '도로명주소': txt(road),
                       '변대주명': txt(bdju), '인입주': txt(ipju), '지사': txt(dept),
                       '고객번호': cu}
                dnew, dold = norm_dcuid(did2), norm_dcuid(did)
                rec['DCU_ID'] = dnew or dold
                rec['LTE회선번호'] = lte_line_no(did2) or lte_line_no(did)
                rec['통신방식'] = txt(comm2) or txt(comm)
                rec['MAC'] = norm_mac(mac2) or norm_mac(mac)
                src = f'boranggi:{sn}'
                for mm in (norm_meter(mt2), norm_meter(mt)):
                    self._put(src, cu, mm, rec)
                    cu = ''      # 고객번호 색인 등록은 한 번만(값 자체는 rec 에 남는다)
        log(f'boranggi 색인 {len(snaps)}판')

        # 작업중 (미청구2 판) — 주소·기존변대주·MAC·DCU·통신방식
        for mt, cust, addr, bd, bd2, dcu, comm, mac, dept in c.execute(
                'SELECT 계기번호,고객번호,주소,기존변대주,변경변대주,DCU,통신방식,MAC,"2차사업소" '
                'FROM 작업중 WHERE snapshot=?', ('20260917-미청구2',)):
            self._put('작업중', norm_cust(cust), norm_meter(mt), {
                '지번주소': txt(addr), '변대주번호': norm_bdju_no(bd) or norm_bdju_no(bd2),
                'DCU_ID': norm_dcuid(dcu), 'LTE회선번호': lte_line_no(dcu),
                '통신방식': txt(comm), 'MAC': norm_mac(mac),
                '지사': txt(dept), '고객번호': norm_cust(cust)})

        # 계기교체_보강현황_* (보강현황 계보의 별도 적재분) — 지번·도로명·통신방식
        for tbl in [r[0] for r in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name LIKE '계기교체_보강현황_%'")]:
            for mt, cust, jibun, road, comm, dept in c.execute(
                    f'SELECT 계기번호,고객번호,지번,도로명,통신방식,지사 FROM "{tbl}"'):
                self._put(tbl, norm_cust(cust), norm_meter(mt), {
                    '지번주소': txt(jibun), '도로명주소': txt(road),
                    '통신방식': txt(comm), '지사': txt(dept), '고객번호': norm_cust(cust)})

        # modem_work — 26년 시공 실적축. 변대주번호·DCUID·기존모뎀MAC
        for sn in ('20260908', '20260828'):
            for mt, bno, did, mac, dept in c.execute(
                    'SELECT 계기번호,변대주번호,DCUID,기존모뎀MAC,지사 FROM modem_work WHERE snapshot=?', (sn,)):
                self._put(f'modem_work:{sn}', '', norm_meter(mt), {
                    '변대주번호': norm_bdju_no(bno), 'DCU_ID': norm_dcuid(did),
                    'LTE회선번호': lte_line_no(did),
                    'MAC': norm_mac(mac), '지사': txt(dept)})

        # jangae — 주소·변대주번호·DCUID
        for mt, addr, bno, did, mac, dept in c.execute(
                'SELECT 계기번호,주소,변대주번호,DCUID,기존모뎀MAC,지사 FROM jangae'):
            self._put('jangae', '', norm_meter(mt), {
                '지번주소': txt(addr), '변대주번호': norm_bdju_no(bno),
                'DCU_ID': norm_dcuid(did), 'LTE회선번호': lte_line_no(did),
                'MAC': norm_mac(mac), '지사': txt(dept)})

        # gapap / gapap_sheet2 — 고압 주소
        for tbl, mcol, acol in (('gapap', '계기번호', '주소'), ('gapap_sheet2', '계기번호', '주소')):
            for mt, addr, cust in c.execute(
                    f'SELECT "{mcol}","{acol}",'
                    + ('고객번호' if tbl == 'gapap' else "''") + f' FROM {tbl}'):
                self._put(tbl, norm_cust(cust), norm_meter(mt), {'지번주소': txt(addr)})

        # skt_all — 주소·변대번호
        for mt, cust, a1, a2, bd in c.execute(
                'SELECT 계기번호,고객번호,주소1,주소2,변대번호 FROM skt_all'):
            self._put('skt_all', norm_cust(cust), norm_meter(mt), {
                '지번주소': txt(a1) or txt(a2), '변대주명': txt(bd), '고객번호': norm_cust(cust)})

        # 종로 준공·검수 — 계약번호=고객번호, 부설/철거 전력량계번호 양쪽을 키로
        for tbl in ('jongno_jungong', 'jongno_geomsu'):
            for cust, addr, mnew, mold in c.execute(
                    f'SELECT 계약번호,주소,부설전력량계번호,철거전력량계번호 FROM {tbl}'):
                cu = norm_cust(cust)
                for mm in (norm_meter(mnew), norm_meter(mold)):
                    self._put(tbl, cu, mm, {'지번주소': txt(addr), '고객번호': cu})
                    cu = ''

        # 파일 소스 — 실효(site-data) · 합동 아카이브
        for name, path in (('site-data', ROOT / 'data/site-data.json'),
                           ('hapdong-archive', ROOT / 'data/hapdong-data-archive.json'),
                           ('hapdong', ROOT / 'data/hapdong-data.json')):
            if not path.exists():
                continue
            for r in json.loads(path.read_text()):
                self._put(name, norm_cust(r.get('고객번호')), norm_meter(r.get('계기번호')), {
                    '지번주소': txt(r.get('지번주소')) or txt(r.get('주소')),
                    '도로명주소': txt(r.get('도로명주소')),
                    # ★아미맵/합동은 '변대주'가 **이름**이고 'DCUID'가 ID 다. 의미로 매핑한다.
                    '변대주명': txt(r.get('변대주')),
                    'DCU_ID': norm_dcuid(r.get('DCUID')),
                    'LTE회선번호': lte_line_no(r.get('DCUID')),
                    '통신방식': txt(r.get('통신방식')), 'MAC': norm_mac(r.get('모뎀MAC')),
                    '지사': txt(r.get('지사')), '고객번호': norm_cust(r.get('고객번호'))})
        log('소스 색인 완료: ' + ', '.join(
            f'{k}({len(v):,})' for k, v in sorted(self.by_meter.items())))

    def order(self):
        """조회 순서 — 신선하고 신뢰도 높은 것부터."""
        pref = ['작업중', 'site-data', 'hapdong', 'hapdong-archive']
        bo = sorted([k for k in self.by_meter if k.startswith('boranggi')], reverse=True)
        mw = sorted([k for k in self.by_meter if k.startswith('modem_work')], reverse=True)
        rest = [k for k in self.by_meter if k not in pref + bo + mw]
        return bo + pref + mw + sorted(rest)


# ─── 3. 보강 ──────────────────────────────────────────────────────────────────
FIELDS = ['지번주소', '도로명주소', '변대주번호', '변대주명', '통신방식', 'DCU_ID',
          'LTE회선번호', 'MAC', '고객번호', '지사']


def _sweep(targets, S, contrib):
    """테이블 색인 1회 통과. 고객번호로 먼저, 없으면 계기번호로 맞춘다."""
    srcs = S.order()
    for t in targets:
        for src in srcs:
            need = [f for f in FIELDS if not t.get(f)]
            if not need:
                break
            # ★고객번호 우선, 계기번호는 보조 — 어느 키로 맞췄는지 출처에 남긴다.
            rec, how = None, ''
            if t['고객번호'] and t['고객번호'] in S.by_cust.get(src, {}):
                rec, how = S.by_cust[src][t['고객번호']], '고객번호'
            elif t['_m'] and t['_m'] in S.by_meter.get(src, {}):
                # ★계기번호 단독 매칭은 재사용 계기 때문에 오염된다 — 실측 소스만 허용한다.
                if CORRECTED and src not in SAFE_METER_SOURCES:
                    continue
                rec, how = S.by_meter[src][t['_m']], '계기번호'
            if not rec:
                continue
            for f in need:
                v = rec.get(f)
                if v:
                    t[f] = v
                    t['출처'][f] = f'{src}/{how}'
                    contrib[f'{src}/{f}'] += 1


def enrich(targets, S):
    contrib = Counter()
    for t in targets:
        t['출처'] = {f: ('원장' if t.get(f) else '') for f in FIELDS}
        for f in FIELDS:
            t.setdefault(f, '')

    # 1패스 — 있는 키로 훑는다
    _sweep(targets, S, contrib)
    # 2패스 — 1패스에서 **고객번호가 새로 채워진** 건이 있으므로 그 키로 다시 훑는다.
    #   (원장 고객번호 확보율이 40% 뿐이라 이 한 번이 크게 먹는다)
    _sweep(targets, S, contrib)

    # 3패스 — 같은 모뎀 MAC 의 다른 행에서 끌어온다(동일 개소 가정, 출처를 따로 남긴다)
    for t in targets:
        need = [f for f in FIELDS if not t.get(f)]
        if not need or not t.get('MAC'):
            continue
        rec = S.by_mac.get(t['MAC'])
        if not rec:
            continue
        for f in need:
            v = rec.get(f)
            if v:
                t[f] = v
                t['출처'][f] = '원장전체/MAC(동일모뎀)'
                contrib[f'원장전체MAC/{f}'] += 1

    # ── DCU <-> 변대주 역산 (dcu_all 대장) ────────────────────────────────────
    rev = Counter()
    for t in targets:
        # DCU ID -> 변대주번호 (앞 8자리). 대장에 있으면 대장값으로 확정한다.
        if t['DCU_ID'] and not t['변대주번호']:
            hit = S.dcu_by_id.get(t['DCU_ID'])
            if hit:
                t['변대주번호'] = hit['변대주번호']
                t['출처']['변대주번호'] = 'dcu_all/DCUID역산'
                rev['DCUID->변대주번호(대장확인)'] += 1
            else:
                # 대장에 없는 DCU ID — 법칙(앞 8자리)으로만 역산하고 근거를 구분해 남긴다
                t['변대주번호'] = t['DCU_ID'][:8]
                t['출처']['변대주번호'] = '규칙/DCUID앞8자리(대장미확인)'
                rev['DCUID->변대주번호(규칙만·대장없음)'] += 1
        # 변대주명 -> 변대주번호 (지사까지 맞는 쪽 우선. 동명이주가 있어 지사 없는 폴백은 뒤로)
        if t['변대주명'] and not t['변대주번호']:
            hit = S.dcu_by_name.get((t['지사'], t['변대주명'])) or S.dcu_by_name.get(('', t['변대주명']))
            if hit:
                t['변대주번호'] = hit['변대주번호']
                t['출처']['변대주번호'] = 'dcu_all/변대주명역산'
                rev['변대주명->변대주번호'] += 1
        # 변대주번호 -> 변대주명 / DCU ID
        if t['변대주번호']:
            hit = S.dcu_by_no.get(t['변대주번호'])
            if hit:
                if not t['변대주명']:
                    t['변대주명'] = hit['변대주명']
                    t['출처']['변대주명'] = 'dcu_all/변대주번호'
                    rev['변대주번호->변대주명'] += 1
                if not t['DCU_ID']:
                    t['DCU_ID'] = hit['DCU_ID']
                    t['출처']['DCU_ID'] = 'dcu_all/변대주번호'
                    rev['변대주번호->DCUID'] += 1

    for t in targets:
        t['변대주_대장확인'] = bool(t['변대주번호'] and t['변대주번호'] in S.dcu_by_no)
        t['DCU_대장확인'] = bool(t['DCU_ID'] and t['DCU_ID'] in S.dcu_by_id)

    # ── 교정: 원장 변대주가 대장에 없고 DCU 는 대장에 있으면 대장 쪽을 쓴다 ──────
    #   원장 `기존변대주` 에는 대장에 없는 순수숫자 8자리(31410243 꼴)가 섞여 있다.
    #   dcu_all 19,007건은 전수 영문자를 포함하므로 그런 값은 변대주번호가 아니다.
    #   ★둘 다 대장에 있으면 교체 전/후가 갈린 정상 케이스이므로 **변대주를 남긴다**
    #     (영준님 2026-09-09 "DCU ID 는 옛 소속을 가리킬 수 있다 -> 변대주 우선").
    for t in targets:
        if t['DCU_대장확인'] and not t['변대주_대장확인'] and t['변대주번호']:
            hit = S.dcu_by_id[t['DCU_ID']]
            t['변대주번호_원장값'] = t['변대주번호']
            t['변대주번호'] = hit['변대주번호']
            t['변대주명'] = t['변대주명'] or hit['변대주명']
            t['출처']['변대주번호'] = 'dcu_all/DCUID역산(원장값 대장미등재라 교정)'
            t['변대주_대장확인'] = True
            rev['교정:원장 변대주 대장미등재 -> DCU 대장값'] += 1

    # ── 검증: DCU_ID 앞 8자리 == 변대주번호 인가 (법칙 위반 검출) ─────────────
    bad = [t for t in targets if t['DCU_ID'] and t['변대주번호']
           and t['DCU_ID'][:8] != t['변대주번호']]
    rev['★DCUID앞8 != 변대주번호(불일치)'] = len(bad)
    for t in bad:
        t['DCU_변대주_불일치'] = True
    return contrib, rev


def comm_from_mac(mac):
    """MAC 으로 통신방식 보조 판별. 원장 통신방식이 비었을 때만 쓴다.
    012+8자리 = LTE 회선번호형 / hex 12자리 = 유선(PLC·K-DCU·HPGP 계열, 세부는 DCU 대장으로)."""
    if not mac:
        return '', ''
    if re.fullmatch(r'012\d{8}', mac):
        return 'LTE', 'MAC 012+8자리(LTE 회선번호형)'
    if re.fullmatch(r'[0-9A-F]{12}', mac):
        return '', 'MAC hex12(유선계열 — 세부는 DCU 대장 필요)'
    return '', ''


def main():
    log('=== 1) 대상 ===')
    targets, mc_rows, ledger_all = load_targets()

    log('\n=== 2) 소스 색인 ===')
    con = sqlite3.connect(DB)
    S = Sources(con, ledger_all)

    log('\n=== 3) 보강 ===')
    before = {f: sum(1 for t in targets if t.get(f)) for f in FIELDS}
    contrib, rev = enrich(targets, S)

    # 통신방식이 끝까지 빈 건만 MAC 보조 판별
    for t in targets:
        if not t['통신방식']:
            v, why = comm_from_mac(t['MAC'])
            if v:
                t['통신방식'] = v
                t['출처']['통신방식'] = '규칙/' + why
        t['판별근거'] = t['출처'].get('통신방식', '')
    after = {f: sum(1 for t in targets if t.get(f)) for f in FIELDS}

    n = len(targets)
    log(f'\n{"필드":10s} {"원장":>8s} {"보강후":>8s} {"증가":>7s}   확보율')
    cov = {}
    for f in FIELDS:
        cov[f] = (before[f], after[f], after[f] - before[f], after[f] / n * 100)
        log(f'{f:10s} {before[f]:8,} {after[f]:8,} {after[f]-before[f]:+7,}   {after[f]/n*100:5.1f}%')
    # 주소 = 지번 또는 도로명 중 하나라도
    addr_b = sum(1 for t in targets if t['출처']['지번주소'] == '원장')
    addr_a = sum(1 for t in targets if t['지번주소'] or t['도로명주소'])
    log(f'{"주소(둘중)":10s} {addr_b:8,} {addr_a:8,} {addr_a-addr_b:+7,}   {addr_a/n*100:5.1f}%')

    log('\n=== 소스별 기여 (상위 25) ===')
    for k, v in contrib.most_common(25):
        log(f'  {k:42s} {v:6,}')
    log('\n=== DCU<->변대주 역산 ===')
    for k, v in rev.most_common():
        log(f'  {k:32s} {v:6,}')

    # ── 4) 원본 대조 게이트 ───────────────────────────────────────────────────
    log('\n=== 원본 대조 ===')
    src_ids = {norm_meter(x) for x in mc_rows['계기번호'] if norm_meter(x)}
    out_ids = {t['_m'] for t in targets}
    only_src, only_out = src_ids - out_ids, out_ids - src_ids
    src_alpha = sum(1 for x in src_ids if re.search(r'[A-Za-z]', x))
    out_alpha = sum(1 for x in out_ids if re.search(r'[A-Za-z]', x))
    raw_alpha = sum(1 for t in targets if re.search(r'[A-Za-z]', t['계기번호']))
    log(f'  계기 집합   원본 {len(src_ids):,} · 산출 {len(out_ids):,}'
        f' · 원본에만 {len(only_src)} · 산출에만 {len(only_out)}')
    log(f'  접두 문자   원본 {src_alpha} · 산출(정규화) {out_alpha} · 산출(원문) {raw_alpha}')
    log(f'  필드 null   ' + ' · '.join(f'{f} {n-after[f]:,}' for f in FIELDS))
    fail = []
    if only_src or only_out:
        fail.append(f'계기 집합 불일치 (원본에만 {len(only_src)} · 산출에만 {len(only_out)})')
    if not (src_alpha == out_alpha == raw_alpha):
        fail.append(f'접두 문자 유실 ({src_alpha}/{out_alpha}/{raw_alpha})')
    if fail:
        log('\n★대조 실패 — 저장하지 않는다')
        for f_ in fail:
            log('   · ' + f_)
        return 1

    # ── 5) 저장 ──────────────────────────────────────────────────────────────
    recs = []
    for t in targets:
        r = {k: t[k] for k in ('계기번호', '고객번호', '지사', '지번주소', '도로명주소',
                               '변대주명', '변대주번호', '통신방식', 'DCU_ID', 'LTE회선번호',
                               'MAC', '공종', '구분', '계기타입', '최종시공일')}
        r['변대주_대장확인'] = t['변대주_대장확인']
        r['DCU_대장확인'] = t['DCU_대장확인']
        r['판별근거'] = t['판별근거']
        r['주소출처'] = t['출처']['지번주소'] or t['출처']['도로명주소']
        r['변대주출처'] = t['출처']['변대주번호'] or t['출처']['변대주명']
        r['보강여부'] = {f: ('원장' if t['출처'][f] == '원장'
                          else ('보강' if t['출처'][f] else '미상')) for f in FIELDS}

        def grade(src):
            if not src:
                return '미상'
            if src == '원장':
                return 'A_원장'
            if src.endswith('/고객번호'):
                return 'B_고객번호키'
            if 'MAC' in src:
                return 'B_MAC키'
            if src.startswith('dcu_all') or src.startswith('규칙'):
                return 'B_DCU대장역산'
            if src.endswith('/계기번호'):
                return ('B_계기번호키(오염0%실측)'
                        if src.split('/')[0] in SAFE_METER_SOURCES else 'C_계기번호키(오염의심)')
            return '기타'
        r['신뢰등급'] = {'주소': grade(r['주소출처']), '변대주': grade(r['변대주출처'])}
        recs.append(r)
    out_path = OUT_C if CORRECTED else OUT
    out_gap_path = OUT_GAP_C if CORRECTED else OUT_GAP
    out_path.write_text(json.dumps(recs, ensure_ascii=False, indent=1))
    log(f'\n저장 {out_path}  {len(recs):,}건')

    # 미상 잔량 = 주소 또는 변대주가 끝까지 안 채워진 계기
    # ★DCU_ID 는 **유선계열에서만** 결손으로 센다 — LTE 개소는 DCU 가 없는 것이 정상이다.
    WIRED = {'KS-PLC', 'K-DCU', 'HPGP', 'IoT-PLC', 'Iot-PLC', 'Zigbee', 'SMGW-C'}
    gap = []
    for t, r in zip(targets, recs):
        missing = [f for f in ('지번주소', '변대주번호', '변대주명', '고객번호') if not t.get(f)]
        if t['통신방식'] in WIRED and not t.get('DCU_ID'):
            missing.append('DCU_ID(유선인데 없음)')
        if not (t['지번주소'] or t['도로명주소']):
            missing.append('주소전체')
        if missing:
            gap.append({'계기번호': r['계기번호'], '지사': r['지사'], '고객번호': r['고객번호'],
                        '공종': r['공종'], '구분': r['구분'], '통신방식': r['통신방식'],
                        'MAC': r['MAC'], '최종시공일': r['최종시공일'],
                        '결손필드': missing,
                        '지번주소': r['지번주소'], '변대주번호': r['변대주번호']})
    agg_dept = Counter(g['지사'] for g in gap)
    agg_field = Counter(f for g in gap for f in g['결손필드'])
    noaddr = [g for g in gap if '주소전체' in g['결손필드']]
    payload = {
        '생성': '2026-09-18',
        '출처': '원장 미청구 15,069행 / 계기 13,182 — 보강 후 잔량',
        '건수': len(gap),
        '주소전체결손': len(noaddr),
        '지사별': dict(agg_dept.most_common()),
        '결손필드별': dict(agg_field.most_common()),
        '지사별_주소전체결손': dict(Counter(g['지사'] for g in noaddr).most_common()),
        '목록': gap,
    }
    out_gap_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    log(f'저장 {out_gap_path}  잔량 {len(gap):,}건 (주소 전체 결손 {len(noaddr):,})')
    log(f'  지사별: {dict(agg_dept.most_common())}')
    log(f'  결손필드별: {dict(agg_field.most_common())}')
    return 0


if __name__ == '__main__':
    if '--raw' in sys.argv:          # 보정 전(계기번호 단독 매칭 포함) 재현용
        CORRECTED = False
    sys.exit(main())
