const bcrypt = require('bcrypt');
const { query, getClient } = require('../config/db');
const { signToken } = require('../config/jwt');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const SALT_ROUNDS = 10;
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * POST /api/auth/register
 * A new owner account also gets one default store created automatically —
 * this product's whole data model hangs off a store, so an owner should
 * never be without one.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, store_name } = req.body;

  if (!isValidEmail(email)) throw new ApiError(400, 'Please provide a valid email address.');
  if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters long.');

  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) throw new ApiError(409, 'An account with this email already exists.');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at`,
      [name, email.toLowerCase(), passwordHash]
    );
    const user = userResult.rows[0];

    const storeResult = await client.query(
      `INSERT INTO stores (owner_id, name) VALUES ($1, $2) RETURNING *`,
      [user.id, store_name || `${name}'s Store`]
    );
    await client.query('COMMIT');

    const token = signToken({ id: user.id, name: user.name, email: user.email });
    res.status(201).json({ user, store: storeResult.rows[0], token });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (result.rows.length === 0) throw new ApiError(401, 'Invalid email or password.');

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw new ApiError(401, 'Invalid email or password.');

  const storeResult = await query('SELECT * FROM stores WHERE owner_id = $1 ORDER BY id ASC LIMIT 1', [user.id]);

  const token = signToken({ id: user.id, name: user.name, email: user.email });
  res.json({
    user: { id: user.id, name: user.name, email: user.email },
    store: storeResult.rows[0] || null,
    token,
  });
});

/**
 * GET /api/auth/me
 */
const me = asyncHandler(async (req, res) => {
  const result = await query('SELECT id, name, email, created_at FROM users WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) throw new ApiError(404, 'User not found.');
  res.json({ user: result.rows[0] });
});

module.exports = { register, login, me };
