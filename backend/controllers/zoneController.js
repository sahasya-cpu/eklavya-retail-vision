const { query } = require('../config/db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const ZONE_TYPES = ['DWELL', 'QUEUE', 'SHELF', 'ENTRANCE_LINE'];

/**
 * GET /api/zones — all active zones configured for the current store.
 * Persisting these server-side (rather than only in browser state) means
 * the configuration survives across sessions, browser tabs, and devices —
 * important for a real deployment, not just a single demo session.
 */
const listZones = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM zones WHERE store_id = $1 AND is_active = TRUE ORDER BY id ASC',
    [req.storeId]
  );
  res.json({ zones: result.rows });
});

/**
 * POST /api/zones
 * body: { name, zone_type, geometry }
 * geometry is fractions (0..1) of the camera frame: { x, y, width, height }
 * for rectangles, or { y } alone for the entrance line.
 */
const createZone = asyncHandler(async (req, res) => {
  const { name, zone_type, geometry } = req.body;
  if (!ZONE_TYPES.includes(zone_type)) {
    throw new ApiError(400, `zone_type must be one of: ${ZONE_TYPES.join(', ')}`);
  }
  const result = await query(
    'INSERT INTO zones (store_id, name, zone_type, geometry) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.storeId, name, zone_type, JSON.stringify(geometry)]
  );
  res.status(201).json({ zone: result.rows[0] });
});

/**
 * DELETE /api/zones/:id — soft delete, preserving the history of events
 * already recorded against this zone.
 */
const deleteZone = asyncHandler(async (req, res) => {
  const result = await query(
    'UPDATE zones SET is_active = FALSE WHERE id = $1 AND store_id = $2 RETURNING id',
    [req.params.id, req.storeId]
  );
  if (result.rows.length === 0) throw new ApiError(404, 'Zone not found.');
  res.json({ message: 'Zone removed.' });
});

module.exports = { listZones, createZone, deleteZone };
