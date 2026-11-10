require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

const ingredients = [
  { name: 'Argan Oil', benefit: 'Deep moisture and a glass-like shine without weight.', icon: '🌰' },
  { name: 'Keratin Peptides', benefit: 'Fills gaps in damaged strands for visible repair.', icon: '🧬' },
  { name: 'Vitamin E', benefit: 'Antioxidant shield against heat and pollution.', icon: '🍃' },
  { name: 'Rosemary Extract', benefit: 'Wakes up the scalp and supports healthy growth.', icon: '🌿' },
  { name: 'Black Seed Oil', benefit: 'Calms the scalp and strengthens roots.', icon: '🖤' },
  { name: 'Hyaluronic Acid', benefit: 'Locks hydration into every strand.', icon: '💧' },
];

const products = [
  {
    slug: 'midnight-repair',
    name: 'Midnight Repair',
    tagline: 'Overnight repair serum for damaged, frizzy hair.',
    description:
      'A silky night-ritual serum that rebuilds the hair fibre while you sleep. Wake up to smoother, stronger, shinier hair.',
    priceMinor: 79900, sizeMl: 50, type: 'Repair', accent: 'amber', stock: 120,
    ing: ['Argan Oil', 'Keratin Peptides', 'Vitamin E'],
  },
  {
    slug: 'golden-gloss',
    name: 'Golden Gloss',
    tagline: 'Featherlight shine serum for a mirror finish.',
    description:
      'Heat-protective, non-greasy gloss that tames flyaways and gives instant luminous shine that lasts all day.',
    priceMinor: 64900, sizeMl: 50, type: 'Shine', accent: 'gold', stock: 150,
    ing: ['Argan Oil', 'Vitamin E', 'Hyaluronic Acid'],
  },
  {
    slug: 'emerald-root',
    name: 'Emerald Root',
    tagline: 'Scalp and root serum for stronger, fuller hair.',
    description:
      'A botanical root-activating serum with rosemary and black seed oil to reduce shedding and support density.',
    priceMinor: 89900, sizeMl: 60, type: 'Growth', accent: 'emerald', stock: 90,
    ing: ['Rosemary Extract', 'Black Seed Oil', 'Keratin Peptides'],
  },
];

const reviews = [
  ['midnight-repair', 5, 'Frizz is gone', 'Two weeks in and my hair feels like silk. The night ritual is addictive.', 'Ananya R.'],
  ['midnight-repair', 4, 'Smells amazing', 'Light, not sticky, and the shine is real. Would love a bigger bottle.', 'Kabir S.'],
  ['golden-gloss', 5, 'Instant glow', 'Two drops before styling and everyone asks what I did.', 'Meera T.'],
  ['golden-gloss', 5, 'Heat protection win', 'No more crispy ends after blow-drying.', 'Isha P.'],
  ['emerald-root', 4, 'Less shedding', 'Noticed less hair in the brush after a month.', 'Rohan M.'],
  ['emerald-root', 5, 'Scalp feels fresh', 'Tingly in the best way. Staying on this for good.', 'Sana K.'],
];

// Sample data only - replace with real store partners.
const stores = [
  ['Aurelle Studio - Connaught Place', 'New Delhi', 'Block F, Connaught Place', '110001'],
  ['Aurelle Studio - Khan Market', 'New Delhi', 'Middle Lane, Khan Market', '110003'],
  ['Aurelle Studio - Colaba', 'Mumbai', 'Colaba Causeway', '400001'],
  ['Aurelle Studio - Bandra', 'Mumbai', 'Linking Road, Bandra West', '400050'],
  ['Aurelle Studio - MG Road', 'Bengaluru', 'MG Road', '560001'],
  ['Aurelle Studio - Park Street', 'Kolkata', 'Park Street', '700016'],
  ['Aurelle Studio - T Nagar', 'Chennai', 'Usman Road, T Nagar', '600017'],
  ['Aurelle Studio - C-Scheme', 'Jaipur', 'Ashok Marg, C-Scheme', '302001'],
];

async function main() {
  for (const i of ingredients) {
    await prisma.ingredient.upsert({ where: { name: i.name }, update: i, create: i });
  }
  const ingRows = await prisma.ingredient.findMany();
  const ingId = Object.fromEntries(ingRows.map((r) => [r.name, r.id]));

  for (const p of products) {
    const { ing, ...data } = p;
    const { stock, ...updateData } = data; // keep live stock on re-seed
    const row = await prisma.product.upsert({ where: { slug: p.slug }, update: updateData, create: data });
    await prisma.productIngredient.deleteMany({ where: { productId: row.id } });
    await prisma.productIngredient.createMany({
      data: ing.map((n) => ({ productId: row.id, ingredientId: ingId[n] })),
    });
  }

  if ((await prisma.review.count()) === 0) {
    const prod = Object.fromEntries((await prisma.product.findMany()).map((p) => [p.slug, p.id]));
    await prisma.review.createMany({
      data: reviews.map(([slug, rating, title, body, authorName]) => ({
        productId: prod[slug], rating, title, body, authorName,
      })),
    });
  }

  if ((await prisma.store.count()) === 0) {
    await prisma.store.createMany({
      data: stores.map(([name, city, address, pincode]) => ({ name, city, address, pincode })),
    });
  }

  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
    await prisma.user.upsert({
      where: { email: ADMIN_EMAIL.toLowerCase() },
      update: { role: 'ADMIN' },
      create: { email: ADMIN_EMAIL.toLowerCase(), name: 'Admin', passwordHash, role: 'ADMIN' },
    });
    console.log('Admin user ready:', ADMIN_EMAIL);
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
