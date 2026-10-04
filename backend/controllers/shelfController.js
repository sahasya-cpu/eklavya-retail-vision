const { query } = require('../config/db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/**
 * Shelf Monitoring (simplified proof-of-concept)
 * -----------------------------------------------
 * True product-level shelf recognition needs a custom-trained vision model
 * and a large labeled dataset of real shelf photos, which don't exist for
 * this project. Instead, this module uses a lighter, honest technique that
 * still gives a retailer real signal: the owner captures a "fully stocked"
 * reference of a shelf region once; a simple client-side image analysis
 * (edge/fill density of that same region) is compared against it on each
 * check. A big drop in filled ratio means the shelf looks emptier than
 * when it was full — good enough to trigger a restock alert, without
 * pretending to identify products.
 *
 * As with the rest of the platform, only the numeric profile is ever
 * stored — never the shelf photo itself.
 */

const createShelfZone = asyncHandler(async (req, res) => {
  const { zone_id, product_label, baseline_profile, low_stock_threshold = 0.4 } = req.body;
  if (!zone_id || !baseline_profile) throw new ApiError(400, 'zone_id and baseline_profile are required.');

  const zoneCheck = await query('SELECT id FROM zones WHERE id = $1 AND store_id = $2 AND zone_type = $3', [zone_id, req.storeId, 'SHELF']);
  if (zoneCheck.rows.length === 0) throw new ApiError(404, 'Shelf zone not found for this store.');

  const result = await query(
    `INSERT INTO shelf_zones (store_id, zone_id, product_label, baseline_profile, low_stock_threshold)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.storeId, zone_id, product_label || null, JSON.stringify(baseline_profile), low_stock_threshold]
  );
  res.status(201).json({ shelfZone: result.rows[0] });
});

const listShelfZones = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT sz.*, z.name AS zone_name, z.geometry,
            (SELECT sa.filled_ratio FROM shelf_alerts sa WHERE sa.shelf_zone_id = sz.id ORDER BY sa.created_at DESC LIMIT 1) AS last_filled_ratio,
            EXISTS (SELECT 1 FROM shelf_alerts sa WHERE sa.shelf_zone_id = sz.id AND sa.resolved = FALSE) AS has_active_alert
     FROM shelf_zones sz JOIN zones z ON z.id = sz.zone_id
     WHERE sz.store_id = $1 ORDER BY sz.id ASC`,
    [req.storeId]
  );
  res.json({ shelfZones: result.rows });
});

const checkShelfZone = asyncHandler(async (req, res) => {
  const { filled_ratio } = req.body;
  if (filled_ratio === undefined || filled_ratio < 0 || filled_ratio > 1) {
    throw new ApiError(400, 'filled_ratio must be a number between 0 and 1.');
  }

  const shelfResult = await query('SELECT * FROM shelf_zones WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
  if (shelfResult.rows.length === 0) throw new ApiError(404, 'Shelf zone not found.');
  const shelf = shelfResult.rows[0];

  const activeAlert = await query(
    'SELECT * FROM shelf_alerts WHERE shelf_zone_id = $1 AND resolved = FALSE ORDER BY created_at DESC LIMIT 1',
    [shelf.id]
  );

  const isLow = filled_ratio < Number(shelf.low_stock_threshold);

  if (isLow && activeAlert.rows.length === 0) {
    const inserted = await query('INSERT INTO shelf_alerts (shelf_zone_id, filled_ratio) VALUES ($1, $2) RETURNING *', [shelf.id, filled_ratio]);
    return res.json({ status: 'ALERT_RAISED', alert: inserted.rows[0] });
  }

  if (!isLow && activeAlert.rows.length > 0) {
    const resolved = await query('UPDATE shelf_alerts SET resolved = TRUE, resolved_at = NOW() WHERE id = $1 RETURNING *', [activeAlert.rows[0].id]);
    return res.json({ status: 'ALERT_RESOLVED', alert: resolved.rows[0] });
  }

  res.json({ status: isLow ? 'STILL_LOW' : 'OK', filled_ratio });
});

module.exports = { createShelfZone, listShelfZones, checkShelfZone };
