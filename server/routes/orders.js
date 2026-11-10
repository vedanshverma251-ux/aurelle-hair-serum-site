const router = require('express').Router();
const prisma = require('../db');
const config = require('../config');
const { AppError, asyncHandler } = require('../middleware/errors');
const { z, text, email, validate } = require('../middleware/validate');
const { optionalAuth, requireAuth, requireRole } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

let stripeClient = null;
function stripe() {
  if (!config.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) stripeClient = require('stripe')(config.STRIPE_SECRET_KEY);
  return stripeClient;
}

const orderSchema = z.object({
  email,
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10) })).min(1).max(20),
  shipping: z.object({
    name: text(2, 80),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
    line1: text(5, 160),
    city: text(2, 60),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
  }),
});

router.post(
  '/',
  writeLimiter,
  optionalAuth,
  validate(orderSchema),
  asyncHandler(async (req, res) => {
    const { email: mail, shipping } = req.body;

    // Merge duplicate lines; prices ALWAYS come from the database, never from the client.
    const qty = new Map();
    for (const i of req.body.items) qty.set(i.productId, Math.min(10, (qty.get(i.productId) || 0) + i.quantity));

    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: [...qty.keys()] }, active: true } });
      if (products.length !== qty.size) throw new AppError(400, 'One or more items are unavailable');
      let total = 0;
      const lines = [];
      for (const p of products) {
        const q = qty.get(p.id);
        const claimed = await tx.product.updateMany({ where: { id: p.id, stock: { gte: q } }, data: { stock: { decrement: q } } });
        if (claimed.count !== 1) throw new AppError(409, `${p.name} is out of stock`);
        total += p.priceMinor * q;
        lines.push({ productId: p.id, quantity: q, unitMinor: p.priceMinor, name: p.name });
      }
      const created = await tx.order.create({
        data: {
          userId: req.user?.id || null,
          email: mail,
          totalMinor: total,
          shipName: shipping.name,
          shipPhone: shipping.phone,
          shipLine1: shipping.line1,
          shipCity: shipping.city,
          shipPincode: shipping.pincode,
          items: { create: lines.map(({ name, ...l }) => l) },
        },
      });
      return { ...created, lines };
    });

    let checkoutUrl = null;
    const s = stripe();
    if (s) {
      const session = await s.checkout.sessions.create({
        mode: 'payment',
        customer_email: mail,
        line_items: order.lines.map((l) => ({
          quantity: l.quantity,
          price_data: { currency: 'inr', unit_amount: l.unitMinor, product_data: { name: l.name } },
        })),
        metadata: { orderId: order.id },
        success_url: `${config.CLIENT_URL}/?order=success`,
        cancel_url: `${config.CLIENT_URL}/?order=cancelled`,
      });
      await prisma.order.update({ where: { id: order.id }, data: { paymentRef: session.id } });
      checkoutUrl = session.url;
    }
    res.status(201).json({
      order: { id: order.id, status: order.status, totalMinor: order.totalMinor },
      checkoutUrl,
      message: checkoutUrl ? undefined : 'Order placed. Pay on delivery.',
    });
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, status: true, totalMinor: true, createdAt: true },
    });
    res.json({ orders });
  })
);

// Admin only.
router.get(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { items: true } });
    res.json({ orders });
  })
);

router.patch(
  '/:id/status',
  requireAuth,
  requireRole('ADMIN'),
  validate(z.object({ id: z.string().uuid() }), 'params'),
  validate(z.object({ status: z.enum(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']) })),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.update({ where: { id: req.params.id }, data: { status: req.body.status } }).catch(() => null);
    if (!order) throw new AppError(404, 'Order not found');
    res.json({ order: { id: order.id, status: order.status } });
  })
);

// Stripe webhook (raw body; mounted before express.json and exempt from CSRF - verified by signature instead).
const webhook = asyncHandler(async (req, res) => {
  const s = stripe();
  if (!s || !config.STRIPE_WEBHOOK_SECRET) return res.status(404).end();
  let event;
  try {
    event = s.webhooks.constructEvent(req.body, req.get('stripe-signature'), config.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  if (event.type === 'checkout.session.completed') {
    const orderId = event.data.object.metadata?.orderId;
    if (orderId) await prisma.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'PAID' } });
  }
  return res.json({ received: true });
});

module.exports = { router, webhook };
