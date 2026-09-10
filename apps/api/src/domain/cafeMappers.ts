import type { schema } from '@social-cup/database';
import type { Cafe, Drink, WeeklyHours } from '@social-cup/types';

import type { RatingAggregate } from './ratingAggregates.js';

type CafeRow = typeof schema.cafes.$inferSelect;
type DrinkRow = typeof schema.drinks.$inferSelect;

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Dallas is a single timezone (America/Chicago), so "open now" is computed
 * server-side from the stored per-weekday hours rather than trusting the
 * client's clock/timezone. Returns null only if the current time genuinely
 * can't be read (never expected in practice) — never a false positive/negative.
 */
export function computeIsOpenNow(hours: WeeklyHours): boolean | null {
  const parts = WEEKDAY_FORMATTER.formatToParts(new Date());
  const weekday = parts
    .find((part) => part.type === 'weekday')
    ?.value.toLowerCase()
    .slice(0, 3);
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  if (!weekday || hour === undefined || minute === undefined) return null;

  const today = hours[weekday as keyof WeeklyHours];
  if (!today) return false;

  const nowMinutes = Number(hour) * 60 + Number(minute);
  const [openHour, openMinute] = today.open.split(':').map(Number) as [number, number];
  const [closeHour, closeMinute] = today.close.split(':').map(Number) as [number, number];
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

/** The full cafe detail shape sent to clients — numeric columns come back as strings from Drizzle. */
export function toCafe(row: CafeRow): Cafe {
  const hours = row.hours as WeeklyHours;
  return {
    id: row.id,
    name: row.name,
    perkLine: row.perkLine,
    neighborhood: row.neighborhood,
    address: row.address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    photos: row.photos as string[],
    vibeTags: row.vibeTags as string[],
    hours,
    featured: row.featured,
    isOpenNow: computeIsOpenNow(hours),
  };
}

export function toDrink(row: DrinkRow, aggregate: RatingAggregate): Drink {
  return {
    id: row.id,
    cafeId: row.cafeId,
    name: row.name,
    description: row.description,
    category: row.category,
    photoUrl: row.photoUrl,
    retailPriceCents: row.retailPriceCents,
    creditPrice: row.creditPrice,
    signature: row.signature,
    averageRating: aggregate.averageRating,
    ratingCount: aggregate.ratingCount,
  };
}
