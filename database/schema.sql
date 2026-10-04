-- ============================================================
-- Eklavya Retail Vision — Database Schema
-- PostgreSQL
--
-- Privacy by design: this schema stores ONLY aggregate numbers
-- (counts, durations, coarse grid positions) produced by on-device
-- AI running in the browser. No image, video frame, or any
-- personally identifiable shopper data is ever stored here.
-- ============================================================

DROP TABLE IF EXISTS pos_transactions CASCADE;
DROP TABLE IF EXISTS shelf_alerts CASCADE;
DROP TABLE IF EXISTS shelf_zones CASCADE;
DROP TABLE IF EXISTS heatmap_cells CASCADE;
DROP TABLE IF EXISTS queue_samples CASCADE;
DROP TABLE IF EXISTS dwell_events CASCADE;
DROP TABLE IF EXISTS footfall_events CASCADE;
DROP TABLE IF EXISTS zones CASCADE;
DROP TABLE IF EXISTS stores CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ------------------------------------------------------------
-- USERS (store owners / operators — single role, this product
-- has no customer-facing side)
-- ------------------------------------------------------------
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- STORES (supports the "scalable deployment / multiple
-- locations" requirement — each store is monitored independently)
-- ------------------------------------------------------------
CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    location VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_stores_owner ON stores(owner_id);

-- ------------------------------------------------------------
-- ZONES (entrance lines, dwell zones, queue zones, shelf zones —
-- persisted per store so a configuration survives across sessions
-- and devices, unlike a purely client-side setup)
-- ------------------------------------------------------------
CREATE TABLE zones (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    zone_type VARCHAR(20) NOT NULL CHECK (zone_type IN ('DWELL', 'QUEUE', 'SHELF', 'ENTRANCE_LINE')),
    -- Geometry stored as fractions (0..1) of the camera frame, so it is
    -- resolution-independent across different cameras/devices.
    geometry JSONB NOT NULL, -- {x, y, width, height} for rects, {y} for the entrance line
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_zones_store ON zones(store_id);

-- ------------------------------------------------------------
-- FOOTFALL_EVENTS — one row per detected entry/exit crossing
-- ------------------------------------------------------------
CREATE TABLE footfall_events (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('ENTRY', 'EXIT')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_footfall_store_time ON footfall_events(store_id, occurred_at);

-- ------------------------------------------------------------
-- DWELL_EVENTS — one row per completed dwell session in a zone
-- ------------------------------------------------------------
CREATE TABLE dwell_events (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
    zone_name VARCHAR(150) NOT NULL, -- denormalized so history survives zone deletion/rename
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dwell_store_time ON dwell_events(store_id, occurred_at);

-- ------------------------------------------------------------
-- QUEUE_SAMPLES — periodic queue-length readings
-- ------------------------------------------------------------
CREATE TABLE queue_samples (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
    zone_name VARCHAR(150) NOT NULL,
    queue_length INTEGER NOT NULL CHECK (queue_length >= 0),
    is_congested BOOLEAN NOT NULL DEFAULT FALSE,
    sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_queue_store_time ON queue_samples(store_id, sampled_at);

-- ------------------------------------------------------------
-- HEATMAP_CELLS — anonymous movement density, per day
-- ------------------------------------------------------------
CREATE TABLE heatmap_cells (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    grid_x INTEGER NOT NULL,
    grid_y INTEGER NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE (store_id, grid_x, grid_y, recorded_date)
);
CREATE INDEX idx_heatmap_store_date ON heatmap_cells(store_id, recorded_date);

-- ------------------------------------------------------------
-- SHELF_ZONES — a defined shelf region with a reference
-- ("fully stocked") baseline for simplified visual comparison.
-- The baseline is stored as a small numeric profile (brightness /
-- edge-density signature computed client-side), never as an image.
-- ------------------------------------------------------------
CREATE TABLE shelf_zones (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    product_label VARCHAR(150), -- what the owner says is normally stocked here
    baseline_profile JSONB, -- {avgBrightness, filledRatio} captured when the shelf was full
    low_stock_threshold NUMERIC(4,2) NOT NULL DEFAULT 0.4, -- flag when filledRatio drops below this
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_shelf_zones_store ON shelf_zones(store_id);

-- ------------------------------------------------------------
-- SHELF_ALERTS — history of low/out-of-stock flags raised
-- ------------------------------------------------------------
CREATE TABLE shelf_alerts (
    id SERIAL PRIMARY KEY,
    shelf_zone_id INTEGER NOT NULL REFERENCES shelf_zones(id) ON DELETE CASCADE,
    filled_ratio NUMERIC(4,2) NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_shelf_alerts_zone ON shelf_alerts(shelf_zone_id);

-- ------------------------------------------------------------
-- POS_TRANSACTIONS — pushed by an external POS / billing system
-- via the integration endpoint. Lets the platform compute a real
-- conversion indicator (transactions / footfall) and staff
-- efficiency (transactions per staff hour).
-- ------------------------------------------------------------
CREATE TABLE pos_transactions (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pos_store_time ON pos_transactions(store_id, occurred_at);
