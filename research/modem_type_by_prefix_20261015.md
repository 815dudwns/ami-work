# Modem type by MAC prefix (2026-10-15)

Tool: `python3 scripts/modem_type_map.py [--len 7]`. Used by `scripts/my_stock.py` kind().

## Rules (영준님 2026-10-15)
- Modem type = the type of the MASTER meter it serves.
- 외장형연결장치=Y on an EA/AE meter = **E modem** through the adapter.
- Old apps (플러스 etc.) could not record the adapter and wrote 통신방식 **Zigbee** instead -> E modem.
  (25년 보강현황 has only ~133 Zigbee rows and none carries a MAC, so it adds no prefix evidence.)
- PLC by DCU generation: **KS-PLC = DCU 1-4차, IoT-PLC = DCU 5-6차, K-DCU = IoT-PLC.**
- G and Amigo LTE are reliable by prefix; the other LTE prefixes are reused a lot -> decide per
  7-char prefix and confirm physically when mixed.

## Sources
- 26년: `modem_work_all` master rows (19,675) — 계기유형 + 외장형연결장치 + 기술타입 + DCUID.
- 25년: `boranggi` (보강현황, all snapshots) — MAC restored from colon/line-encoded formats,
  meter kind from the meter number, DCU ID -> 차수. Counts there include slaves (mixed groups),
  so use it for PLC generation, not for LTE AE/E.
- DCU 차수: `dcu_master` joined on DCU ID first 8 chars (last 2 vary).

## LTE (26년 masters, one vote per MAC)
| Prefix | Type | Evidence |
|---|---|---|
| 012536 012642 012498 012497 012537 012486 012485 012482 | Amigo | 98-100% |
| 012362 | Amigo | 보강현황 99% |
| 012540 012545 012556 012481 | G | 100% |
| 012544 | AE | AE 560, 연결장치 1 |
| 012543 | **E** | 연결장치 313/321 |
| 012234 | **E** | 연결장치 151/176 |
| 012312 012271 012235 012310 | E-leaning | 연결장치 50-70% |
| 012301 012506 012380 012433 012449 012232 012371 012434 012454 012435 012282 012320 012314 ... | mixed (reused) | use 7-char prefix |

## PLC (DCU 차수 of installs)
| Prefix | Gen | Type | Meter type of masters |
|---|---|---|---|
| E0AEED | DCU1-4 (보강 15,878/18,609) | KS-PLC | AE |
| 847207B / C / D | DCU1-4 | KS-PLC | mostly AE (B: some G/E) |
| 8472070 | DCU5-6 (9,027/12,601) | IoT-PLC | E via adapter majority (영준님: IoT-PLC E) |
| 847207E | DCU5-6 | IoT-PLC | AE + E mixed |
| AC5E8CA* | DCU5-6 | IoT-PLC | AE only |
| AC5E8CB0* | DCU5-6 | IoT-PLC | Amigo only |
| 44B433 / 0014B0 | DCU1-4 | HPGP | AE (some G) |
