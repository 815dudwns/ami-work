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
   Rule from 영준님: **recent receipts are my real stock** -> `--since` (default 20260905).
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
- PLC: `E0AEED` KS-PLC, `847207` (7th char 0/E K-DCU, B/C/D KS-PLC), `AC5E8C` mixed.

## Result 2026-10-15 13:xx KST
Ledger owned 975, unused 150 -> excluded 80 (pre-9/5 leftovers 70, replacement scrap 9, other's install 1)
-> **estimated stock 70**: E0AEED 40 (10/6) · G 21 (9/22 x20, 9/28 x1) · AE 5 · Amigo 3 · 847207 1.
영준님 physical Amigo count = 1 vs ledger 2 (10/6) + 1 single (9/29): mismatch open
(misread MAC at registration, partner-account registration, or not yet registered).

## Open
- Physical count of G 21 / AE 5 / E0AEED 40 to validate the method.
- Remaining Jun-Aug leftovers: transfer (이관) or ask KDN to clear.
