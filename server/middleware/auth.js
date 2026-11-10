const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./errors');

const JWT_OPTS = { algorithms: ['HS256'], issuer: 'aurelle' };

function signAccess(user) {
  return jwt.sign({ role: user.role }, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: 'aurelle',
    subject: user.id,
    expiresIn: config.ACCESS_TTL_SEC,
  });
}

function readUser(req) {
  const token = req.cookies.at;
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.JWT_ACCESS_SECRET, JWT_OPTS);
    return { id: p.sub, role: p.role };
  } catch {
    return null;
  }
}

const optionalAuth = (req, res, next) => {
  req.user = readUser(req);
  next();
};

const requireAuth = (req, res, next) => {
  req.user = readUser(req);
  if (!req.user) return next(new AppError(401, 'Please sign in', 'UNAUTHENTICATED'));
  return next();
};

const requireRole =
  (role) =>
  (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Please sign in', 'UNAUTHENTICATED'));
    if (req.user.role !== role) return next(new AppError(403, 'Not allowed', 'FORBIDDEN'));
    return next();
  };

module.exports = { signAccess, optionalAuth, requireAuth, requireRole };
