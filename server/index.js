const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const prisma = require('./db');
const { globalLimiter } = require('./middleware/rateLimit');
const { issueToken, csrfProtection } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/errors');
const ordersModule = require('./routes/orders');

const app = express();
app.disable('x-powered-by');
if (config.isProd) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", 'https://checkout.stripe.com'],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    hsts: config.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(morgan(config.isProd ? 'combined' : 'dev'));
app.use(cors({ origin: config.CLIENT_URL, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));

// Stripe needs the raw body, so this is mounted before express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), ordersModule.webhook);

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api', globalLimiter);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/csrf', issueToken);
app.use('/api', csrfProtection);

app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalog'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/orders', ordersModule.router);
app.use('/api', require('./routes/misc'));
app.use('/api', notFound);

const root = path.join(__dirname, '..');
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three', 'build'), { maxAge: '7d' }));
app.use(express.static(path.join(root, 'public'), { maxAge: config.isProd ? '1h' : 0, index: 'index.html' }));

app.use(errorHandler);

// On Vercel the app is exported as a serverless handler (api/index.js); locally/VPS it listens on a port.
if (require.main === module) {
  const server = app.listen(config.PORT, () => {
    console.log(`Aurelle running on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  });
  const shutdown = () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e && e.message));

module.exports = app;
