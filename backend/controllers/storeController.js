const { query } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /api/stores — every store this owner has, for a location switcher in the UI.
 */
const listStores = asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM stores WHERE owner_id = $1 ORDER BY id ASC', [req.user.id]);
  res.json({ stores: result.rows });
});

/**
 * POST /api/stores — add another location under the same account.
 */
const createStore = asyncHandler(async (req, res) => {
  const { name, location } = req.body;
  const result = await query(
    'INSERT INTO stores (owner_id, name, location) VALUES ($1, $2, $3) RETURNING *',
    [req.user.id, name, location || null]
  );
  res.status(201).json({ store: result.rows[0] });
});

module.exports = { listStores, createStore };
