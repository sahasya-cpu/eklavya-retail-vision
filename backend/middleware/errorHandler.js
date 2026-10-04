function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err.code === '23505') return res.status(409).json({ error: 'A record with these details already exists.' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist.' });
  if (err.code === '23514') return res.status(400).json({ error: 'Invalid value provided for one or more fields.' });

  return res.status(500).json({ error: 'Internal server error.' });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => {
      const val = req.body[f];
      return val === undefined || val === null || val === '';
    });
    if (missing.length > 0) {
      return next(new ApiError(400, `Missing required field(s): ${missing.join(', ')}`));
    }
    next();
  };
}

module.exports = { asyncHandler, ApiError, errorHandler, notFound, requireFields };
