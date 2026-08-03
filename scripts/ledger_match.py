#!/usr/bin/env python3
"""기존 아미맵 데이터에서 값을 끌어올 때 쓰는 매칭 규칙 (공용).

★키 우선순위 (영준님 확정 2026-08-03)
  1순위: 고객번호          — 개소(계약)에 붙는 번호라 계기를 갈아도 안 변한다.
  2순위: 계기번호 + 지번주소 — 고객번호가 없을 때만. 둘 다 같아야 인정한다.

계기번호 단독 매칭 금지. '검기만료'는 계기 수명이 다했다는 뜻이라 계기는 교체되며,
검기만료가 아닌 사유로 철거 후 재시공하면 같은 계기번호가 다른 개소에 나타난다.
그때 계기번호만 보고 끌어오면 엉뚱한 개소의 인입주·통신방식이 조용히 붙는다.

실측(2026-08-03, 주덕기 0730 리스트): 매칭 5,311건 전부 주소까지 일치해 이번엔
오염이 없었다. 규칙을 바꾼 건 다음번을 위한 것이다 — 안 맞으면 빈칸으로 남는 편이
틀린 값이 붙는 것보다 낫다.
"""
import collections


def norm(v):
    return str(v or '').strip()


def cust(v):
    """고객번호 정규화 — float/int 섞여 들어오므로 zfill(10)"""
    s = norm(v)
    if not s:
        return ''
    if s.replace('.', '', 1).lstrip('-').isdigit():
        return str(int(float(s))).zfill(10)
    return s


def build_index(ledger):
    """기존 데이터 -> (고객번호 인덱스, (계기번호,주소) 인덱스)"""
    by_cust, by_pair = {}, {}
    for x in ledger:
        c = cust(x.get('고객번호'))
        if c:
            by_cust.setdefault(c, x)
        key = (norm(x.get('계기번호')), norm(x.get('주소')))
        if key[0] and key[1]:
            by_pair.setdefault(key, x)
    return by_cust, by_pair


def lookup(rec, by_cust, by_pair):
    """(원본레코드, 매칭근거) — 못 찾으면 (None, '')"""
    c = cust(rec.get('고객번호'))
    if c and c in by_cust:
        return by_cust[c], '고객번호'
    key = (norm(rec.get('계기번호')), norm(rec.get('주소')))
    if key[0] and key[1] and key in by_pair:
        return by_pair[key], '계기번호+주소'
    return None, ''


def audit(records, by_cust, by_pair):
    st = collections.Counter()
    for r in records:
        _, how = lookup(r, by_cust, by_pair)
        st[how or '매칭없음'] += 1
    return st
