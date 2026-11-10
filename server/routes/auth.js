const crypto = require('crypto');
const router = require('express').Router();
const argon2 = require('argon2');
const prisma = require('../db');
const config = require('../config');
const { AppError, asyncHandler } = require('../middleware/errors');
const { z, text, email, validate } = require('../middleware/validate');
const { signAccess, requireAuth, optionalAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// Used to equalise timing when the account does not exist.
const dummyHash = argon2.hash('not-a-real-password-for-timing', { type: argon2.argon2id });

const registerSchema = z.object({
  name: text(2, 60),
  email,
  password: z
    .string()
    .min(10, 'At least 10 characters')
    .max(128)
    .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), 'Use upper, lower case and a number'),
});
const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

async function startSession(res, user) {
  const raw = crypto.randomBytes(48).toString('hex');
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(raw),
      userId: user.id,
      expiresAt: new Date(Date.now() + config.REFRESH_TTL_SEC * 1000),
    },
  });
  res.cookie('at', signAccess(user), { ...config.cookieBase, path: '/', maxAge: config.ACCESS_TTL_SEC * 1000 });
  res.cookie('rt', raw, { ...config.cookieBase, path: '/api/auth', maxAge: config.REFRESH_TTL_SEC * 1000 });
}

function clearSession(res) {
  res.clearCookie('at', { ...config.cookieBase, path: '/' });
  res.clearCookie('rt', { ...config.cookieBase, path: '/api/auth' });
}

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email: mail, password } = req.body;
    const exists = await prisma.user.findUnique({ where: { email: mail } });
    if (exists) throw new AppError(409, 'Could not create account with these details');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { name, email: mail, passwordHash } });
    await startSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  })
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email: mail, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email: mail } });
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, 'Account temporarily locked. Try again later.', 'LOCKED');
    }
    const ok = user
      ? await argon2.verify(user.passwordHash, password)
      : (await argon2.verify(await dummyHash, password), false);
    if (!ok) {
      if (user) {
        const fails = user.failedLogins + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: fails >= MAX_FAILS
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
            : { failedLogins: fails },
        });
      }
      throw new AppError(401, 'Invalid email or password');
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    await startSession(res, user);
    res.json({ user: publicUser(user) });
  })
);

// Refresh-token rotation with reuse detection.
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies.rt;
    if (!raw) throw new AppError(401, 'Please sign in', 'UNAUTHENTICATED');
    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true },
    });
    if (!record) {
      clearSession(res);
      throw new AppError(401, 'Please sign in', 'UNAUTHENTICATED');
    }
    if (record.revokedAt) {
      await prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      clearSession(res);
      throw new AppError(401, 'Session expired. Please sign in again.', 'UNAUTHENTICATED');
    }
    if (record.expiresAt < new Date()) {
      clearSession(res);
      throw new AppError(401, 'Session expired. Please sign in again.', 'UNAUTHENTICATED');
    }
    await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    await startSession(res, record.user);
    res.json({ user: publicUser(record.user) });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies.rt;
    if (raw) {
      await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    clearSession(res);
    res.status(204).end();
  })
);

// Returns { user: null } for guests (no 401 noise); the client then tries a silent refresh if it had a session.
router.get(
  '/me',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) return res.json({ user: null });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    return res.json({ user: user ? publicUser(user) : null });
  })
);

module.exports = router;
