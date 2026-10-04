const { query, getClient } = require('../config/db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/**
 * Store Analytics — Shopper, Queue, Dwell & Conversion Intelligence
 * -------------------------------------------------------------
 * All computer-vision inference (person detection, tracking) runs entirely
 * client-side in the owner's browser via TensorFlow.js — no video frame or
 * image ever reaches this server. These endpoints only ever receive and
 * store aggregate numbers: counts, durations, timestamps. This is the
 * privacy-by-design boundary for the whole platform.
 */

const QUEUE_CONGESTION_THRESHOLD = 4; // people in a queue zone before we call it "congested"

const recordFootfall = asyncHandler(async (req, res) => {
  const { events } = req.body;
  if (!Array.isArray(events) || events.length === 0) throw new ApiError(400, 'events must be a non-empty array.');

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const e of events) {
      if (!['ENTRY', 'EXIT'].includes(e.event_type)) throw new ApiError(400, `Invalid event_type: ${e.event_type}`);
      await client.query(
        'INSERT INTO footfall_events (store_id, event_type, occurred_at) VALUES ($1, $2, COALESCE($3, NOW()))',
        [req.storeId, e.event_type, e.occurred_at || null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ recorded: events.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const recordDwell = asyncHandler(async (req, res) => {
  const { zone_id, zone, duration_seconds } = req.body;
  if (!zone || !Number.isFinite(Number(duration_seconds)) || duration_seconds < 0) {
    throw new ApiError(400, 'zone and a non-negative duration_seconds are required.');
  }
  await query(
    'INSERT INTO dwell_events (store_id, zone_id, zone_name, duration_seconds) VALUES ($1, $2, $3, $4)',
    [req.storeId, zone_id || null, zone, Math.round(duration_seconds)]
  );
  res.status(201).json({ recorded: true });
});

const recordQueueSample = asyncHandler(async (req, res) => {
  const { zone_id, zone_name = 'checkout', queue_length } = req.body;
  if (!Number.isInteger(queue_length) || queue_length < 0) {
    throw new ApiError(400, 'queue_length must be a non-negative integer.');
  }
  const isCongested = queue_length >= QUEUE_CONGESTION_THRESHOLD;
  await query(
    'INSERT INTO queue_samples (store_id, zone_id, zone_name, queue_length, is_congested) VALUES ($1, $2, $3, $4, $5)',
    [req.storeId, zone_id || null, zone_name, queue_length, isCongested]
  );
  res.status(201).json({ recorded: true, is_congested: isCongested, threshold: QUEUE_CONGESTION_THRESHOLD });
});

const recordHeatmapHits = asyncHandler(async (req, res) => {
  const { cells } = req.body;
  if (!Array.isArray(cells) || cells.length === 0) throw new ApiError(400, 'cells must be a non-empty array.');

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const c of cells) {
      if (!Number.isInteger(c.grid_x) || !Number.isInteger(c.grid_y) || !Number.isInteger(c.hits)) {
        throw new ApiError(400, 'Each cell needs integer grid_x, grid_y, and hits.');
      }
      await client.query(
        `INSERT INTO heatmap_cells (store_id, grid_x, grid_y, hit_count, recorded_date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)
         ON CONFLICT (store_id, grid_x, grid_y, recorded_date)
         DO UPDATE SET hit_count = heatmap_cells.hit_count + EXCLUDED.hit_count`,
        [req.storeId, c.grid_x, c.grid_y, c.hits]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ recorded: cells.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * GET /api/analytics/summary — everything the live dashboard needs, for "today".
 */
const getSummary = asyncHandler(async (req, res) => {
  const storeId = req.storeId;
  const [
    todayFootfallResult,
    footfallTrendResult,
    avgDwellResult,
    dwellByZoneResult,
    currentQueueResult,
    congestionTodayResult,
    heatmapTodayResult,
    todayTxnResult,
    shelfAlertsResult,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) FILTER (WHERE event_type = 'ENTRY') AS entries,
              COUNT(*) FILTER (WHERE event_type = 'EXIT') AS exits
       FROM footfall_events WHERE store_id = $1 AND occurred_at::date = CURRENT_DATE`,
      [storeId]
    ),
    query(
      `SELECT occurred_at::date AS day, COUNT(*) FILTER (WHERE event_type = 'ENTRY') AS entries
       FROM footfall_events WHERE store_id = $1 AND occurred_at >= NOW() - INTERVAL '7 days'
       GROUP BY day ORDER BY day ASC`,
      [storeId]
    ),
    query(`SELECT COALESCE(AVG(duration_seconds), 0) AS avg_seconds FROM dwell_events WHERE store_id = $1 AND occurred_at::date = CURRENT_DATE`, [storeId]),
    query(
      `SELECT zone_name AS zone, COALESCE(AVG(duration_seconds), 0) AS avg_seconds, COUNT(*) AS samples
       FROM dwell_events WHERE store_id = $1 AND occurred_at::date = CURRENT_DATE
       GROUP BY zone_name ORDER BY avg_seconds DESC LIMIT 8`,
      [storeId]
    ),
    query('SELECT queue_length, is_congested, sampled_at FROM queue_samples WHERE store_id = $1 ORDER BY sampled_at DESC LIMIT 1', [storeId]),
    query(
      `SELECT COUNT(*) AS congested_samples FROM queue_samples
       WHERE store_id = $1 AND sampled_at::date = CURRENT_DATE AND is_congested = TRUE`,
      [storeId]
    ),
    query('SELECT grid_x, grid_y, hit_count FROM heatmap_cells WHERE store_id = $1 AND recorded_date = CURRENT_DATE', [storeId]),
    query(
      `SELECT COUNT(*) AS txn_count, COALESCE(SUM(amount), 0) AS revenue
       FROM pos_transactions WHERE store_id = $1 AND occurred_at::date = CURRENT_DATE`,
      [storeId]
    ),
    query(
      `SELECT sa.id, sa.filled_ratio, sa.created_at, sz.product_label, z.name AS zone_name
       FROM shelf_alerts sa
       JOIN shelf_zones sz ON sz.id = sa.shelf_zone_id
       JOIN zones z ON z.id = sz.zone_id
       WHERE sz.store_id = $1 AND sa.resolved = FALSE
       ORDER BY sa.created_at DESC`,
      [storeId]
    ),
  ]);

  const entries = Number(todayFootfallResult.rows[0].entries);
  const exits = Number(todayFootfallResult.rows[0].exits);
  const txnCount = Number(todayTxnResult.rows[0].txn_count);
  const revenue = Number(todayTxnResult.rows[0].revenue);

  res.json({
    todayFootfall: entries,
    currentOccupancy: Math.max(0, entries - exits),
    footfallTrend: footfallTrendResult.rows,
    avgDwellSeconds: Math.round(Number(avgDwellResult.rows[0].avg_seconds)),
    dwellByZone: dwellByZoneResult.rows.map((r) => ({ zone: r.zone, avgSeconds: Math.round(Number(r.avg_seconds)), samples: Number(r.samples) })),
    currentQueue: currentQueueResult.rows[0] || null,
    congestedSamplesToday: Number(congestionTodayResult.rows[0].congested_samples),
    heatmap: heatmapTodayResult.rows,
    todayTransactions: txnCount,
    todayRevenue: revenue,
    // Conversion indicator: what fraction of visitors actually bought something.
    // A simple, explainable ratio rather than a modeled/estimated figure.
    conversionRate: entries > 0 ? Math.round((txnCount / entries) * 1000) / 10 : null,
    activeShelfAlerts: shelfAlertsResult.rows,
  });
});

/**
 * GET /api/analytics/reports?range=daily|weekly — a per-day breakdown for
 * the requested window, covering footfall, dwell, congestion, and revenue
 * together so an owner can see day-over-day operational trends.
 */
const getReports = asyncHandler(async (req, res) => {
  const { range = 'weekly' } = req.query;
  const days = range === 'daily' ? 1 : range === 'monthly' ? 30 : 7;

  const result = await query(
    `SELECT
       d::date AS day,
       COALESCE(f.entries, 0) AS footfall,
       COALESCE(q.congested_samples, 0) AS congested_samples,
       COALESCE(t.txn_count, 0) AS transactions,
       COALESCE(t.revenue, 0) AS revenue
     FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day') d
     LEFT JOIN (
       SELECT occurred_at::date AS day, COUNT(*) FILTER (WHERE event_type = 'ENTRY') AS entries
       FROM footfall_events WHERE store_id = $2 GROUP BY day
     ) f ON f.day = d::date
     LEFT JOIN (
       SELECT sampled_at::date AS day, COUNT(*) FILTER (WHERE is_congested) AS congested_samples
       FROM queue_samples WHERE store_id = $2 GROUP BY day
     ) q ON q.day = d::date
     LEFT JOIN (
       SELECT occurred_at::date AS day, COUNT(*) AS txn_count, SUM(amount) AS revenue
       FROM pos_transactions WHERE store_id = $2 GROUP BY day
     ) t ON t.day = d::date
     ORDER BY day ASC`,
    [days, req.storeId]
  );

  res.json({ range, days, report: result.rows });
});

module.exports = { recordFootfall, recordDwell, recordQueueSample, recordHeatmapHits, getSummary, getReports };
