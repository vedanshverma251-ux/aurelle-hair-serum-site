const crypto = require('crypto');
const config = require('../config');

const COOKIE = 'csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Double-submit token: httpOnly cookie must match the x-csrf-token header.
// A cross-site page can neither read the token (CORS) nor set the header.
function issueToken(req, res) {
  let token = req.cookies[COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE, token, { ...config.cookieBase, maxAge: 24 * 60 * 60 * 1000 });
  }
  res.json({ token });
}

function csrfProtection(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== config.CLIENT_URL) {
    return res.status(403).json({ error: 'Origin not allowed', code: 'CSRF' });
  }
  const cookie = req.cookies[COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) {
    return res.status(403).json({ error: 'Security token missing or invalid', code: 'CSRF' });
  }
  return next();
}

module.exports = { issueToken, csrfProtection };
