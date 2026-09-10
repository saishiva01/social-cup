// Must run before createDatabase() reads process.env below — nothing else
// in this CLI entrypoint loads packages/database/.env automatically.
import 'dotenv/config';

import bcrypt from 'bcrypt';

import { createDatabase } from './client.js';
import { cafeBaristaCredentials } from './schema/barista.js';
import { cafes, drinks } from './schema/cafes.js';
import { users } from './schema/users.js';

// Same cost factor as apps/api/src/lib/password.ts — kept independent here
// (packages/database cannot depend on apps/api) rather than shared, since
// this is a one-off dev-seed concern, not application business logic.
const PIN_SALT_ROUNDS = 12;

/**
 * Development-only cafe PIN (PRD Module 8) and payout rate (Module 7.5).
 * Real values are set per cafe through Module 9's admin panel (Phase 6,
 * not yet built) — see docs/decisions/open-questions.md. Without a seeded
 * row here, a cafe cannot authenticate a barista device or have a
 * redemption created against it (apps/api/src/services/redemptionService.ts
 * treats a missing/null payout rate as "not yet set up for redemption").
 */
const DEV_BARISTA_PIN = '1234';
const DEV_PAYOUT_RATE_CENTS = 70;

/**
 * Development-only admin account (Phase 6, PRD Module 9). Real admin access
 * is granted by promoting an already-registered account's `role` to
 * `'admin'` (see `docs/architecture/admin-authorization.md`) — this seeded
 * account exists purely so the admin panel has something to log into
 * locally without that manual step. Never reused as a real credential
 * anywhere outside a developer's own machine.
 */
const DEV_ADMIN_EMAIL = 'admin@socialcup.dev';
const DEV_ADMIN_PASSWORD = 'AdminPass123!';

/**
 * Development seed data for cafe discovery (PRD Modules 3/4). This is
 * **not** production data — Social Cup's real partner cafes are added
 * through the admin panel (Module 9, a later phase). This script exists so
 * discovery has believable content to show before that admin CRUD exists.
 * Refuses to run against a production database as a safety rail.
 *
 * Photos are a small, centralized list of royalty-free Unsplash photos —
 * the only place in the codebase an image URL is written by hand. Every
 * screen just renders whatever URL the API returns.
 */

const PHOTOS = {
  espresso: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&q=80',
  latteArt: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=1200&q=80',
  coldBrew: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=1200&q=80',
  interior: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&q=80',
  counter: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=1200&q=80',
  pourOver: 'https://images.unsplash.com/photo-1442550528053-c431ecb55509?w=1200&q=80',
  pastry: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80',
  matcha: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=1200&q=80',
  cup: 'https://images.unsplash.com/photo-1495774856032-8b90bbb32b32?w=1200&q=80',
} as const;

interface SeedDrink {
  name: string;
  description: string;
  category: string;
  photoUrl: string;
  retailPriceCents: number;
  creditPrice: number;
  signature?: boolean;
}

interface SeedCafe {
  name: string;
  perkLine: string;
  neighborhood: string;
  address: string;
  latitude: string;
  longitude: string;
  photos: string[];
  vibeTags: string[];
  hours: Record<string, { open: string; close: string } | null>;
  featured?: boolean;
  drinks: SeedDrink[];
}

const WEEKDAY_HOURS = { open: '07:00', close: '18:00' };
const WEEKEND_HOURS = { open: '08:00', close: '15:00' };
const STANDARD_WEEK = {
  mon: WEEKDAY_HOURS,
  tue: WEEKDAY_HOURS,
  wed: WEEKDAY_HOURS,
  thu: WEEKDAY_HOURS,
  fri: WEEKDAY_HOURS,
  sat: WEEKEND_HOURS,
  sun: WEEKEND_HOURS,
};

const SEED_CAFES: SeedCafe[] = [
  {
    name: 'Blackwood Roasting Co.',
    perkLine: 'Small-batch roaster with a walk-up window on Bishop Ave.',
    neighborhood: 'Bishop Arts District',
    address: '408 N Bishop Ave, Dallas, TX 75208',
    latitude: '32.7477',
    longitude: '-96.8288',
    photos: [PHOTOS.interior, PHOTOS.espresso, PHOTOS.counter],
    vibeTags: ['Good for remote work', 'Locally roasted', 'Quiet mornings'],
    hours: STANDARD_WEEK,
    featured: true,
    drinks: [
      {
        name: 'Blackwood Signature Espresso',
        description: 'Their house blend, pulled short and syrupy.',
        category: 'espresso',
        photoUrl: PHOTOS.espresso,
        retailPriceCents: 400,
        creditPrice: 4,
        signature: true,
      },
      {
        name: 'Oat Milk Cortado',
        description: 'Equal parts espresso and steamed oat milk.',
        category: 'espresso',
        photoUrl: PHOTOS.latteArt,
        retailPriceCents: 500,
        creditPrice: 5,
      },
      {
        name: 'Nitro Cold Brew',
        description: 'Cascading, slightly sweet, served on tap.',
        category: 'cold_brew',
        photoUrl: PHOTOS.coldBrew,
        retailPriceCents: 550,
        creditPrice: 5,
      },
      {
        name: 'Honey Lavender Latte',
        description: 'House espresso, steamed milk, local honey and lavender.',
        category: 'latte',
        photoUrl: PHOTOS.latteArt,
        retailPriceCents: 600,
        creditPrice: 6,
      },
    ],
  },
  {
    name: 'Deep Ellum Drip House',
    perkLine: 'Pour-overs and vinyl on rotation, open late on weekends.',
    neighborhood: 'Deep Ellum',
    address: '2823 Main St, Dallas, TX 75226',
    latitude: '32.7847',
    longitude: '-96.7803',
    photos: [PHOTOS.pourOver, PHOTOS.interior],
    vibeTags: ['Live music nearby', 'Good for dates', 'Late hours'],
    hours: {
      ...STANDARD_WEEK,
      fri: { open: '07:00', close: '22:00' },
      sat: { open: '08:00', close: '22:00' },
    },
    drinks: [
      {
        name: 'Ethiopia Yirgacheffe Pour Over',
        description: 'Bright, floral, single-origin — brewed to order.',
        category: 'pour_over',
        photoUrl: PHOTOS.pourOver,
        retailPriceCents: 550,
        creditPrice: 5,
        signature: true,
      },
      {
        name: 'Classic Cappuccino',
        description: 'Double shot, microfoam, no flavoring needed.',
        category: 'espresso',
        photoUrl: PHOTOS.latteArt,
        retailPriceCents: 450,
        creditPrice: 4,
      },
      {
        name: 'Cold Brew Tonic',
        description: 'Cold brew concentrate topped with tonic water and citrus.',
        category: 'cold_brew',
        photoUrl: PHOTOS.coldBrew,
        retailPriceCents: 575,
        creditPrice: 5,
      },
    ],
  },
  {
    name: 'Knox Street Coffee Bar',
    perkLine: 'Neighborhood regulars, natural light, dog-friendly patio.',
    neighborhood: 'Knox-Henderson',
    address: '3211 Knox St, Dallas, TX 75205',
    latitude: '32.8218',
    longitude: '-96.7897',
    photos: [PHOTOS.counter, PHOTOS.pastry],
    vibeTags: ['Dog friendly', 'Patio seating', 'Good for remote work'],
    hours: STANDARD_WEEK,
    featured: true,
    drinks: [
      {
        name: 'Vanilla Bean Latte',
        description: 'Real vanilla bean paste, not syrup.',
        category: 'latte',
        photoUrl: PHOTOS.latteArt,
        retailPriceCents: 525,
        creditPrice: 5,
      },
      {
        name: 'Iced Matcha Latte',
        description: 'Ceremonial-grade matcha whisked with oat milk.',
        category: 'matcha',
        photoUrl: PHOTOS.matcha,
        retailPriceCents: 550,
        creditPrice: 5,
        signature: true,
      },
      {
        name: 'Americano',
        description: 'Double shot over hot water.',
        category: 'espresso',
        photoUrl: PHOTOS.espresso,
        retailPriceCents: 350,
        creditPrice: 3,
      },
    ],
  },
  {
    name: 'Uptown Press',
    perkLine: 'Fast counter service for the morning commute.',
    neighborhood: 'Uptown',
    address: '2727 McKinney Ave, Dallas, TX 75204',
    latitude: '32.8014',
    longitude: '-96.8003',
    photos: [PHOTOS.cup, PHOTOS.counter],
    vibeTags: ['Fast service', 'Good for a quick stop'],
    hours: { ...STANDARD_WEEK, sun: null },
    drinks: [
      {
        name: 'Drip Coffee',
        description: 'Fresh-brewed, rotating single-origin.',
        category: 'drip',
        photoUrl: PHOTOS.cup,
        retailPriceCents: 300,
        creditPrice: 3,
      },
      {
        name: 'Caramel Macchiato',
        description: 'Vanilla, steamed milk, espresso, caramel drizzle.',
        category: 'espresso',
        photoUrl: PHOTOS.latteArt,
        retailPriceCents: 550,
        creditPrice: 5,
      },
      {
        name: 'Cold Brew',
        description: 'Steeped 18 hours, served over ice.',
        category: 'cold_brew',
        photoUrl: PHOTOS.coldBrew,
        retailPriceCents: 450,
        creditPrice: 4,
      },
    ],
  },
  {
    name: 'Trinity Groves Roasters',
    perkLine: 'Warehouse-style roastery with weekend cupping sessions.',
    neighborhood: 'Trinity Groves',
    address: '3011 Gulden Ln, Dallas, TX 75212',
    latitude: '32.7746',
    longitude: '-96.8393',
    photos: [PHOTOS.interior, PHOTOS.espresso, PHOTOS.pourOver],
    vibeTags: ['Locally roasted', 'Good for groups'],
    hours: STANDARD_WEEK,
    drinks: [
      {
        name: 'Single-Origin Espresso',
        description: 'Rotating single-origin, pulled as espresso.',
        category: 'espresso',
        photoUrl: PHOTOS.espresso,
        retailPriceCents: 400,
        creditPrice: 4,
      },
      {
        name: 'Flat White',
        description: 'Ristretto shots, velvety steamed milk.',
        category: 'espresso',
        photoUrl: PHOTOS.latteArt,
        retailPriceCents: 500,
        creditPrice: 5,
      },
    ],
  },
  {
    name: 'Lakewood Corner Cafe',
    perkLine: 'A quiet corner spot near the lake trail.',
    neighborhood: 'Lakewood',
    address: '1900 Abrams Rd, Dallas, TX 75214',
    latitude: '32.8129',
    longitude: '-96.7583',
    photos: [PHOTOS.pastry, PHOTOS.cup],
    vibeTags: ['Quiet mornings', 'Good for reading'],
    hours: STANDARD_WEEK,
    drinks: [
      {
        name: 'Chai Latte',
        description: 'House-spiced chai concentrate, steamed milk.',
        category: 'tea',
        photoUrl: PHOTOS.cup,
        retailPriceCents: 500,
        creditPrice: 5,
      },
      {
        name: 'Mocha',
        description: 'Espresso, steamed milk, dark chocolate.',
        category: 'espresso',
        photoUrl: PHOTOS.latteArt,
        retailPriceCents: 550,
        creditPrice: 5,
      },
      {
        name: 'Cortado',
        description: 'Equal parts espresso and warm milk.',
        category: 'espresso',
        photoUrl: PHOTOS.espresso,
        retailPriceCents: 450,
        creditPrice: 4,
      },
    ],
  },
];

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run development seed data against a production environment.');
  }

  const { db, close } = createDatabase();
  try {
    console.log('Clearing existing cafe/drink seed data...');
    await db.delete(cafes);

    console.log(`Inserting ${SEED_CAFES.length} cafes...`);
    const pinHash = await bcrypt.hash(DEV_BARISTA_PIN, PIN_SALT_ROUNDS);

    for (const seedCafe of SEED_CAFES) {
      const [insertedCafe] = await db
        .insert(cafes)
        .values({
          name: seedCafe.name,
          perkLine: seedCafe.perkLine,
          neighborhood: seedCafe.neighborhood,
          address: seedCafe.address,
          latitude: seedCafe.latitude,
          longitude: seedCafe.longitude,
          photos: seedCafe.photos,
          vibeTags: seedCafe.vibeTags,
          hours: seedCafe.hours,
          featured: seedCafe.featured ?? false,
        })
        .returning();

      if (!insertedCafe) continue;

      await db.insert(drinks).values(
        seedCafe.drinks.map((drink) => ({
          cafeId: insertedCafe.id,
          name: drink.name,
          description: drink.description,
          category: drink.category,
          photoUrl: drink.photoUrl,
          retailPriceCents: drink.retailPriceCents,
          creditPrice: drink.creditPrice,
          signature: drink.signature ?? false,
        })),
      );

      await db.insert(cafeBaristaCredentials).values({
        cafeId: insertedCafe.id,
        pinHash,
        payoutRateCents: DEV_PAYOUT_RATE_CENTS,
      });
    }

    console.log('Upserting development admin account...');
    const adminPasswordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, PIN_SALT_ROUNDS);
    await db
      .insert(users)
      .values({
        email: DEV_ADMIN_EMAIL,
        passwordHash: adminPasswordHash,
        displayName: 'Social Cup Admin',
        role: 'admin',
        emailVerifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash: adminPasswordHash, role: 'admin', emailVerifiedAt: new Date() },
      });

    console.log(`Seed complete. Barista PIN for every seeded cafe: ${DEV_BARISTA_PIN}`);
    console.log(`Dev admin login: ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}`);
  } finally {
    await close();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
