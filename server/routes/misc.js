const router = require('express').Router();
const prisma = require('../db');
const { AppError, asyncHandler } = require('../middleware/errors');
const { z, text, email, validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

// Store locator by pincode: exact match first, then same 3-digit area, then a few others.
router.get(
  '/stores',
  validate(z.object({ pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit pincode').optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const { pincode } = req.query;
    let stores = [];
    let match = 'all';
    if (pincode) {
      stores = await prisma.store.findMany({ where: { pincode }, take: 6 });
      match = 'exact';
      if (!stores.length) {
        stores = await prisma.store.findMany({ where: { pincode: { startsWith: pincode.slice(0, 3) } }, take: 6 });
        match = 'area';
      }
    }
    if (!stores.length) {
      stores = await prisma.store.findMany({ take: 4, orderBy: { city: 'asc' } });
      match = 'all';
    }
    res.json({ match, stores });
  })
);

router.post(
  '/newsletter',
  writeLimiter,
  validate(z.object({ email })),
  asyncHandler(async (req, res) => {
    await prisma.subscriber.upsert({ where: { email: req.body.email }, update: {}, create: { email: req.body.email } });
    res.status(201).json({ ok: true });
  })
);

router.post(
  '/contact',
  writeLimiter,
  validate(z.object({ name: text(2, 80), email, message: text(10, 1500) })),
  asyncHandler(async (req, res) => {
    await prisma.contactMessage.create({ data: req.body });
    res.status(201).json({ ok: true });
  })
);

const idParam = validate(z.object({ productId: z.string().uuid() }), 'params');

router.get(
  '/wishlist',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await prisma.wishlistItem.findMany({ where: { userId: req.user.id }, select: { productId: true } });
    res.json({ productIds: rows.map((r) => r.productId) });
  })
);

router.post(
  '/wishlist/:productId',
  requireAuth,
  writeLimiter,
  idParam,
  asyncHandler(async (req, res) => {
    const p = await prisma.product.findUnique({ where: { id: req.params.productId } });
    if (!p) throw new AppError(404, 'Product not found');
    await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId: req.user.id, productId: p.id } },
      update: {},
      create: { userId: req.user.id, productId: p.id },
    });
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/wishlist/:productId',
  requireAuth,
  idParam,
  asyncHandler(async (req, res) => {
    await prisma.wishlistItem.deleteMany({ where: { userId: req.user.id, productId: req.params.productId } });
    res.status(204).end();
  })
);

module.exports = router;
