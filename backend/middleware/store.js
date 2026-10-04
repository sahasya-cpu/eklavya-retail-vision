const { query } = require('../config/db');
const { asyncHandler, ApiError } = require('./errorHandler');

/**
 * Resolves req.storeId for the current request. Supports an owner with
 * multiple stores (the "scalable deployment / multiple locations"
 * requirement): pass ?store_id= to target a specific one, or omit it to
 * default to the owner's first (or only) store. Always verifies the store
 * actually belongs to the authenticated user — never trusts a bare ID.
 */
const resolveStore = asyncHandler(async (req, res, next) => {
  const requestedId = req.query.store_id || req.body.store_id;

  const sql = requestedId
    ? 'SELECT * FROM stores WHERE id = $1 AND owner_id = $2'
    : 'SELECT * FROM stores WHERE owner_id = $1 ORDER BY id ASC LIMIT 1';
  const params = requestedId ? [requestedId, req.user.id] : [req.user.id];

  const result = await query(sql, params);
  if (result.rows.length === 0) {
    throw new ApiError(404, requestedId ? 'Store not found for this account.' : 'No store found for this account.');
  }

  req.store = result.rows[0];
  req.storeId = result.rows[0].id;
  next();
});

module.exports = { resolveStore };
