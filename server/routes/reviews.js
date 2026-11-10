const router = require('express').Router();
const prisma = require('../db');
const { AppError, asyncHandler } = require('../middleware/errors');
const { z, text, validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

router.get(
  '/',
  validate(z.object({ productId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(24).default(9) }), 'query'),
  asyncHandler(async (req, res) => {
    const { productId, limit } = req.query;
    const rows = await prisma.review.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { product: { select: { name: true } } },
    });
    res.json({
      reviews: rows.map((r) => ({
        id: r.id, rating: r.rating, title: r.title, body: r.body,
        authorName: r.authorName, product: r.product.name, createdAt: r.createdAt,
      })),
    });
  })
);

router.post(
  '/',
  requireAuth,
  writeLimiter,
  validate(z.object({ productId: z.string().uuid(), rating: z.number().int().min(1).max(5), title: text(2, 80), body: text(5, 800) })),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new AppError(401, 'Please sign in', 'UNAUTHENTICATED');
    const product = await prisma.product.findFirst({ where: { id: req.body.productId, active: true } });
    if (!product) throw new AppError(404, 'Product not found');
    const dup = await prisma.review.findUnique({ where: { productId_userId: { productId: product.id, userId: user.id } } });
    if (dup) throw new AppError(409, 'You already reviewed this product');
    const r = await prisma.review.create({
      data: { ...req.body, userId: user.id, authorName: user.name },
    });
    res.status(201).json({ review: { id: r.id } });
  })
);

module.exports = router;
