require('dotenv').config();
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 chars'),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}

const env = parsed.data;
const isProd = env.NODE_ENV === 'production';

if (isProd && /replace_me/.test(env.JWT_ACCESS_SECRET + env.COOKIE_SECRET)) {
  console.error('Refusing to start in production with placeholder secrets.');
  process.exit(1);
}

module.exports = {
  ...env,
  isProd,
  cookieBase: { httpOnly: true, secure: isProd, sameSite: 'strict' },
  ACCESS_TTL_SEC: 15 * 60,
  REFRESH_TTL_SEC: 7 * 24 * 60 * 60,
};
