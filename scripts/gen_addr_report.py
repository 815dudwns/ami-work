#!/usr/bin/env python3
"""주소 내역 리포트 — 모뎀(MAC) 기준 + 계기마다 타임라인 (영준님 2026-09-30)

  python3 scripts/gen_addr_report.py "연희동 141-34"
  python3 scripts/gen_addr_report.py "연희로36길 26"      # 도로명도 된다
  python3 scripts/gen_addr_report.py 25190137324          # 계기번호로 주소를 찾아준다

산출: reports/addr-<지번>-<서명>.html  (GitHub Pages 로 폰에서 열린다)

★구성(영준님 지정 2026-09-30):
  - **정렬은 MAC(모뎀) 기준.** 그 아래에 계기를 두고, 계기마다 **타임라인**으로 변화를 쌓는다.
  - 타임라인 순서 = 시공내역 > 불가 및 이후 작업(다른 사람 작업) > 미청구 상태.
  - **모든 정보를 다 싣는다** — 특히 동호수·비고. 원장 54열 중 값이 있는 것 전부 + 대장
    (공동주택명·상호명·계약종별·검침방법·계기교체일·LP) + 지도 데이터셋 필드.

★왜 계기 타임라인인가 — 같은 계기가 여러 번 등록된다(모뎀 교체·재방문·타 작업자 재시공).
  주소로만 보면 행이 뒤섞여 무슨 일이 있었는지 안 보인다. 실측 연희동 141-34: 25190117703 은
  2025-09-22 우영준 시공(미청구) -> 2026-01-13 조은규 재시공(청구) -> 같은 날 불가까지 찍혀 있다.

★한 계기가 여러 MAC 에 나타나는 것은 **오류가 아니라 정보다**(모뎀이 갈렸다는 뜻). 그래서
  MAC 섹션마다 그 계기를 싣고, 카드 안 타임라인은 **그 계기의 전체 이력**을 보여준다.
"""
import hashlib
import html
import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data/ami.db'
OUTDIR = ROOT / 'reports'
KST = ZoneInfo('Asia/Seoul')
LEDGER = '20260227다운로드_2025_03_24에서2026_0'
BULGA = '25년_보강_불가__sheet1'
SNAP = '20260917-미청구2'

DATASETS = [
    ('data/michunggu-data.json', '25미청구'),
    ('data/michunggu-pending.json', '25미청구(주소대기)'),
    ('data/michunggu-bulga-data.json', '25년불가'),
    ('data/site-data.json', '실효'),
    ('data/hapdong-data.json', '합동'),
    ('data/hapdong-data-archive.json', '합동(백업)'),
]
# 원장에서 타임라인 머리글로 이미 쓰는 것 — 필드표에서 빼 중복을 줄인다
SKIP = {'계기번호', '계기번호_norm', 'mac_norm', 'MAC', '고객번호_norm', 'snapshot',
        'src_file', 'visible', 'xl_row', '시공일2', '주소', '시공일', '계기타입'}
EMPTY = {'', '#N/A', 'None', 'nan', '|', '0'}


def norm_meter(v):
    s = ''.join(str(v or '').split()).upper()
    return s.zfill(11) if s.isdigit() else s


def blank(v):
    return str(v or '').strip() in EMPTY


def ymd(v):
    s = str(v or '').strip()
    if not s or s in ('#N/A', 'None'):
        return None, ''
    d = re.sub(r'\D', '', s)
    if len(d) < 8:
        return None, ''
    tm = f'{d[8:10]}:{d[10:12]}' if len(d) >= 12 and d[8:12] != '0000' else ''
    return f'{d[:4]}-{d[4:6]}-{d[6:8]}', tm


def resolve_target(cur, q):
    q = q.strip()
    if re.fullmatch(r'[0-9A-Z]{10,11}', q.upper()):
        m = norm_meter(q)
        for t in (LEDGER, BULGA):
            r = cur.execute(f'SELECT DISTINCT 주소 FROM "{t}" WHERE 계기번호_norm=?'
                            ' AND ifnull(주소,"")<>""', (m,)).fetchall()
            if r:
                return [x[0] for x in r], f'계기 {q}'
        r = cur.execute('SELECT DISTINCT 지번 FROM boranggi WHERE 계기번호_norm=?'
                        ' AND ifnull(지번,"")<>""', (m,)).fetchall()
        if r:
            return [x[0] for x in r], f'계기 {q}'
        sys.exit(f'계기 {q} 의 주소를 못 찾았다')
    hits = set()
    for t in (LEDGER, BULGA):
        for (a,) in cur.execute(f'SELECT DISTINCT 주소 FROM "{t}" WHERE 주소 LIKE ?', (f'%{q}%',)):
            if a:
                hits.add(a)
    if not hits:
        for (j,) in cur.execute('SELECT DISTINCT 지번 FROM boranggi WHERE 도로명 LIKE ?'
                                ' AND ifnull(지번,"")<>""', (f'%{q}%',)):
            hits.add(j)
        for f, _ in DATASETS:
            p = ROOT / f
            if not p.exists():
                continue
            d = json.loads(p.read_text())
            for r in (d if isinstance(d, list) else d.get('data', [])):
                if q in str(r.get('도로명주소') or '') and r.get('주소'):
                    hits.add(r['주소'])
    if not hits:
        sys.exit(f'주소 "{q}" 를 못 찾았다')
    return sorted(hits), q


def collect(cur, addrs):
    meters = {}

    def slot(m):
        m = norm_meter(m)
        if m not in meters:
            meters[m] = {'meter': m, 'ev': [], 'type': '', 'state': '', 'onmap': [],
                         'fields': {}, 'macs': [], 'lp': None, 'map': {}}
        return meters[m]

    ph = ','.join('?' * len(addrs))
    lcols = [c[1] for c in cur.execute(f'PRAGMA table_info("{LEDGER}")')]

    # ── 1) 25년 원장 (미청구/청구/불가) ─────────────────────────────
    for row in cur.execute(f'SELECT * FROM "{LEDGER}" WHERE 주소 IN ({ph}) AND snapshot=?',
                           (*addrs, SNAP)):
        d = dict(zip(lcols, row))
        s = slot(d['계기번호'])
        s['type'] = s['type'] or (d.get('계기타입') or '')
        st = d.get('col_15') or ''
        s['state'] = '청구' if st == '청구' else (s['state'] or st)
        mac = d.get('mac_norm') or ''
        # ★대표 MAC = **가장 나중 시공 행의 MAC**(영준님 2026-09-30 "미청구면 왜 맥이 hpgp 로
        #   남아있는거야? 마지막 맥으로 남아있어야지"). 함체가 갈리면 옛 MAC 섹션이 아니라
        #   **지금 물려 있는 모뎀** 아래에 있어야 현장에서 맞다. 옛 MAC 은 타임라인에 남는다.
        sd = re.sub(r'\D', '', str(d.get('시공일') or ''))
        if mac:
            if mac not in s['macs']:
                s['macs'].append(mac)
            if sd >= (s.get('mac_at') or ''):
                s['mac_at'], s['mac_last'] = sd, mac
        day, tm = ymd(d.get('시공일'))
        # 이 행의 모든 값(빈값 제외) — '모든 정보'
        det = {k: str(v).strip() for k, v in d.items()
               if k not in SKIP and not blank(v)}
        s['ev'].append({'day': day, 'tm': tm, 'kind': '불가' if st == '불가' else '시공',
                        'who': d.get('시공자') or '', 'mac': mac, 'state': st,
                        'head': ' · '.join(x for x in (d.get('통신방식'), d.get('M/S'),
                                                       d.get('집/단'), d.get('구분')) if x),
                        'src': '25년 원장', 'det': det,
                        '__row': (norm_meter(d['계기번호']), sd, mac, str(d.get('앱넘버') or ''))})
        for k, v in det.items():
            s['fields'].setdefault(k, set()).add(v)

    # ── 2) 25년 불가 원장 ───────────────────────────────────────────
    bcols = [c[1] for c in cur.execute(f'PRAGMA table_info("{BULGA}")')]
    for row in cur.execute(f'SELECT * FROM "{BULGA}" WHERE 주소 IN ({ph})', addrs):
        d = dict(zip(bcols, row))
        s = slot(d['계기번호'])
        s['type'] = s['type'] or (d.get('계기타입') or '')
        s['state'] = s['state'] or '불가'
        day, tm = ymd(d.get('시공일'))
        det = {k: str(v).strip() for k, v in d.items() if k not in SKIP and not blank(v)}
        why = ' / '.join(x for x in (d.get('비고1'), d.get('비고2')) if not blank(x))
        s['ev'].append({'day': day, 'tm': tm, 'kind': '불가', 'who': d.get('시공자') or '',
                        'mac': '', 'state': '불가', 'head': why or '사유 미기재',
                        'src': '25년 불가원장', 'det': det,
                        '__row': (norm_meter(d['계기번호']),
                                  re.sub(r'\D', '', str(d.get('시공일') or '')), '',
                                  str(d.get('앱넘버') or ''))})
        for k, v in det.items():
            s['fields'].setdefault(k, set()).add(v)

    # ── 1b) ★주소가 빈 행까지 계기번호로 다시 긁는다 ────────────────────────
    #   `구시공앱` 으로 작성된 기록은 **주소가 비어 있다**(실측 06190606718 의 2026-03-09
    #   LTE 전환 행 2개). 주소로만 수집하면 그 행을 통째로 놓쳐 "왜 아직 HPGP 냐" 가 된다
    #   (영준님 2026-09-30 지적). 그래서 1차로 얻은 계기번호로 원장을 한 번 더 훑는다.
    ms0 = list(meters.keys())
    if ms0:
        mph0 = ','.join('?' * len(ms0))
        seen_rows = {(e.get('__row')) for s in meters.values() for e in s['ev'] if e.get('__row')}
        for t, cols_, src, kindf in ((LEDGER, lcols, '25년 원장', True),
                                     (BULGA, bcols, '25년 불가원장', False)):
            for row in cur.execute(f'SELECT * FROM "{t}" WHERE 계기번호_norm IN ({mph0})'
                                   + (' AND snapshot=?' if t == LEDGER else ''),
                                   (*ms0, SNAP) if t == LEDGER else ms0):
                d = dict(zip(cols_, row))
                mac = d.get('mac_norm') or ''
                sd = re.sub(r'\D', '', str(d.get('시공일') or ''))
                rid = (norm_meter(d['계기번호']), sd, mac, str(d.get('앱넘버') or ''))
                if rid in seen_rows:
                    continue
                seen_rows.add(rid)
                s = meters[norm_meter(d['계기번호'])]
                st = d.get('col_15') or ''
                if st == '청구':
                    s['state'] = '청구'
                elif not s['state']:
                    s['state'] = st
                if mac:
                    if mac not in s['macs']:
                        s['macs'].append(mac)
                    if sd >= (s.get('mac_at') or ''):
                        s['mac_at'], s['mac_last'] = sd, mac
                day, tm = ymd(d.get('시공일'))
                det = {k: str(v).strip() for k, v in d.items() if k not in SKIP and not blank(v)}
                kind = '불가' if (st == '불가' or not kindf) else '시공'
                head = (' · '.join(x for x in (d.get('통신방식'), d.get('M/S'), d.get('집/단'),
                                               d.get('구분')) if x) if kindf else
                        ' / '.join(x for x in (d.get('비고1'), d.get('비고2')) if not blank(x)))
                s['ev'].append({'day': day, 'tm': tm, 'kind': kind,
                                'who': d.get('시공자') or '', 'mac': mac, 'state': st,
                                'head': head or '기록', 'src': src + '(주소없음 포함)',
                                'det': det, '__row': rid})
                for k, v in det.items():
                    s['fields'].setdefault(k, set()).add(v)

    ms = list(meters.keys())
    if ms:
        mph = ','.join('?' * len(ms))
        # ── 3) 26공사 모뎀시공 ──
        w = [c[1] for c in cur.execute('PRAGMA table_info(modem_work_all)')]
        for row in cur.execute(f'SELECT * FROM modem_work_all WHERE 계기번호_norm IN ({mph})', ms):
            d = dict(zip(w, row))
            s = slot(d['계기번호_norm'])
            day, tm = ymd(d.get('작업일자'))
            det = {k: str(v).strip() for k, v in d.items() if k not in SKIP and not blank(v)}
            s['ev'].append({'day': day, 'tm': tm, 'kind': '26공사',
                            'who': ' '.join(x for x in (d.get('작업자1'), d.get('작업자2')) if x),
                            'mac': (d.get('기존모뎀MAC') or ''), 'state': '',
                            'head': ' · '.join(x for x in (d.get('지사'), d.get('작업구분'),
                                                           d.get('계기유형'), d.get('인입선구분')) if x),
                            'src': '26공사', 'det': det})
        # ── 4) 26년 불가 ──
        u = [c[1] for c in cur.execute('PRAGMA table_info("모뎀설치불가개소")')]
        for row in cur.execute(f'SELECT * FROM "모뎀설치불가개소" WHERE 계기번호_norm IN ({mph})', ms):
            d = dict(zip(u, row))
            s = slot(d['계기번호_norm'])
            day, tm = ymd(d.get('작업일자'))
            det = {k: str(v).strip() for k, v in d.items() if k not in SKIP and not blank(v)}
            s['ev'].append({'day': day, 'tm': tm, 'kind': '불가', 'who': d.get('작업자1') or '',
                            'mac': '', 'state': '',
                            'head': ' / '.join(x for x in (d.get('불가,철거사유'),
                                                           d.get('불가,철거상세사유')) if x) or '사유 미기재',
                            'src': '26년 불가', 'det': det})
        # ── 5) 26년 장애 ──
        j = [c[1] for c in cur.execute('PRAGMA table_info(jangae)')]
        for row in cur.execute(f'SELECT * FROM jangae WHERE 계기번호_norm IN ({mph})', ms):
            d = dict(zip(j, row))
            s = slot(d['계기번호_norm'])
            day, tm = ymd(d.get('작업일자'))
            det = {k: str(v).strip() for k, v in d.items() if k not in SKIP and not blank(v)}
            s['ev'].append({'day': day, 'tm': tm, 'kind': '장애', 'who': d.get('작업자1') or '',
                            'mac': d.get('mac_norm') or '', 'state': '',
                            'head': ' · '.join(x for x in (d.get('기술타입'), d.get('모뎀유형'),
                                                           f'개통 {d.get("개통여부") or "미개통"}',
                                                           f'LP {d.get("LP")}' if not blank(d.get('LP')) else '') if x),
                            'src': '26년 장애', 'det': det})
        # ── 6) 대장(보강현황) — 한전 일자 + 동호수·상호 ──
        b = [c[1] for c in cur.execute('PRAGMA table_info(boranggi)')]
        seen = {}
        for row in cur.execute(f'SELECT * FROM boranggi WHERE 계기번호_norm IN ({mph})'
                               f' OR replace(ifnull("계기번호_2","")," ","") IN ({mph})', ms + ms):
            d = dict(zip(b, row))
            key = norm_meter(d.get('계기번호_norm'))
            s = slot(key if key in meters else d.get('계기번호_2'))
            for k in ('고객번호', '공동주택명', '상호명', '계약종별', '검침방법', '도로명',
                      '변대주', '인입주', 'DCU ID', 'DCU ID_2', '교체사유', '검기만료년월',
                      'DCU 장애여부', '사업차수', 'LP', '계기번호_2', '통신방식_2', '계기타입_2'):
                v = d.get(k)
                if not blank(v):
                    s['fields'].setdefault(f'대장:{k}', set()).add(str(v).strip())
            # ★대장 한 행 = 타임라인 한 항목이다(영준님 2026-09-30 "타임라인이 행 하나당
            #   타임라인임. 연계수신일 같은 거 한 행 정보는 그냥 정보고").
            #   계기교체일(A)·연계(B)·최초LP(C) 는 그 행에 딸린 **정보**이므로 쪼개지 않는다.
            day, tm = ymd(d.get('계기교체일(A)'))
            if day:
                info = []
                for lbl, v in (('교체', d.get('계기교체일(A)')), ('연계', d.get('연계 수신일(B)')),
                               ('최초LP', d.get('최초LP 수신일(C)'))):
                    dd, _ = ymd(v)
                    if dd:
                        info.append(f'{lbl} {dd}')
                for lbl, k in (('사유', '교체사유'), ('LP', 'LP'), ('차수', '사업차수'),
                               ('검기만료', '검기만료년월'), ('DCU장애', 'DCU 장애여부')):
                    if not blank(d.get(k)):
                        info.append(f'{lbl} {str(d.get(k)).strip()}')
                head = ' · '.join(info) or '계기교체'
                # ★대장은 스냅샷 8판이라 같은 내용이 반복된다 — **값이 바뀔 때만** 항목으로
                #   남기고, 같은 값은 판 이름만 합친다. 판마다 값이 달라지는 것 자체가 정보다
                #   (실측: 같은 계기의 최초LP 가 판에 따라 09-22 / 09-26 로 갈린다).
                sig = (s['meter'], day, head)
                prev = seen.get(sig) if isinstance(seen, dict) else None
                snap = str(d.get('snapshot') or '')
                if prev is not None:
                    prev['snaps'].append(snap)
                    prev['src'] = '보강현황 ' + '·'.join(sorted(set(prev['snaps'])))
                    continue
                det = {k: str(v).strip() for k, v in d.items() if k not in SKIP and not blank(v)}
                ev = {'day': day, 'tm': tm, 'kind': '한전', 'who': '', 'mac': '', 'state': '',
                      'head': head, 'src': f'보강현황 {snap}'.strip(), 'det': det,
                      'snaps': [snap]}
                s['ev'].append(ev)
                seen[sig] = ev

    # ── 7) 지도 데이터셋 — 동호수·상호·공동주택명·DCU·LP 등 전부 ──
    for f, label in DATASETS:
        p = ROOT / f
        if not p.exists():
            continue
        d = json.loads(p.read_text())
        for r in (d if isinstance(d, list) else d.get('data', [])):
            m = norm_meter(r.get('계기번호'))
            if m not in meters:
                continue
            s = meters[m]
            s['onmap'].append(label)
            if isinstance(r.get('LP'), dict):
                s['lp'] = r['LP']
            for k, v in r.items():
                if k in ('LP', '계기번호') or blank(v) or isinstance(v, (dict, list)):
                    continue
                s['map'].setdefault(k, set()).add(str(v).strip())

    for s in meters.values():
        s['ev'].sort(key=lambda e: (e['day'] or '9999-99-99', e['tm'] or '99:99'))
    return meters


CSS = """:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:12px;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#111;background:#f4f5f7}
h1{font-size:18px;margin:0 0 3px} .sub{color:#666;font-size:12.5px;margin-bottom:12px}
.sum{background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.macbox{background:#eef2f7;border-radius:13px;padding:11px 11px 4px;margin-bottom:14px}
.machd{font:700 15px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.3px;margin-bottom:2px;word-break:break-all}
.macmeta{font-size:12px;color:#4b5563;margin-bottom:9px}
.card{background:#fff;border-radius:11px;padding:11px 12px;margin-bottom:8px;border-left:4px solid #d1d5db}
.card.tgt{border-left-color:#dc2626}
.mno{font:700 16px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.4px}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;margin:3px 4px 0 0}
.p-un{background:#fee2e2;color:#b91c1c} .p-ok{background:#dcfce7;color:#15803d}
.p-fail{background:#e5e7eb;color:#4b5563} .p-map{background:#dbeafe;color:#1d4ed8}
ol.tl{list-style:none;margin:9px 0 0;padding:0 0 0 14px;border-left:2px solid #e5e7eb}
ol.tl li{position:relative;padding:0 0 9px 11px}
ol.tl li:last-child{padding-bottom:0}
ol.tl li::before{content:'';position:absolute;left:-20px;top:5px;width:9px;height:9px;border-radius:50%;background:#9ca3af;border:2px solid #fff}
li.k-시공::before{background:#2563eb} li.k-불가::before{background:#dc2626}
li.k-26공사::before{background:#16a34a} li.k-장애::before{background:#ea580c} li.k-한전::before{background:#7c3aed}
.d{font-weight:700;font-size:12.5px} .t{color:#888;font-size:11.5px;margin-left:3px}
.tag{display:inline-block;padding:1px 6px;border-radius:5px;font-size:10.5px;font-weight:700;margin-left:4px}
.g-시공{background:#dbeafe;color:#1d4ed8} .g-불가{background:#fee2e2;color:#b91c1c}
.g-26공사{background:#dcfce7;color:#15803d} .g-장애{background:#ffedd5;color:#c2410c} .g-한전{background:#ede9fe;color:#6d28d9}
.g-미청구{background:#fee2e2;color:#b91c1c} .g-청구{background:#dcfce7;color:#15803d}
.w{font-size:12.5px;color:#374151;margin-top:1px}
.mac{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#6b7280}
details{margin-top:3px} summary{font-size:11.5px;color:#2563eb;cursor:pointer}
.kv{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:11.5px;margin:5px 0 0;
  background:#fafafa;border-radius:7px;padding:6px 8px}
.kv dt{color:#888;white-space:nowrap} .kv dd{margin:0;word-break:break-all}
.lp{font-size:11.5px;color:#444;margin-top:7px;background:#f8fafc;border-radius:7px;padding:6px 8px}
.hl{background:#fffbeb;border:1px solid #fde68a}
.dong{font:700 14px/1.3 -apple-system,sans-serif;color:#0f766e;margin:3px 0 0}
.dong.none{color:#9ca3af;font-weight:400;font-size:12px}
.lpb{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:700;margin:3px 4px 0 0}
.lp-alive{background:#dcfce7;color:#15803d} .lp-weak{background:#fef9c3;color:#a16207}
.lp-drop{background:#ffedd5;color:#c2410c} .lp-gone{background:#e5e7eb;color:#6b7280}
.lp-none{background:#f3f4f6;color:#9ca3af}
.lp-dead{background:#fecaca;color:#991b1b}
.why{font-size:11.5px;color:#6b7280;margin-top:2px}
.rd{background:#fff;border-radius:10px;padding:10px 12px;margin:10px 0 14px;font-size:12.5px;line-height:1.7}
.rd b{font-size:13px} .rd .row{margin-top:3px}
/* ── 접기·펼치기 (영준님 2026-09-30 "이건 뭐 볼수가없다") ───────────── */
.bar{position:sticky;top:0;z-index:5;background:#f4f5f7;padding:8px 0 10px;margin:-2px 0 10px}
.bar button{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 12px;
  font-size:12.5px;font-weight:700;color:#334155;cursor:pointer;margin:0 5px 5px 0}
.bar button.on{background:#0f766e;border-color:#0f766e;color:#fff}
details.mac>summary,details.mt>summary{cursor:pointer;list-style:none}
details.mac>summary::-webkit-details-marker,details.mt>summary::-webkit-details-marker{display:none}
details.mac{background:#eef2f7;border-radius:13px;padding:9px 10px;margin-bottom:10px}
details.mac>summary{font:700 14px/1.35 ui-monospace,Menlo,monospace;letter-spacing:.2px;word-break:break-all}
details.mac>summary .cnt{display:block;font:400 11.5px/1.5 -apple-system,sans-serif;color:#4b5563;margin-top:2px}
details.mac[open]>summary{margin-bottom:8px;border-bottom:1px solid #dbe3ec;padding-bottom:6px}
details.mt{background:#fff;border-radius:11px;margin-bottom:7px;border-left:4px solid #d1d5db}
details.mt.tgt{border-left-color:#dc2626}
details.mt>summary{padding:9px 11px;display:block}
details.mt[open]>summary{border-bottom:1px solid #f1f5f9}
.sm1{font:700 15px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.3px}
.sm2{font-size:12px;color:#0f766e;font-weight:700;margin-top:2px}
.sm2.none{color:#9ca3af;font-weight:400}
.body{padding:9px 11px 11px}
.arrow{float:right;color:#94a3b8;font-size:12px;font-weight:400}
details[open]>summary .arrow{transform:rotate(90deg);display:inline-block}
.hide{display:none !important}
@media print{body{background:#fff;padding:0} .macbox{background:#fff} details{display:none}}"""


def read_lp(lp, ctx=None):
    """LP 시계열 판독 — 미청구가 '왜 없어졌나' 를 읽는 축 (영준님 2026-09-30).

    영준님 법칙 그대로:
      · LP 가 없어지거나 불안한 것 = **계기가 아직 남아 있다** (우리 작업 대상)
      · `#N/A` = **거의 교체됐다고 보면 된다** (옛 번호만 남은 유령)

    ★**LP 는 마지막 시공 이후의 값이다**(영준님 "재방문해서 LTE 로 교체됐으면 이 LP값도
      LTE LP 이자나"). 그래서 `#N/A` 를 곧 '교체' 로 읽으면 틀린다 — 마지막 작업이 **LTE
      교체이고 LP 구간이 그 뒤**라면, N/A 는 계기가 없어진 게 아니라 **갈아놓은 LTE 모뎀이
      통신을 못 하고 있다**는 뜻이고 그건 우리가 손봐야 할 건이다.
      실측 06190606718: 2026-03-09 에 HPGP -> LTE 교체(신호미약), LP 구간은 06/10·09-05~13
      전부 그 뒤인데 전 구간 N/A.

    ctx = {'last': '20260309163449'(마지막 시공일시), 'comm': 'LTE', 'swapped': True(LTE교체 이력)}
    ★제외 판정축이 아니다 — 왜 없어졌는지 **분석하는 재료**다. 확정은 현장·대장 대조로 한다.
    반환: (코드, 라벨, 설명)
    """
    if not isinstance(lp, dict) or not lp:
        return 'none', 'LP 자료 없음', ''
    seq = []           # [(키, 값 or None)]  — dict 순서가 곧 시간순이다
    for k, v in lp.items():
        s = str(v).strip()
        if s in ('#N/A', '', 'None', 'nan'):
            seq.append((k, None))
        else:
            try:
                seq.append((k, float(s)))
            except ValueError:
                seq.append((k, None))
        vals = [x for _, x in seq if x is not None]
    if not vals:
        # ★마지막 작업이 LTE 교체였다면 이 N/A 는 '교체돼 없어짐' 이 아니라
        #   '갈아놓은 LTE 가 통신을 못 한다' 다 — 우리가 손볼 건이다.
        c = ctx or {}
        if c.get('swapped') or (c.get('comm') or '').startswith('LTE'):
            when = c.get('last') or ''
            when = f"{when[:4]}-{when[4:6]}-{when[6:8]}" if len(when) >= 8 else ''
            return ('dead', 'LTE 교체했는데 LP 없음',
                    f'{when} 에 LTE 로 갈았는데 그 뒤 LP 가 전 구간 N/A — 계기는 있고 '
                    f'통신이 안 붙는다. 교체가 아니라 **통신 불량**이다')
        return 'gone', '교체 추정', 'LP 전 구간 N/A — 계기가 갈려 옛 번호만 남은 것으로 본다'
    last = seq[-1][1]
    if last is None:
        return 'cut', '중간에 끊김', 'LP 가 있다가 N/A 로 끊겼다 — 교체됐을 가능성'
    if last <= 0.15 and max(vals) >= 0.5:
        return 'drop', '최근 급락', f'마지막 {last:.2f} (최고 {max(vals):.2f}) — 최근에 끊겼다, 교체 확인 필요'
    if last == 0:
        return 'zero', '통신 안 됨', 'LP 0 — 계기는 있고 통신이 안 붙는다'
    if last >= 0.5:
        return 'alive', '살아있음', f'마지막 {last:.2f} — 계기가 그대로 있다, 확실한 작업 대상'
    return 'weak', 'LP 불안', f'마지막 {last:.2f} — 계기는 있고 수신이 불안하다'


def lp_ctx(s):
    """LP 판독에 줄 맥락 — 마지막 시공일시·그때 통신방식·LTE 교체 이력."""
    last, comm, swapped = '', '', False
    for e in s['ev']:
        if e['kind'] not in ('시공', '26공사'):
            continue
        d = re.sub(r'\D', '', (e['day'] or '') + (e['tm'] or ''))
        if d >= last:
            last, comm = d, (e['head'] or '').split(' · ')[0]
        if 'LTE' in (e['head'] or '') or 'LTE' in ' '.join(e['det'].values() if e['det'] else []):
            if 'LTE교체' in ' '.join(e['det'].values()) if e['det'] else False:
                swapped = True
    for k in ('비고2', '비고1'):
        for v in (s['fields'].get(k) or ()):
            if 'LTE' in v and ('교체' in v or '전환' in v):
                swapped = True
    return {'last': last, 'comm': comm, 'swapped': swapped}


LP_CLS = {'alive': 'lp-alive', 'weak': 'lp-weak', 'zero': 'lp-weak',
          'drop': 'lp-drop', 'cut': 'lp-drop', 'dead': 'lp-dead',
          'gone': 'lp-gone', 'none': 'lp-none'}


def kv(title, data, cls=''):
    if not data:
        return ''
    out = [f'<dl class="kv {cls}">']
    for k in sorted(data):
        v = data[k]
        vs = ' / '.join(sorted(v)) if isinstance(v, set) else str(v)
        out.append(f'<dt>{html.escape(k)}</dt><dd>{html.escape(vs)}</dd>')
    out.append('</dl>')
    return ''.join(out)


def render(meters, title, addrs):
    now = datetime.now(KST).strftime('%Y-%m-%d %H:%M')
    # MAC -> 계기 (한 계기가 여러 MAC 에 나타날 수 있다 = 모뎀이 갈렸다는 정보)
    by_mac = defaultdict(set)
    for s in meters.values():
        # ★대표 MAC 하나에만 넣는다 — 지금 물려 있는 모뎀 아래에 있어야 현장에서 맞다.
        #   지도 데이터의 모뎀MAC(빌더가 최신으로 정한 값)이 있으면 그것을 먼저 믿는다.
        mm = sorted(s['map'].get('모뎀MAC') or ())
        rep = (mm[0] if mm else None) or s.get('mac_last') or (s['macs'][-1] if s['macs'] else None)
        by_mac[rep or '(모뎀 미상)'].add(s['meter'])
    tgt = sum(1 for s in meters.values() if s['onmap'])

    def mac_rank(m):
        ms = by_mac[m]
        un = sum(1 for x in ms if meters[x]['state'] == '미청구')
        return (-un, -len(ms), m)

    h = [f'''<!doctype html><html lang=ko><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>{html.escape(title)} — 모뎀·계기 타임라인</title><style>{CSS}</style></head><body>
<h1>{html.escape(title)}</h1>
<div class=sub>모뎀(MAC) 기준 정렬 · 계기마다 타임라인(시공 &gt; 불가·이후작업 &gt; 미청구)
 &nbsp;|&nbsp; {now} KST</div>
<div class=sum><b>모뎀 {len(by_mac)}개 · 계기 {len(meters)}개 · 작업대상(지도 등재) {tgt}개</b><br>
지번 {html.escape(" · ".join(addrs))}</div>
<div class=bar>
  <button id=b-tgt>작업대상만</button>
  <button id=b-close>모두 접기</button>
  <button id=b-open>모두 펼치기</button>
</div>''']

    # ── 미청구가 '왜 없어졌나' — LP 판독 요약 (영준님 2026-09-30) ──────────
    LAB = [('dead', 'LTE 교체했는데 LP 없음 · 통신불량'),
           ('alive', '살아있음 · 확실한 대상'), ('weak', 'LP 불안 · 남아있음'),
           ('zero', '통신 안 됨 · 남아있음'), ('drop', '최근 급락 · 교체 확인'),
           ('cut', '중간에 끊김 · 교체 확인'), ('gone', '교체 추정 · 헛걸음 주의'),
           ('none', 'LP 자료 없음')]
    buck = defaultdict(list)
    for s in meters.values():
        if not s['onmap']:
            continue
        code, lab, _ = read_lp(s['lp'], lp_ctx(s))
        s['lpread'] = (code, lab)
        buck[code].append(s['meter'])
    if buck:
        h.append('<div class=rd><b>미청구가 왜 없어졌나 — LP 판독</b><br>'
                 '<span style="font-size:11.5px;color:#6b7280">LP 가 없어지거나 불안하면 '
                 '계기가 <b>남아 있다</b>는 뜻이고, 전 구간 N/A 면 <b>거의 교체된</b> 것이다. '
                 '확정은 현장·대장 대조로 한다.</span>')
        for code, lab in LAB:
            if not buck[code]:
                continue
            h.append(f'<div class=row><span class="lpb {LP_CLS[code]}">{html.escape(lab)}</span> '
                     f'<b>{len(buck[code])}건</b> '
                     f'<span class=mac>{html.escape(" ".join(sorted(buck[code])))}</span></div>')
        h.append('</div>')

    for mac in sorted(by_mac, key=mac_rank):
        mset = sorted(by_mac[mac], key=lambda x: (meters[x]['state'] != '미청구', x))
        un = sum(1 for x in mset if meters[x]['state'] == '미청구')
        ok = sum(1 for x in mset if meters[x]['state'] == '청구')
        fl = len(mset) - un - ok
        # 이 MAC 에서 관측된 통신방식·역할
        comms, roles = set(), set()
        for x in mset:
            for e in meters[x]['ev']:
                if e['mac'] == mac and e['head']:
                    for part in e['head'].split(' · '):
                        if part in ('마스터', '슬레이브'):
                            roles.add(part)
                        elif part and not part.startswith(('집합', '단독', '신규', '기설', '교체')):
                            comms.add(part)
        meta = [f'계기 {len(mset)}']
        if un:
            meta.append(f'미청구 {un}')
        if ok:
            meta.append(f'청구 {ok}')
        if fl:
            meta.append(f'기타 {fl}')
        if comms:
            meta.append(' / '.join(sorted(comms)))
        if roles:
            meta.append(' / '.join(sorted(roles)))
        # 미청구가 있는 모뎀만 기본 펼침 — 나머지는 접어 둔다(영준님 "이건 뭐 볼수가없다")
        h.append(f'<details class=mac {"open" if un else ""} data-un="{un}">'
                 f'<summary>MAC {html.escape(mac)}<span class=arrow>&#9656;</span>'
                 f'<span class=cnt>{html.escape(" · ".join(meta))}</span></summary>')
        for mno in mset:
            s = meters[mno]
            pills = []
            if s['state'] == '미청구':
                pills.append('<span class="pill p-un">미청구</span>')
            elif s['state'] == '청구':
                pills.append('<span class="pill p-ok">청구</span>')
            elif s['state']:
                pills.append(f'<span class="pill p-fail">{html.escape(s["state"])}</span>')
            for x in dict.fromkeys(s['onmap']):
                pills.append(f'<span class="pill p-map">{html.escape(x)}</span>')
            if s['type']:
                pills.append(f'<span class="pill p-fail">{html.escape(s["type"])}</span>')
            # LP 판독 배지 — 작업대상만(청구된 건은 판독할 이유가 없다)
            if s['onmap']:
                code, lab, why = read_lp(s['lp'], lp_ctx(s))
                pills.append(f'<span class="lpb {LP_CLS[code]}">{html.escape(lab)}</span>')
            else:
                why = ''
            # 동호수 — 현장에서 찾아가는 정보다. 대장 `공동주택명` 이 동호수를 담는다
            dong = set()
            for k in ('공동주택명', '공동주택명_대안', '상호', '상호_대안', '동호수'):
                for v in (s['map'].get(k) or ()):
                    dong.add(v)
            for k in ('대장:공동주택명', '대장:상호명'):
                for v in (s['fields'].get(k) or ()):
                    dong.add(v)
            dong_txt = ' · '.join(sorted(dong)) if dong else '동호수·상호 없음 (대장 미등재)'
            dong_cls = 'sm2' if dong else 'sm2 none'
            # 계기도 접는다 — 작업대상만 펼쳐 둔다
            h.append(f'<details class="mt {"tgt" if s["onmap"] else ""}" '
                     f'{"open" if s["onmap"] else ""} data-tgt="{1 if s["onmap"] else 0}">'
                     f'<summary><span class=sm1>{html.escape(mno)}</span>'
                     f'<span class=arrow>&#9656;</span>'
                     f'<div class="{dong_cls}">{html.escape(dong_txt)}</div>'
                     f'<div>{"".join(pills)}</div>'
                     + (f'<div class=why>{html.escape(why)}</div>' if why else '')
                     + '</summary><div class=body>')
            # 동호수·상호 등 핵심 식별정보를 앞에 세운다
            key_map = {k: v for k, v in s['map'].items()
                       if k in ('주소', '도로명주소', '동호수', '공동주택명', '상호', '고객번호',
                                '변대주', '변대주번호', 'DCUID', 'DCU통신방식', '회선상태', 'DCU차수',
                                '계약종별', '검침방법', '모뎀MAC', '시공자', 'M/S')}
            key_led = {k: v for k, v in s['fields'].items()
                       if k in ('고객번호', '비고1', '비고2', '추가계기', '지도구분', '기존변대주',
                                '변경변대주', '앱변대주', 'DCU', '대장:공동주택명', '대장:상호명',
                                '대장:계약종별', '대장:검침방법')}
            h.append(kv('식별', {**key_map, **key_led}, 'hl'))
            h.append('<ol class=tl>')
            for e in s['ev']:
                bits = [f'<span class=d>{e["day"] or "일자미상"}</span>']
                if e['tm']:
                    bits.append(f'<span class=t>{e["tm"]}</span>')
                bits.append(f'<span class="tag g-{e["kind"]}">{html.escape(e["kind"])}</span>')
                if e['state'] and e['state'] != e['kind']:
                    bits.append(f'<span class="tag g-{e["state"]}">{html.escape(e["state"])}</span>')
                if e['mac'] and e['mac'] != mac:
                    bits.append('<span class="tag g-장애">모뎀 다름</span>')
                l2 = []
                if e['who']:
                    l2.append(f'<b>{html.escape(e["who"])}</b>')
                if e['head']:
                    l2.append(html.escape(e['head']))
                l2.append(f'<span class=ex>({html.escape(e["src"])})</span>')
                h.append(f'<li class="k-{e["kind"]}">{"".join(bits)}<div class=w>{" · ".join(l2)}</div>')
                if e['mac']:
                    h.append(f'<div class=mac>mac {html.escape(e["mac"])}</div>')
                if e['det']:
                    h.append('<details><summary>이 기록의 전체 필드 '
                             f'({len(e["det"])})</summary>{kv("", e["det"])}</details>')
                h.append('</li>')
            h.append('</ol>')
            if s['lp']:
                h.append('<div class=lp>LP ' + html.escape(' · '.join(
                    f'{k.replace("LP ", "")} {v}' for k, v in s['lp'].items())) + '</div>')
            rest_map = {k: v for k, v in s['map'].items() if k not in key_map}
            rest_led = {k: v for k, v in s['fields'].items() if k not in key_led}
            if rest_led:
                h.append(f'<details><summary>원장·대장 전체 필드 ({len(rest_led)})</summary>'
                         f'{kv("", rest_led)}</details>')
            if rest_map:
                h.append(f'<details><summary>지도 데이터 전체 필드 ({len(rest_map)})</summary>'
                         f'{kv("", rest_map)}</details>')
            h.append('</div></details>')
        h.append('</details>')
    h.append('''<script>
const $$=s=>[...document.querySelectorAll(s)];
let onlyTgt=false;
function setAll(open){ $$('details.mac,details.mt').forEach(d=>d.open=open); }
function tgtOnly(){
  onlyTgt=!onlyTgt;
  document.getElementById('b-tgt').classList.toggle('on',onlyTgt);
  $$('details.mt').forEach(d=>d.classList.toggle('hide', onlyTgt && d.dataset.tgt==='0'));
  $$('details.mac').forEach(m=>{
    const vis=[...m.querySelectorAll('details.mt')].some(d=>!d.classList.contains('hide'));
    m.classList.toggle('hide', onlyTgt && !vis);
    if(onlyTgt && vis) m.open=true;
  });
}
document.getElementById('b-open').onclick=()=>setAll(true);
document.getElementById('b-close').onclick=()=>setAll(false);
document.getElementById('b-tgt').onclick=tgtOnly;
</script>
</body></html>
''')
    return ''.join(h)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    con = sqlite3.connect(DB)
    cur = con.cursor()
    addrs, label = resolve_target(cur, sys.argv[1])
    meters = collect(cur, addrs)
    con.close()
    if not meters:
        sys.exit('계기를 못 찾았다')
    title = addrs[0] if len(addrs) == 1 else f'{label} ({len(addrs)}개 지번)'
    nums = '-'.join(re.findall(r'\d+', addrs[0]))[-14:] or 'x'
    sig = hashlib.sha1('|'.join(addrs).encode()).hexdigest()[:4]
    OUTDIR.mkdir(exist_ok=True)
    p = OUTDIR / f'addr-{nums}-{sig}.html'
    p.write_text(render(meters, title, addrs))
    tgt = sum(1 for s in meters.values() if s['onmap'])
    print(f'저장 {p}  ({p.stat().st_size // 1024} KB · 계기 {len(meters)}개 · 작업대상 {tgt}개)')
    print(f'URL  https://815dudwns.github.io/ami-work/reports/{p.name}')


if __name__ == '__main__':
    main()
