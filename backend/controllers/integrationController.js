const { query } = require('../config/db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

/**
 * POS / ERP Integration
 * ---------------------
 * A minimal, honest integration point: an external POS or ERP system posts
 * each completed sale here, and the platform uses it to compute a real
 * conversion indicator (transactions ÷ footfall) and revenue trends
 * alongside the vision-based shopper/queue metrics. This is authenticated
 * the same way as the rest of the API for this MVP; a production
 * deployment would issue POS systems their own scoped API key rather than
 * a full owner login token — documented as a near-term next step.
 */
const recordTransaction = asyncHandler(async (req, res) => {
  const { amount, occurred_at } = req.body;
  if (!Number.isFinite(Number(amount)) || amount < 0) {
    throw new ApiError(400, 'amount must be a non-negative number.');
  }
  const result = await query(
    'INSERT INTO pos_transactions (store_id, amount, occurred_at) VALUES ($1, $2, COALESCE($3, NOW())) RETURNING *',
    [req.storeId, amount, occurred_at || null]
  );
  res.status(201).json({ transaction: result.rows[0] });
});

module.exports = { recordTransaction };
