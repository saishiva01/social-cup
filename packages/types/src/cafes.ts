/**
 * DTOs for the cafe discovery API surface (PRD Modules 3, 4, and the
 * discovery-relevant slice of Module 9). Wire types only.
 *
 * `creditPriceCents`/`creditPrice` are display-only numbers (ADR-0009: 1
 * credit = $1 fixed) — nothing here represents a member's balance or a
 * redemption; that's Module 7/8, a separate, later API surface.
 */

export interface OpeningHours {
  open: string;
  close: string;
}

/** Keyed by lowercase three-letter weekday (mon..sun); a missing/null day is closed. */
export type WeeklyHours = Partial<
  Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', OpeningHours | null>
>;

export interface Drink {
  id: string;
  cafeId: string;
  name: string;
  description: string | null;
  category: string | null;
  photoUrl: string | null;
  retailPriceCents: number;
  creditPrice: number;
  signature: boolean;
  /** Server-derived from ratings (PRD Module 5) — null when the drink has no ratings yet. */
  averageRating: number | null;
  ratingCount: number;
}

/** Card-shaped summary for the full cafe list and curated strips. */
export interface CafeListItem {
  id: string;
  name: string;
  neighborhood: string;
  coverPhotoUrl: string | null;
  vibeTags: string[];
  lowestCreditPrice: number | null;
  featured: boolean;
  /** Distance in miles from the request's lat/lng, when provided. */
  distanceMiles: number | null;
  /**
   * A cafe's rating is the average of all ratings across its drinks (PRD
   * Module 5). Null, and `isNew` true, when none of its drinks are rated.
   */
  averageRating: number | null;
  ratingCount: number;
  isNew: boolean;
}

export interface Cafe {
  id: string;
  name: string;
  perkLine: string | null;
  neighborhood: string;
  address: string;
  latitude: number;
  longitude: number;
  photos: string[];
  vibeTags: string[];
  hours: WeeklyHours;
  featured: boolean;
  /** Computed server-side from `hours` and the current time in America/Chicago. */
  isOpenNow: boolean | null;
}

export interface CafeDetail {
  cafe: Cafe;
  drinks: Drink[];
}

/** Signature-drinks strip item — carries enough cafe context to navigate. */
export interface SignatureDrinkListItem extends Drink {
  cafeName: string;
}
