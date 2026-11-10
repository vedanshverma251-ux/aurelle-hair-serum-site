const router = require('express').Router();
const prisma = require('../db');
const { AppError, asyncHandler } = require('../middleware/errors');
const { z, validate } = require('../middleware/validate');

const shape = (p, stats) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  tagline: p.tagline,
  description: p.description,
  priceMinor: p.priceMinor,
  currency: p.currency,
  sizeMl: p.sizeMl,
  type: p.type,
  accent: p.accent,
  stock: p.stock,
  avgRating: stats ? Math.round((stats._avg.rating || 0) * 10) / 10 : 0,
  reviewCount: stats ? stats._count._all : 0,
  ingredients: (p.ingredients || []).map((pi) => ({ id: pi.ingredient.id, name: pi.ingredient.name })),
});

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const [products, stats] = await Promise.all([
      prisma.product.findMany({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        include: { ingredients: { include: { ingredient: true } } },
      }),
      prisma.review.groupBy({ by: ['productId'], _avg: { rating: true }, _count: { _all: true } }),
    ]);
    const byId = Object.fromEntries(stats.map((s) => [s.productId, s]));
    res.json({ products: products.map((p) => shape(p, byId[p.id])) });
  })
);

router.get(
  '/products/:slug',
  validate(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }), 'params'),
  asyncHandler(async (req, res) => {
    const p = await prisma.product.findFirst({
      where: { slug: req.params.slug, active: true },
      include: { ingredients: { include: { ingredient: true } } },
    });
    if (!p) throw new AppError(404, 'Product not found');
    const stats = await prisma.review.aggregate({ where: { productId: p.id }, _avg: { rating: true }, _count: { _all: true } });
    res.json({ product: shape(p, stats) });
  })
);

router.get(
  '/ingredients',
  asyncHandler(async (req, res) => {
    const rows = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
    res.json({ ingredients: rows });
  })
);

module.exports = router;
