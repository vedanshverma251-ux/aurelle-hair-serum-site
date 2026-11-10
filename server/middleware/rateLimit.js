const rateLimit = require('express-rate-limit');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: message, code: 'RATE_LIMIT' },
  });

module.exports = {
  globalLimiter: make(15 * 60 * 1000, 600, 'Too many requests. Please slow down.'),
  authLimiter: make(15 * 60 * 1000, 20, 'Too many attempts. Try again in a few minutes.'),
  writeLimiter: make(15 * 60 * 1000, 60, 'Too many submissions. Try again later.'),
};
