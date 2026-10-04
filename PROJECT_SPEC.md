# PROJECT_SPEC.md — Eklavya Retail Vision

## 1. Problem Statement

**SIH 2026 — Problem Statement 26179**: Build an AI-powered retail intelligence platform that
delivers real-time shopper analytics, automated inventory visibility, and proactive queue
management through on-device AI, enabling retailers to reduce stock-outs, improve customer
experience, optimize staffing, and increase operational efficiency while maintaining privacy and
minimizing cloud dependency.

## 2. Core Design Principle: Genuine Edge AI

Every person-detection and tracking computation happens in the browser tab itself, via
TensorFlow.js. The backend is architecturally incapable of receiving a video frame or image —
only derived aggregate numbers (entry/exit counts, dwell durations, queue lengths, coarse
heatmap grid hits) ever cross the network. This is the foundation the rest of the platform is
built on, and it directly satisfies the problem statement's privacy and cloud-independence
requirements for real, not just by assertion.

## 3. Modules

1. **Shopper Analytics** — centroid-based multi-person tracking; a configurable virtual entrance
   line for entry/exit counting; named dwell zones for time-in-area measurement; coarse grid
   heatmap accumulation.
2. **Queue Intelligence** — named queue zones; periodic occupant-count sampling; congestion
   flagged against a fixed, explainable threshold.
3. **Inventory Monitoring (simplified)** — shelf regions with a captured "fully stocked"
   reference; periodic visual-texture comparison flags likely low stock.
4. **Store Operations Dashboard** — live KPIs, 7-day trend charts, active alerts.
5. **Reports** — day-by-day footfall/transactions/revenue/congestion breakdown.
6. **POS/ERP Integration** — authenticated endpoint for external systems to push completed sales.

## 4. Tech Stack

React + Vite, TensorFlow.js + COCO-SSD, Node.js + Express, PostgreSQL. 100% free and
open-source — no paid APIs or cloud AI services.

## 5. Data Model Summary

`users` → `stores` (one owner, many locations) → `zones` (entrance line / dwell / queue / shelf,
geometry stored as frame-relative fractions) → `footfall_events` / `dwell_events` /
`queue_samples` / `heatmap_cells` / `shelf_zones` / `shelf_alerts` / `pos_transactions`.

## 6. Out of Scope (Documented, Not Built)

- True product-level shelf recognition (needs a custom-trained model + real dataset).
- Dedicated scoped API keys for POS/ERP vendors (current integration uses owner JWT).
- Edge hardware deployment (Raspberry Pi/Jetson) — documented as future scope.
- Multi-location "all stores at once" dashboard view.
