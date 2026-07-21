# workStatus/jongno — Weekly Archive & Catch-up Delta Design

Author: 계기팀 | Date: 2026-07-21 | Status: **DESIGN LOCKED (PM-approved 2026-07-21) — implementation waits for 영준님 final go**
PM decisions (2026-07-21): P1 catch-up = top priority · stub design adopted · initial bulk + weekly thereafter · criterion simplified to "complete & ≥7d ⇒ registration done". Code/deploy only after 영준님 approval.

**EXECUTION LOG:**
- **P1 catch-up gate: DEPLOYED 2026-07-21** (commit `3686a78`, jongno APP_VERSION `20260721.1`). Headless PASS 6/6 + 영준님 iPhone gray-marker OK. Egress confirmation pending 7/22 AM.
- **P3 initial bulk: EXECUTED 2026-07-21** via `scripts/weekly_workstatus_merge.py --apply`. 2,025 addresses stubbed, live `6.73MB → 1.73MB` (−74.3%). Full integrity check PASSED (2,025 archive copies == original, 0 missing/0 mismatch; 65 untouched == original). Backup `data/ami-jongno-workStatus-backup-P3merge전-20260721-021043.json`. Script fixes applied during run: readback URL must `urllib.parse.quote` (space/Korean keys); readback compare via `strip_empty` (Firebase drops empty dicts/nulls). Idempotent — safe partial-run recovery.
  - **Consumer data-verification found & fixed 2 anomalies**: (a) 3 pending/fail addresses (incl 통인동 5-1 apt, 59 meters) wrongly archived via the `all-new_meter_id` OR-branch → un-archived + `is_complete()` tightened to exclude explicit pending/fail/hold; (b) 5 `awms_error` meters (계기큐 retry signal) dropped from stub → restored + added to `METER_KEEP`. Live now ~2,022 archived / 1.82MB.
  - **Integration verify (검증팀) 8/8 PASS** (un-archive live test, commit 63aa94fe). **Real-screen (영준님 iPhone) gray-marker PASS.**
- **P3 step 4 (weekly automation): REGISTERED 2026-07-21.** `launchctl` job `com.ami.jongno-weekly-merge` (status 0), `StartCalendarInterval` Weekday=1 (Mon) 05:00 KST, next fire 2026-07-27. Wrapper `scripts/weekly_merge_run.sh` = `--apply` + log to `data/weekly_merge_reports/latest.log` + macOS notification + best-effort orca report to PM. End-to-end validated (manual run, exit 0, all 3 report channels fired). Supervised (auto-run + report) first 3-4 weeks → unattended after clean integrity. Fail-safe: readback mismatch → RuntimeError → non-zero exit → "실패" alert; backup-first = no data loss.
- **Remaining: P1 egress confirmation (7/22 AM).**
Scope: RTDB `workStatus/jongno` (ami-jongno). Goal: cut Firebase RTDB download egress (~80-85% of the bill).
Related: `research/firebase-cost/usage-diagnosis.md` (root-cause), 검증팀 `research/data-archive/validate-data-archive-design.md` (sibling).

---

## 0. TL;DR — Execution priority & expected savings (PM's ask)

Cost model: **RTDB egress ≈ (number of full-node pulls/month) × (node size).**
So there are two independent levers: cut the **pull count**, or shrink the **node size**.

| # | Action | What it fixes | Est. saving (heavy month ~$37) | Risk | Effort | Data move / schema |
|---|---|---|---|---|---|---|
| **P1** | **Catch-up delta/gate** (`firebase.js:633`) | Kills ~7,000 full-node re-pulls/mo (foreground-resume multiplier) | **−$25~31/mo → RTDB egress under 10 GB free tier ≈ $0** | Low | ~1h | none |
| **P2** | **검증 watcher conditional GET** (검증팀 소관) | ~360+/mo hourly full 5.9 MB GET → ETag/if-none-match ⇒ 304 unless changed | −$2~3/mo | Low | small | none (their code) |
| **P3** | **Weekly archive** (this doc) | Shrinks every *remaining* full pull (init/queue/stats/snap/watcher) 6.1 MB → ~1 MB | −$2~4/mo **now**; the real value is **structural** (keeps live node small as we scale to 2027 10-team) | Med | Med | yes + 3 consumer edits |

**P1 and P2 are the same idea — "pull only when it actually changed."** P1 gates the SDK full pull on real reconnect; P2 (검증팀) turns the watcher's hourly GET into an ETag/if-none-match conditional GET (304 with no body unless the node changed, keeping freshness 100%). Bundle them as one "conditional-pull" package; P3 (archive) then shrinks whatever pulls remain.

**Recommendation: do P1 first.** It is the single biggest, fastest, lowest-risk win and alone gets monthly RTDB egress under the free tier — because the recurring driver is *pull count*, not node size (the node is already static: no new completions since 2026-06-29). P3 (the weekly archive 영준님 asked for) is worth doing but is **structural insurance for scale**, not the immediate money; after P1 its marginal $ is small. Do P3 second, as hygiene.

---

## 1. Measured facts (live node, 2026-07-21, read-only)

- **Node size**: 2,090 addresses, **6,375,192 bytes (6.1 MB)**, avg 3,339 B/addr.
- **State split**: complete 1,868 (89.4%) · missing 179 · pending 24 · fail 15 · hold 3.
- **Completes are all old**: newest completion 2026-06-29; **zero completions in the last 7 days**. Byte split of completes (5.47 MB total):
  - date-signal present 970 (2.76 MB): 7–30d = 88 (511 KB), ≥30d = 882 (2.24 MB), <7d = **0**.
  - date-signal "missing" 898 (2.72 MB) = **AWMS_IMPORT legacy** (June 6). These *do* carry `meter_updatedAt` (ISO) but their `replacement_list` is stored **stringified** (`"{meter_ids:[...]}"`), a pre-existing data-quality quirk. Clearly archivable.
- **Archivable ceiling** = all 1,868 completes = **5.47 MB = 85.9%**; live residual (incomplete only) ≈ **901 KB**.

Schema per address (`firebase.js:384-403`): `meter_state`, `comm_state`, `meter_updatedAt`/`comm_updatedAt` (ISO string), `replacement_list{<old_meter_id>:{new_meter_id, old_meter_id, replaced_at(ms), draft, source, verification_state, daily_seq, photos, removal_photos, awms_response, ...}}`, `added_meters`, `comm_completed_list`, `checkedMeters`, `meterChecks`, `failedMeters`.
Heavy bytes = photos URLs + removal_photos + awms_response inside `replacement_list`. Light bytes = state fields + old/new_meter_id.

---

## 2. Consumer impact — what breaks if completes leave the live node

Full scan (정본 = `jongno-combined/`, `ami-work/awms-queue-www/`). 12 consumers; the two blockers:

- **[BLOCKER] map.js marker color** — markers are built from **siteData geometry**; workStatus only *overlays* color (`map.js:262,955,1049`). If `workStatus[addr]` disappears, `meter_state` defaults to `'pending'` → **a completed (gray) address turns green (un-worked)**. Not "disappears" — it *mis-shows as incomplete*, inviting re-work = data-corruption-grade UX bug. Catch-up (`firebase.js:633`) + merge (`mergeAddrInto`) reinforce this (Firebase-authoritative, no timestamp gate).
- **[BREAKS] stats.html history** — daily/analysis tabs count completions by `replaced_at` over a full-node `.once('value')` (`stats.html:781,902`). Archived items vanish from past-date/period counts (the *numerator*). **Denominator is safe** — it comes from siteData (`stats-site-index`), not workStatus (`stats.html:734-761`).
- **[EDGE] 계기큐** (`queue.js:426` full-node scan) — rebuilds the awms-registration queue from every `replacement_list` entry. Already-registered completes are harmless to drop. **Edge: an address completed in the map app but not yet awms-registered, aged past 1 week** — archiving it drops it from the queue forever (real, though registration is normally same-day).
- **Harmless**: snap.html (today only, `snap.html:612`), detail/replacement-modal (in-memory open addr only), tools/*.html (manual sync), backend daily_cycle/admin-validation (same-day date filter), filter_worker_done (backup tool). 검증관리자 admin-data.js safe if only `verified` items archived.
- **Cross-team**: 검증 auto-watcher does hourly full `workStatus/jongno` GET **without shallow** 08–19h + no-cache `/apply` full GET — a *pull-count* source that also benefits from a smaller node (P2, their code).

**Conclusion:** naive "move completed addresses out" is **not acceptable** — it breaks map color and stats history. The archive must keep a light footprint in the live node.

---

## 3. Archive design (P3) — "stub-in-live + detail-in-archive"

The only shape that shrinks the node ~83% **without breaking** map color / queue / stats-count.

### 3.1 Split
- **LIVE `workStatus/jongno/{addr}` (slim stub)** for archived addresses — keep only what the live consumers read:
  `meter_state`, `comm_state`, `meter_updatedAt`, and a minimal per-meter map `replacement_list{<old>:{new_meter_id, old_meter_id, replaced_at, source, draft, archived:true}}`.
  Drop the heavy fields: `removal_photos`, `new_meter_photo`/`old_meter_photo`, `awms_response`, readings/검침값, `verification_state` detail, `meterChecks` blobs.
  Stub size ≈ 100–200 B/addr → 1,868 stubs ≈ **150–350 KB**. Live total ≈ **901 KB (incomplete) + ~0.3 MB (stubs) ≈ 1.2 MB** (was 6.1 MB).
- **COLD `archive/workStatus/jongno/{YYYY-Www}/{addr}` (full detail)** — the complete original object (photos, awms_response, readings, verification). Never read by the live app → **zero recurring egress**.

Why this preserves consumers:
- map.js gray: stub carries `meter_state:'complete'` → color correct.
- 계기큐 done: stub carries `new_meter_id` (+`archived`) → shown/short-circuited as done.
- stats numerator: stub carries `replaced_at` + meter ids → **counts + 단상/삼상(parsed from meter number) survive**. Only the **photo grid/lightbox** (`stats.html:625`) and detail-modal photos need an on-demand fetch from `archive/…` (lazy, rare). One small consumer edit.
- Denominator, snap, detail, backends: unaffected.

### 3.2 Archive criterion (PM-approved, simplified)
Archive an address when **both** hold:
1. `meter_state === 'complete'` (or every `replacement_list` entry has `new_meter_id`), **and**
2. `effective_date < now − 7d`, where `effective_date = max(meter_updatedAt, comm_updatedAt, all replacement_list.*.{replaced_at,awms_synced_at,last_edited_at}, comm_completed_list.*.done_at)`.

PM simplified away the earlier conditions "verified" + "awms-registered(28)": **being complete AND ≥7 days old already implies registration/verification is done** (registration is same-day in practice; nothing has been left un-registered for a week). Given current data this selects essentially all 1,868 completes (all ≥7d, all June work). If a rare un-registered-but-old item exists, stub-ification (not deletion — see §3.6) means 계기큐 still sees `new_meter_id` in the stub, so it is not lost.
AWMS_IMPORT legacy (stringified `replacement_list`): treat as archivable by `meter_updatedAt`; its detail is trivial, stub = as-is minus nothing heavy.

### 3.3 Week boundary & location (agreed with 검증팀)
- Week key: **KST (Asia/Seoul) ISO week, Monday 00:00 – Sunday 24:00**, format `YYYY-Www` (e.g. `2026-W30`). Python `isocalendar()` / JS equivalent.
- Same DB (ami-jongno), under `archive/` — outside the live read path (`workStatus/jongno`), so archived bytes cost **no egress**. 검증팀 siblings at `archive/ocr_review/{YYYY-Www}`.
- Bucket by the address's `effective_date` week.

### 3.4 Atomicity & rollback
- Migration = one **multi-path `update()`** per address: write `archive/workStatus/jongno/{week}/{addr}` (full) **and** overwrite `workStatus/jongno/{addr}` (stub) in the same op → no window where detail is lost.
- **Pre-run backup**: full `workStatus/jongno.json` dump to `data/…` before any batch (existing habit).
- **Rollback**: read `archive/workStatus/jongno/{week}` and write back over `workStatus/jongno/{addr}` (stub → full). Idempotent; backup json is the belt-and-suspenders.
- Runner: server-side batch (Python, `~/.firebase-keys`), weekly (or on-demand). Never client-side.
- New writes: the map app keeps writing full detail live; the weekly batch stubs-and-archives items once they cross the 1-week line. No change to the write path is required for P3 to work (batch does the split after the fact).

### 3.6 Not a deletion — `jongno_delete_protect` is NOT violated
Archiving here = **stub-ification, not deletion.** The full object (photos URLs, `awms_response`, readings, worker records) is **copied to `archive/workStatus/jongno/{week}/{addr}` before** the live entry is slimmed — same atomic `update()`. Nothing is removed from the DB; the heavy fields move to a cold sibling path. The GCS photo objects themselves are never touched (only their URL strings relocate, and they stay retrievable via archive). Therefore:
- The `jongno_delete_protect` rule (protect addresses where `replacement_list` has worker≠awms + photos from *deletion*) is **not** triggered — there is no address removal and no photo loss.
- Rollback restores the full object verbatim (§3.4). The pre-run backup json is the extra safety net.
- The Firebase wholesale-delete protection rules (2026-07-13) also permit per-address `update()`; the batch writes address-by-address, never a root wipe.

### 3.7 Weekly automation (P3 completion definition — design only, build after P3 gate)
PM (영준님) directive 2026-07-21: P3 is not "done" until the weekly merge runs **automatically every Monday early morning (KST)**.

- **Script**: `scripts/weekly_workstatus_merge.py` — standalone, **idempotent** (re-running the same week is a no-op; already-stubbed addresses are skipped). Steps: (1) **snapshot backup first** — dump full `workStatus/jongno.json` to `data/…-YYYYMMDD-HHMMSS.json`; (2) select addresses meeting §3.2 (complete AND ≥7d); (3) per address, one atomic multi-path `update()`: copy full object → `archive/workStatus/jongno/{YYYY-Www}/{addr}`, then slim live entry to the stub (§3.1) — **copy-then-slim, never delete**; (4) structured log (counts, bytes freed, week key, per-address ok/skip). Firebase cred = `~/.firebase-keys` (NOT `~/Downloads` — launchd TCC trap, see [[launchd_services_and_tcc_trap]]).
- **Schedule**: Monday early morning KST, **before workers open the app**. Preferred = **launchd `StartCalendarInterval`** (mac-local, reuse the existing `com.ami.*` KeepAlive pattern of 5 services). Alternative to compare = orca automation. Pick launchd unless a blocker surfaces.
- **Safety (unattended weekly data move — a bug compounds every week):**
  - **Phase 1 (first 3–4 weeks): supervised** — run automatically, then **report the result to PM via `orca … send`** (week key, #archived, bytes freed, any skip/error). PM confirms integrity before the next run.
  - **Phase 2: fully unattended** — only after 3–4 clean supervised weeks.
  - **Fail-safe**: on any integrity check failure (backup write failed, archive-copy readback mismatch, unexpected count spike) → **abort the run (no live slimming) + alert PM**. Never slim without a verified archive copy.
  - Integrity gate per address: read back `archive/…/{addr}` and confirm it equals the source before the live entry is slimmed (the atomic update already guarantees this, but verify on a sample each run).
- **Cross-team**: 검증팀 retention can ride the same Monday schedule; keep the week-boundary convention (KST ISO week, `YYYY-Www`) aligned so both teams bucket identically.

### 3.8 Known limitation — past-date re-processing needs archive photos (실증 2026-07-21, 검증팀)
The stub moves `removal_photos`/`removal_lcd_photos` to `archive/`. **Consequence for past-date re-runs:** regenerating/re-validating a *past* day's daily_state/daily_cycle (e.g. `daily_cycle --date 20260703`) cannot re-run OCR on addresses already stubbed — their photos are no longer in live workStatus → **learning labels that need photo re-derivation (`auto`) can't be reproduced.** `human`/`crop_fail` survive (persisted in `daily_val` Firebase, loss 0). **Same-date runs are unaffected** (today's work is still live-full; it only stubs at ≥7d).
- **Evidence (2026-07-21):** during a daily_state recovery *after* P3 apply, ~187 `auto` labels for 7/3-era completes could not be regenerated (photos already stubbed). human/crop_fail intact.
- **Mitigation:** (a) merge-read photos from `archive/workStatus/jongno/{week}/{addr}` on past-date paths (= the **c1 lazy-fetch fast-follow** — this limitation makes c1 the clear priority, for daily_cycle past-date, not just stats grid), or (b) restore from the point-in-time backup for that date first.
- **Implication:** prioritize c1 (archive photo merge-read) across daily_cycle/stats/검증UI past-date paths. Until then, past-date `auto`-label regeneration is a known gap; use option (b) if a full past-date rebuild is needed. (검증팀 doc appendix D.)

### 3.5 Consumer edits P3 requires
1. `stats.html` — when a `replacement_list` entry is `archived:true` and a photo is requested, fetch from `archive/workStatus/jongno/{week}/{addr}` (lazy, on click). Counts already work from the stub.
2. `map.js` / `firebase.js` — none needed if the stub keeps `meter_state` (color stays correct). Verify catch-up merge doesn't strip the stub.
3. 계기큐 `queue.js` — optionally short-circuit `archived:true` entries to `done` without expecting heavy fields (cosmetic; safe either way).
4. **검증관리자 `/apply` — MUST handle `archived:true` (cross-team gate, agreed with 검증팀 2026-07-21).** Edge: a validator manually applies readings to a meter that was already stubbed (≥7d). The stub dropped `removal_values`/검침값 (§3.1), so a naive apply sees `current=None` and **creates partial fields on the stub → diverges from the archived full object.** Resolution (**CONFIRMED both teams 2026-07-21 = un-archive-then-apply**): when `/apply` detects `archived:true`, it first **restores the full object from `archive/workStatus/jongno/{week}/{addr}` into live (un-stub), then applies normally** — keeps live consistent with archive, transparent to the validator; `/apply` must never write partial fields onto a stub. Ownership: **검증팀 adds the un-archive branch to `/apply`** at P3 kickoff, keyed to the stub schema (`archived:true` + week key) 계기팀 defines. **STATUS 2026-07-21: 검증팀 `_unarchive_addr_if_needed()`+`/apply` branch implemented, unit-tested (normal week / legacy / flag-removal / removal_values restore / missing-week 500 / missing-archive 500), regression-passed, live.** Photo re-view = c2 start (un-archive on edit auto-restores photos) + c1 lazy-fetch fast-follow. Stub schema (계기팀): addr-level `archived:true`+`archive_week` (may be literal `"legacy"` for no-date completes — consume as string, no regex), per-meter `archived:true`; raw live key = archive key (no re-encoding). In practice apply is same-day so this path is rare, but the branch must land before P3 goes unattended. (검증팀 doc appendix D.)

---

## 4. Catch-up delta/gate design (P1 — do first)

`catchUpFromFirebase()` (`firebase.js:628-651`) does a **full `statusRef.once('value')`** on every `visibilitychange`/`pageshow`/`focus` (`654-658`). The `child_added/changed/removed` listeners (`607-609`) **stay attached**, so the Firebase SDK already auto-resyncs deltas on socket reconnect — the manual full pull is largely redundant. This is the ~7,000-pulls/mo driver.

Options (pick per risk appetite; **4a recommended**):
- **4a — Gate on connection state (recommended, minimal).** Keep child listeners as the delta channel. Only run the full `once('value')` when the socket was actually **disconnected > N s** (subscribe `.info/connected`, record last-disconnect). On a normal camera-and-back (socket stayed up), skip the pull entirely — the SDK already delivered any child deltas. Kills the foreground multiplier while keeping the safety pull for true reconnects.
- **4b — Tiny rev check.** Maintain `workStatus_meta/jongno/rev` (a counter bumped on every write, a few bytes). Catch-up reads only `rev`; full-pulls only if `rev` changed since last seen. Cheap, explicit, but adds a write on every state change.
- **4c — Remove entirely.** Trust persistent child listeners alone. Simplest; small risk that a WebView froze the socket without the SDK noticing → a delta missed until the next child event. 4a is 4c + a cheap safety net, so prefer 4a.

Expected: **−60~80% RTDB egress**; combined with the static node, brings monthly egress under the 10 GB free tier ≈ **$0 RTDB egress line**. No schema change, no data move.

### 4.1 P1 expected diff (pre-written for fast execution on approval)
All changes are local to `firebase.js`, inside `initFirebase()`, ~10 lines, no other file touched:
1. **Add a connection tracker** near the listener setup (after line ~616): subscribe once to `db.ref('.info/connected')`; on `false` record `_lastDisconnect = <now>` (unix ms via `Date.now()`), on `true` leave it. Also keep a `_lastCatchUp` timestamp.
2. **Gate `catchUpFromFirebase()`** (line 628-651): at the top, after the existing `_catchUpInFlight`/`_initialDone` guard, add
   `if (_lastDisconnect == null && (Date.now() - _lastCatchUp) < GRACE_MS) return;`
   i.e. **skip the full `once('value')` when the socket never dropped since the last catch-up** — the attached `child_*` listeners already streamed any deltas. Only run the full pull when `.info/connected` actually flipped to false since last time (true reconnect) OR a long grace window (e.g. `GRACE_MS = 5*60*1000`) elapsed as a belt-and-suspenders resync. On a successful pull, set `_lastCatchUp = Date.now()` and clear `_lastDisconnect = null`.
3. **Leave the `visibilitychange`/`pageshow`/`focus` listeners (654-658) as-is** — they still *call* `catchUpFromFirebase()`, but the gate makes the common "camera-and-back with live socket" path a no-op (the exact ~7,000/mo multiplier we are killing).
No behavior change for the real-reconnect case (still resyncs), no change to the initial `on('value')` load, writes, or the child listeners. Rollback = revert the gate (single function).

---

## 5. Decisions (PM-approved 2026-07-21) — locked

1. **P1 (catch-up gate, §4/§4.1) = top priority**, first execution step. Independent of the archive. ✔
2. **P3 = stub design** (§3.1), with the 3 small consumer edits (§3.5). Full-move+dual-read rejected (re-downloads archive on init, defeats the purpose). ✔
3. **Cadence = one-time initial archive of the June backlog, then weekly.** ✔
4. **Criterion simplified** to "complete AND ≥7d old" (§3.2) — drop the explicit verified/awms-28 checks. ✔
5. **Archive = stub-ification, not deletion** (§3.6) — photos preserved in `archive/`, `jongno_delete_protect` not violated. ✔

**Remaining gate: 영준님 final approval before any code/deploy/data-move.**

P1 execution steps (PM-confirmed 2026-07-21):
1. Code the gate in `firebase.js` (§4.1).
2. **Sync verification** — confirm another worker's completion still reaches my phone promptly (the gate must not break real-reconnect resync; test camera-and-back with live socket = no-op, and true disconnect = full resync).
3. **종로맵 deploy = 3 places together** (`jongno-combined/map.html` `APP_VERSION` + menu version label + `?v=` cache query) — else workers keep the old JS. Report with the version string ([[push_show_version]]).

Then: coordinate P2 with 검증팀 → P3 initial bulk (server-side batch, backup json first) → P3 consumer edits (§3.5) → weekly batch.

---

## 5b. P1 deploy & rollback (prepared 2026-07-21 — push withheld pending 영준님 signal)

- **Repo**: `~/Projects/jongno-combined` (GitHub Pages). Deploy = `git push` → Pages auto-build → worker phones auto-reload (APP_VERSION change clears localStorage & reloads; `?v=` busts firebase.js cache).
- **Ready commit**: `3686a78` — `js/firebase.js` (gate + [catchUp] diag log) + `map.html` 3 bumps (APP_VERSION `20260702.4→20260721.1`, `firebase.js?v= 20260707b→20260721a`, menu label `v20260707.3→v20260721.1`). Local only, **not pushed**. `main` is ahead of origin by 1. (검증팀's `admin-validate.html` left uncommitted — not ours.)
- **Deploy command** (only on 영준님 signal via PM):
  ```
  cd ~/Projects/jongno-combined && git push origin main
  ```
- **Rollback (~2-3 min, monotonic — versions go forward not back):**
  ```
  cd ~/Projects/jongno-combined
  git revert --no-commit 3686a78              # undo gate + bumps
  # re-bump the 3 strings forward so phones reload to the reverted code:
  #   APP_VERSION -> 20260721.2 , firebase.js?v= -> 20260721b , menu label -> v20260721.2
  git commit -m "revert(firebase): P1 게이트 롤백 20260721.2"
  git push origin main
  ```
  Phones auto-reload to gate-free code within one cache cycle. (`git revert` alone also works — restores old code — but re-bumping forward avoids a backwards APP_VERSION.)
- **Baseline for reference**: pre-P1 clean state = `626ef2a`.

## 5c. P1 phone smoke test (post-push, the deploy gate)
Headless already proved safety/correctness. The phone check confirms the two device-specific unknowns:
1. **visibilitychange actually fires** on the real WebView / iOS PWA on a camera round-trip, and the gate logs `[catchUp] SKIP(no-op)` (not a full PULL) → savings realized.
2. **iOS socket behavior** on a short background: if iOS drops the socket, `.info/connected`→false → `_sawDisconnect=true` → the gate PULLs (= today's behavior, safe, just less saving on iOS). Android (A33) likely keeps the socket → SKIP.

Procedure (right after push): open 종로맵 on 영준님 iPhone + A33, open the JS console (A33 via `adb` CDP; iPhone via Safari Web Inspector or just watch behavior), switch to camera and back once, read the `[catchUp]` line. **SKIP = pass.** Repeated PULL-every-time on both = investigate (mitigation: ignore very brief disconnects). Any visual breakage (completed markers turning green) = **immediate rollback**. Confirm real savings next day via RTDB egress metric.

## 6. Verification note
- Live measurement via Cloud Monitoring + REST (read-only). No writes/deletes performed. Byte figures from raw `.json` download size (6,375,192 B authoritative).
- Consumer citations verified file:line against 정본 dirs. Non-deployed dupes (jongno-app/, awms-bridge/, build/) excluded.
