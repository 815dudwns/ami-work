# Firebase ami-jongno Cost Diagnosis (measured)

Date: 2026-07-20. Source: Cloud Monitoring API (timeSeries.list, access-token) + `gcloud storage du`.
Project: `ami-jongno`. Region: asia-southeast1. Billing: Blaze.

## TL;DR
- **Main cost driver = RTDB download egress ($1/GB).** ~80-85% of the bill.
- Root cause in code: `catchUpFromFirebase()` does a FULL-node `once('value')` re-download of `workStatus/jongno` (~3-5.9 MB) on **every** `visibilitychange`/`pageshow`/`focus`, per phone. Workers constantly switch to camera and back -> tens of full re-downloads/phone/day x many phones.
- Storage (photos) is cheap: ~7 GB stored (~$0.17/mo) + modest photo egress.
- Estimated bill: **heavy month (June) ~$37**, **lighter month (July) ~$12**. Almost all of the variance is RTDB egress.

---

## 1. Cloud Storage (photos)
- Buckets: only `gs://ami-jongno.firebasestorage.app` (no separate appspot bucket).
- **Size (du): 6,955,531,624 bytes = 6.48 GB** (metric `storage/total_bytes` = 6.478 GB, agrees).
- Storage cost: 6.48 GB x $0.026 = **~$0.17/mo** (negligible).
- Egress (`storage.googleapis.com/network/sent_bytes_count`):
  - 30d rolling sum ~35 GB; daily peaks (Jun 28 = 8.86 GB single day).
  - June total ~40-45 GB -> **~$5/mo** at $0.12/GB (heavy).
  - July 1-20 total ~9 GB -> **~$1.1/mo** (light).
- Operations (30d): ListObjects 43,896 | ReadObject 33,172 | GetObjectMetadata 5,123 | WriteObject 118.
  - Dollar cost of ops is negligible (~$0.25/mo) BUT **43,896 ListObjects/mo is abnormally high** — something enumerates the whole bucket repeatedly (likely a backup/list script or gsutil ls). Worth finding; not a $ driver, but a smell.

## 2. Realtime Database (RTDB)
Metric resource is NOT `firebase_database` for MQL query API; used `timeSeries.list` with metric filters instead (MQL `fetch firebase_database` returns "Could not find resource").

- **Storage size** (`storage/total_bytes`): **33,780,330 bytes = 33.8 MB** (whole DB). Storage cost 0.033 GB x $5 = **$0.17/mo** (negligible). Note the `workStatus/jongno` node alone is ~3-5.9 MB (per code comments).
- **Active connections** (`network/active_connections`): max 2-3 concurrent in the last 30d window (low; workers connect briefly).
- **Download egress** — billed metric = `network/monthly_sent` (cumulative per calendar month, resets on month boundary). Cross-checked against daily `network/sent_bytes_count`:

| Month | Billed download (monthly_sent) | Est. cost after 10 GB/mo free x $1/GB |
|---|---|---|
| June 2026 | **~41.4 GB** (reset value seen 2026-07-01) | ~$31 |
| July 2026 (to 20th) | **16.0 GB**, tracking ~18-22 GB full month | ~$8-12 |

  - Daily `sent_bytes_count` confirms the shape: heavy late June (Jun 30 = 6.2 GB, Jul 1-2 ~5 GB/day), then very flat Jul 4-15 (work slowdown/holiday, <0.2 GB/day), bump Jul 16 (+4.2 GB).
  - **Sanity check (smoking gun):** node ~5.9 MB, June egress 41 GB -> ~7,000 full-node reads in June. ~12 phones x ~20 foreground-resumes/day = ~7,200/mo. Matches the `catchUpFromFirebase` full-pull hypothesis exactly.

---

## 3. Code-level egress points (jongno-combined/)
Findings from read-only inspection (file:line):

**GOOD (cached / incremental):**
- Init: `firebase.js:616` `statusRef.on('value', valueHandler)` = one full load, then `firebase.js:606-609` detaches value and switches to `child_added/changed/removed` incremental listeners (served from synced cache, no 2nd full download). Steady-state real-time updates are per-child deltas (small).
- Writes: `statusRef.update(...)` small multi-path deltas; fan-out to other phones sends only the changed child (gentle).
- siteData: `map.js:199-238 loadSiteDataCached()` = content-hash version gate + IndexedDB mirror, cache hit = 0 re-download; `stats.html:737` force-cache. **siteData is NOT a cost driver.**

**BAD (repeated large downloads):**
- **`firebase.js:633` `catchUpFromFirebase()` -> `statusRef.once('value')` = FULL `workStatus/jongno` node (~3-5.9 MB) re-download**, triggered on `visibilitychange`(654), `pageshow`(657), `focus`(658). **This is the single biggest RTDB egress lever.** `_catchUpInFlight` only dedupes concurrent calls, not frequency.
- `stats.html:902 getAllWs()` full-node `once('value')` (session-cached, 1x/stats load).
- `snap.html:612` full-node `once('value')` on autosave path.
- `firebase.js:619` `setInterval(..., 10000)` is write-only (flush queue), NOT a download.

**Photos (GCS egress):**
- `stats.html:625-627` replacement grid renders 2 `<img>` per item; prefers `_thumb` but **falls back to full-res Storage URL when thumb missing**; `loading="lazy"` limits to on-screen. Lightbox loads full-res (`stats.html:834-838`).
- `replacement-modal.js:317,371` load Storage photos into previews. Source `photo-uploader.js:74 getDownloadURL()`.
- No evidence of long Cache-Control on photos -> repeat views re-fetch.

---

## 4. Cost split & culprits

| Service | Heavy month (June) | Light month (July) |
|---|---|---|
| **RTDB download egress** | **~$31** | ~$8-12 |
| RTDB storage (33.8 MB) | $0.17 | $0.17 |
| GCS photo egress | ~$5 | ~$1 |
| GCS storage (6.5 GB) | ~$0.15 | ~$0.15 |
| GCS operations | ~$0.25 | ~$0.25 |
| **Total (est.)** | **~$37** | **~$12** |

**Culprit #1: RTDB download egress** (`catchUpFromFirebase` full-node re-pull on every foreground). ~80-85% of the bill and the entire month-to-month variance.
**Culprit #2: GCS photo egress** (stats grid + lightbox, full-res fallback, no HTTP cache) — a distant second (~$5 heavy month).

---

## 5. Savings (highest impact first)

1. **Stop the full-node catch-up re-download** (`firebase.js:633`). The child listeners stay attached, so on socket reconnect the SDK already auto-resyncs deltas — the manual `once('value')` full pull is largely redundant. Options: (a) remove it and trust the persistent child listeners, or (b) replace with a cursor query `orderByChild('updatedAt').startAt(lastSeen)` instead of whole-node. **Est. RTDB egress -60 to -80% -> saves ~$20-25 in a heavy month.** Getting monthly egress under the 10 GB free tier zeroes the RTDB egress line entirely.
2. **Gate/debounce catch-up** if #1(a) is too aggressive: only re-pull when disconnected > N seconds, or read a single tiny `workStatus_meta/jongno/rev` field (bytes) and full-pull only if rev changed. Kills the "return-to-foreground x N/day" multiplier cheaply.
3. **Photos: always serve thumbnails, never fall back to full-res in list grids, and set long/immutable Cache-Control** (photos are write-once). Cuts GCS egress + repeat ReadObject on every stats view. Also hunt the ~44k/mo ListObjects (a script enumerating the bucket) and switch to targeted gets.

## Metric coverage notes
- MQL `timeSeries:query` with `fetch firebase_database` FAILS (resource name unknown to MQL). Worked around with `timeSeries.list` + metric.type filter — all RTDB + GCS metrics retrieved successfully.
- Billed RTDB download read from `network/monthly_sent` (authoritative, matches console Usage), cross-checked vs `sent_bytes_count` daily deltas.
- All other requested metrics (storage/total_bytes, active_connections, GCS sent_bytes, storage total, ops) returned data. No metric was unavailable except the MQL resource-name issue above.
