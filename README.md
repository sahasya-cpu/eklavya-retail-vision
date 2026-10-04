# Eklavya Retail Vision

An AI-powered retail intelligence platform delivering real-time shopper analytics, automated
inventory visibility, and proactive queue management through **on-device AI** — built for
**SIH 2026 Problem Statement 26179**.

All computer-vision inference (person detection, tracking) runs **entirely in the store owner's
browser tab**. No video frame or image is ever sent to a server — only the resulting aggregate
numbers (counts, durations, coarse grid positions) are. This is genuine edge AI and privacy by
architecture, not just a design goal.

---

## 1. Problem Statement Coverage

| Requirement | Status |
|---|---|
| **1. Shopper Analytics** — entry/exit counting, dwell time, heatmaps | ✅ Built — real on-device person detection + tracking |
| **2. Inventory Monitoring** — shelf cameras, out-of-stock detection | ⚠️ Simplified proof-of-concept — see §9 Known Limitations |
| **3. Queue Intelligence** — queue length, congestion prediction | ✅ Built |
| **4. Edge AI Processing** — local inference, works offline-ish, low latency | ✅ Genuinely true — inference runs client-side |
| **5. Privacy-Aware Analytics** — anonymous, no PII stored | ✅ By construction — backend never receives images |
| **6. Store Operations Dashboard** — alerts, reports, KPIs | ✅ Built |
| **7. Scalable Deployment** — multi-store, POS/ERP integration | ⚠️ Multi-store data model built; integration is a demonstrative endpoint — see §9 |

---

## 2. Architecture

```
Browser (owner's device)
  ├── Webcam → TensorFlow.js (COCO-SSD) → person detection
  ├── Custom centroid-tracking engine (entry/exit, dwell, queue, heatmap) — runs client-side
  └── Only aggregate numbers sent to backend
        ↓ REST (JWT auth)
Node.js + Express (port 5001)
  ├── Auth, multi-store support
  ├── Zones persisted server-side (entrance line, dwell, queue, shelf regions)
  ├── Analytics ingestion + summary + reports
  ├── Shelf monitoring (simplified image-variance comparison)
  └── POS/ERP integration endpoint
        ↓
PostgreSQL — counts, durations, coarse grid positions only. No images, ever.
```

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, React Router, Axios, Recharts |
| On-device AI | TensorFlow.js, COCO-SSD (free, open-source, MIT licensed) |
| Backend | Node.js, Express, JWT, bcrypt |
| Database | PostgreSQL |

Everything used is free and open-source — no paid APIs, no cloud AI service, no licensing cost.

---

## 4. Prerequisites (Windows)

1. **Node.js 18+** — https://nodejs.org
2. **PostgreSQL 14+** — https://www.postgresql.org/download/windows/

---

## 5. Database Setup

```
psql -U postgres -c "CREATE DATABASE eklavya_retail_vision;"
psql -U postgres -d eklavya_retail_vision -f database\schema.sql
psql -U postgres -d eklavya_retail_vision -f database\seed.sql
```

This creates one demo account with 14 days of realistic historical data already populated
(footfall, dwell, queue samples, transactions) so the dashboard and reports show meaningful
results immediately.

**Demo account:** `demo@eklavya.com` / `password123`

---

## 6. Backend Setup

```
cd backend
copy .env.example .env
```
Edit `.env` and set your PostgreSQL password in `DATABASE_URL`, plus a random `JWT_SECRET`.

```
npm install
npm start
```
Verify: http://localhost:5001/api/health → `{"status":"ok",...}`

---

## 7. Frontend Setup

```
cd frontend
copy .env.example .env
npm install
npm run dev
```
Open the printed URL — typically **http://localhost:5174**.

---

## 8. Using the Platform

### Dashboard
Live KPIs (footfall, occupancy, dwell, conversion rate), 7-day trends, active alerts.

### Store Vision (the core feature)
1. Click **Start monitoring** — grants camera access and loads the on-device AI model.
2. Drag the **entrance line slider** to position the virtual line that separates "outside" from
   "inside" the frame — crossing it downward counts as an entry, upward as an exit.
3. Click **+ Add dwell zone** or **+ Add checkout/queue zone**, then draw a rectangle directly
   on the video to mark a region — e.g. a product aisle (dwell) or a checkout counter (queue).
4. Walk in front of the camera to see live bounding boxes, zone occupancy, and footfall counts
   update. Heatmap accumulates automatically.

### Shelf Monitor
1. Turn on the camera, point it at a shelf.
2. Draw a rectangle over the shelf region **while it's fully stocked**.
3. Name the product and click **Capture as baseline**.
4. Use **Check now** or **Auto-check every 10s** to compare the live shelf against that baseline
   — a significant drop in visual texture triggers a low-stock alert, which auto-resolves once
   restocked.

### Reports
Day-by-day footfall, transactions, revenue, and congestion history, switchable between
daily/weekly/monthly windows.

---

## 9. Known Limitations (stated honestly)

- **Shelf monitoring is a simplified proof-of-concept**, not true product recognition. It
  compares a numeric "visual texture" signature (grayscale variance) of a shelf region against
  a one-time reference photo's signature — a big drop signals "this looks emptier," which is
  useful real signal, but it cannot identify *which* product ran out or distinguish a messy-but-
  full shelf from a genuinely empty one as reliably as a custom-trained vision model could. That
  would require a large labeled dataset of real shelf photos, which doesn't exist for this
  project.
- **POS/ERP integration** is a working, authenticated endpoint
  (`POST /api/integrations/pos-transaction`) that any external system can push completed sales
  to, and the platform genuinely computes a conversion rate and revenue trends from that data —
  but it uses the owner's own login token rather than a dedicated scoped API key, which would be
  the production-grade next step for a real POS vendor integration.
- **Centralized multi-location monitoring** — the data model fully supports an owner having
  multiple stores (each store's data is isolated), and the API supports switching between them,
  but there is no dedicated "all locations at a glance" summary view yet.
- Person detection accuracy depends on camera angle, lighting, and occlusion, like any
  vision-based system — it works best with a clear, elevated view of the monitored area.
- No automated end-to-end browser test suite ships with this project; the tracking/estimation
  math was unit-tested in isolation, and every backend endpoint was verified live with real HTTP
  requests — see the test commands in `FINAL_TEST_REPORT.md` for exactly what was checked.

---

## 10. Future Scope

- Custom-trained shelf/product recognition model, trained on real in-store imagery.
- Dedicated API-key-based POS/ERP integration for production vendor use.
- Multi-location "all stores" dashboard view.
- Edge hardware deployment (Raspberry Pi / Jetson Nano) running the same TensorFlow.js model via
  a local Node runtime, for stores wanting a dedicated always-on device instead of a browser tab.
