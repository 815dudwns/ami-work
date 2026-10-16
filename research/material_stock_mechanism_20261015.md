# My modem stock — why the awms ledger is not the stock (2026-10-15)

Tool: `python3 scripts/my_stock.py [--since YYYYMMDD] [--list]` (needs 아미큐 Mac session; ~45 s).

## Sources
| What | Where |
|---|---|
| Ledger: modems booked to me (출고) | `mob/mtl/mobMtl6000/selectList` radioVal=20, myMtrlYn empty -> backend cache `cst-input/backend/shipped_cache.json` (`rows[mac] = {ymd, sts, owned}`) |
| Used: MACs I registered | getMainList (MOBCST, workStep 25/28/29, all depts) -> cache `used` |
| Removed modems in my replacements | getMainList rows with `WORK_DIV=M1020` -> `EXT_FCTY_ID` |
| Everyone's installs (to 9/18) | `data/ami.db` `modem_work_all` (모뎀작업리스트 sheets) |

Refresh both caches first: `POST http://127.0.0.1:8766/api/shipped/refresh` (the script does it).
`used` lags until refresh — today's registrations otherwise look unused.

## Ledger contamination (measured)
1. **Replacement scrap booked to me.** On a modem replacement (M1020) the removed old modem is
   booked to me as a 1-unit 출고 dated the replacement day. 9/2 and 9/4: 9 MACs, all matched my
   `EXT_FCTY_ID`. They are scrap, never stock.
2. **Jun-Aug box bulk registration was wrong** (영준님). Leftovers from those receipts have no
   physical unit. Largest: 6/18-19 Amigo box `012536536xx`-`012536591xx`, 38 units, nobody has
   installed any of them (to 9/18). 영준님 did 자재이관등록 for some; the rest still show owned=Y.
   ~~Rule: recent receipts only (since 9/5)~~ — corrected by 영준님 the same evening: modems
   were returned and **re-issued in one batch on 6/22, every unit scanned**; "그때부터 제대로 된
   카운트야". `--since` default is now **20260622**. IoT PLC (AC5E8C, 8/12) and old K-DCU
   (847207 7th char 0, 6/22) must be counted. Pre-6/22 leftovers (6/18-19 Amigo 38, 3/27 AE 2)
   stay excluded.
3. **Other workers' installs booked to me.** `01249850903`: installed by 김영진 6/15 (also in the
   장애 sheet), booked to me 9/4.
4. **Ledger date lags physical receipt.** The 10/6 box (`0126426x`-`0126427x`) was installed from 10/1.
5. **Single-unit 출고 (1-3 per day)** that are not replacement scrap (9/28 x3, 9/29 x1) are
   unexplained — confirm physically.
6. Earlier "not owned" (owned=N, 71) are already transferred away; excluded by the ledger itself.

## LTE prefix -> meter type (from past master installs, >99% each)
- Amigo: `012536` `012642` `012497` `012498`
- G: `012545` `012540`
- AE (plain LTE): `012544` `012543` `0123xx` `0122xx` — `012380` and `012234` also went to G ~20-25%.
- G also `012556` (70/70 G masters).
- LTE other than G/Amigo = AE **or E** — same prefixes, heavily reused (영준님): not separable by MAC,
  reported as one row `LTE 모뎀(AE·E타입)`. No 012 prefix has >10 E-meter masters in history.
- PLC (영준님 2026-10-15): `E0AEED` = KS-PLC AE · `8472070` = IoT-PLC E-type · `AC5E8C` = IoT-PLC,
  split by 7th-8th chars: `AC5E8CA*` AE (masters 100% AE meters) / `AC5E8CB0*` Amigo (100% Amigo meters).

## Result 2026-10-15 13:xx KST
Ledger owned 975, unused 150 -> excluded 80 (pre-9/5 leftovers 70, replacement scrap 9, other's install 1)
-> **estimated stock 70**: E0AEED 40 (10/6) · G 21 (9/22 x20, 9/28 x1) · AE 5 · Amigo 3 · 847207 1.
영준님 physical Amigo count = 1 vs ledger 2 (10/6) + 1 single (9/29): mismatch open
(misread MAC at registration, partner-account registration, or not yet registered).

## Correction 2026-10-15 evening (cutoff 6/22, cache not refreshed — session expired)
Adds 29 from 6/22-9/4: AC5E8C 16 (8/12) · E0AEED 5 · AE 2 · G 2 · 847207 K-DCU 2 · Amigo 2
(7/28 01253654886, 8/12 01253654342) -> **about 99**. Rerun after login to confirm.

## The mismatched box (영준님 2026-10-15)
Around early Sep (soon after starting 서대문) 영준님 registered a box by its box barcode; it did
not match the physical modems, so every unit was re-scanned one by one and units shown as
received by others were taken over via 자재이관. In the ledger this is **9/8**: 80 rows = G 40
(39 owned, all used) + **Amigo 40 `01264260199`-`01264273297` + `01254537145`, owned=N, none
used by me**. Same 012642 range as the 10/6 Amigo box that was actually installed. owned=N
already removes it, so it does not inflate stock — but expect that box never to reconcile.
Recount from the 18:01 cache with cutoff 6/22: **97** (AE 7, G 22, Amigo 4, 847207 3,
AC5E8C 16, E0AEED 45).

## Open
- Physical count of G 21 / AE 5 / E0AEED 40 to validate the method.
- Remaining Jun-Aug leftovers: transfer (이관) or ask KDN to clear.

## 2026-10-16: 인계 tab added
mobMtl6000 radioVal=40 (인계) = modems handed to me by other workers; the 출고 tab misses them.
70 rows: 6/8 장진교 Amigo 40 (2 left) · 6/11 장진교 E0AEED 10 (6 left) · 9/10 이용택 Amigo 4 (all used) ·
10/16 김상권 Amigo 16. Counted regardless of the cutoff. Stock 10/16 09:33 = **150**.

## 2026-10-16: 장애 replacement rows
출고 rows with 인계자 HNDOVR_USER_ID = 273584 (myself) are MACs booked to me by 장애 replacement work,
not 출고등록: 19 rows (3/27 3, 4/1 2, 9/2 6, 9/4 4, 9/28 3, 9/29 1). Excluded — this explains the
"unexplained singles" of 9/28-9/29. Other 출고 rows: 인계자 18104059 (warehouse, 756) or '-' (300).
Stock 10/16 = **146**.
