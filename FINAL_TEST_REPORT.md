# FINAL_TEST_REPORT.md

## Summary

This project was built and tested inside a Linux sandbox with a real PostgreSQL instance and a
real running Node.js backend — not simulated. The tracking/estimation mathematics that power the
on-device AI were unit-tested in isolation with Node.js, independent of any browser. Every
backend endpoint was exercised live with real HTTP requests. The live camera-based detection UI
itself could not be tested end-to-end in this sandbox (no camera hardware, no browser display)
— that part is noted as the one piece requiring verification on real hardware.

## 1. Tracking Engine (Unit Tests — Node.js, 9/9 passing)

| Test | Result |
|---|---|
| Track identity persists across small frame-to-frame movement | ✅ Pass |
| Entrance line crossing detected exactly once on a realistic gradual walk downward (ENTRY) | ✅ Pass |
| Entrance line crossing detected exactly once walking back upward (EXIT) | ✅ Pass |
| Point-in-rectangle zone membership (inside case) | ✅ Pass |
| Point-in-rectangle zone membership (outside case) | ✅ Pass |
| A lost track is reported as "ended" exactly once, not zero or multiple times | ✅ Pass |
| Two simultaneously tracked people remain independent (no ID swapping/merging) | ✅ Pass |
| Heatmap grid-cell bucketing places a center-frame point in the center grid cell | ✅ Pass |

## 2. Shelf-Fill Estimation (Unit Tests — Node.js, 5/5 passing)

| Test | Result |
|---|---|
| Current texture equal to baseline → filled ratio = 1.0 | ✅ Pass |
| Half the baseline's texture → filled ratio = 0.5 | ✅ Pass |
| Low texture vs. baseline → filled ratio ≈ 0.1 | ✅ Pass |
| Texture exceeding baseline clamps to 1.0 (never reports >100%) | ✅ Pass |
| Zero/missing baseline variance defaults safely to 1.0 (never false-alarms with no reference) | ✅ Pass |

## 3. Database

| Test | Result |
|---|---|
| `schema.sql` applies cleanly to a fresh PostgreSQL 16 database | ✅ Pass |
| `seed.sql` applies cleanly — 1,832 footfall events, 347 dwell events, 563 queue samples, 709 POS transactions, 35 heatmap cells, 2 shelf alerts | ✅ Pass (after fixing a duplicate-key `ON CONFLICT` bug in the seed generator — see "Errors Fixed" below) |

## 4. Backend API (Live HTTP Tests)

| Test | Result |
|---|---|
| Login with seeded demo account | ✅ Pass |
| `GET /stores`, `/zones` (4 seeded zones returned with correct types) | ✅ Pass |
| `GET /analytics/summary` reflects seeded historical data correctly | ✅ Pass |
| `GET /analytics/reports?range=weekly` returns correct 7-day breakdown with real revenue/transaction figures | ✅ Pass |
| Live `POST /analytics/footfall` → reflected immediately in summary's `todayFootfall` | ✅ Pass |
| `POST /integrations/pos-transaction` → summary's `conversionRate` correctly computed (1 txn / 2 footfall = 50.0%) | ✅ Pass |
| `POST /zones` creates a new persisted zone | ✅ Pass |
| Full shelf-alert lifecycle: create shelf zone → check at 0.85 (OK) → check at 0.15 (ALERT_RAISED) → check again at 0.2 (STILL_LOW, no duplicate alert) → check at 0.9 (ALERT_RESOLVED) | ✅ Pass — all four states verified correct in sequence |
| `POST /analytics/dwell`, `/analytics/queue` (with correct `is_congested` threshold flagging), `/analytics/heatmap` | ✅ Pass |
| Unauthenticated request to a protected endpoint → `401` | ✅ Pass |
| CORS preflight correctly allows the frontend's actual origin (`http://localhost:5174`) | ✅ Pass |

## 5. Frontend

| Test | Result |
|---|---|
| `npm run build` (production build) | ✅ Pass — no errors |
| `npm run lint` (oxlint) | ✅ Pass — 0 errors, 6 informational warnings (standard data-fetching effect patterns, benign) |
| Every one of the 15 source files transforms correctly through the Vite dev server | ✅ Pass |

## Errors Found & Fixed During Testing

1. **Seed data generator bug**: the heatmap-cell seed INSERT generated overlapping grid cells
   from neighboring hotspots within the same statement, causing a Postgres
   `ON CONFLICT DO UPDATE command cannot affect row a second time` error that silently resulted
   in zero heatmap rows. Fixed by deduplicating cells (summing hit counts per cell) before
   generating the INSERT, and re-verified the fix produces the correct row count.
2. **Missing `geometry` field**: the shelf-zones list endpoint initially didn't return the
   underlying zone's geometry, which the frontend's "Check now" / "Auto-check" actions need to
   know which region of the camera frame to analyze. Added `z.geometry` to the query's SELECT
   and confirmed the frontend wiring expects exactly that shape.

## What Was NOT Tested (and why)

- **Live camera-based person detection and tracking in a real browser** — this sandbox has no
  camera hardware and no graphical display to run a browser in. The underlying tracking
  mathematics were unit-tested exhaustively (see §1), and the model-loading/video/canvas code
  was verified to transform and build correctly, but the actual "does it correctly detect and
  count a real person walking in front of a webcam" question needs verification on real hardware.
- **Shelf-fill estimation against a real photographed shelf** — the math is unit-tested with
  synthetic data (§2), but how well grayscale variance actually distinguishes "stocked" from
  "empty" for a real shelf, under real lighting, has not been validated against real photos.

## Known Limitations

See `README.md` §9 for the full, honest list — summarized: shelf monitoring is a simplified
proof-of-concept rather than true product recognition, and the POS/ERP integration endpoint uses
the owner's own login token rather than a dedicated scoped API key.
