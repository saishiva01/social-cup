/**
 * DTOs for the Phase 5 redemption/barista API surface (PRD Module 8). See
 * docs/architecture/redemption.md for the concurrency design these shapes
 * sit on top of.
 */
export type RedemptionCodeStatus = 'pending' | 'redeemed' | 'expired' | 'canceled';

/** data payload of POST /api/v1/redemptions — shown once, never re-fetchable. */
export interface CreateRedemptionResult {
  id: string;
  cafeId: string;
  cafeName: string;
  drinkId: string;
  drinkName: string;
  /** The primary code, formatted for display (e.g. "XXXX-XXXX-XXXX"). Present only in this response. */
  code: string;
  /** The six-digit fallback (PRD Module 8), for when a camera can't read the primary code. */
  backupCode: string;
  creditCost: number;
  expiresAt: string;
}

/** data payload of GET /api/v1/redemptions/:id — the member polls this while waiting on the barista. */
export interface RedemptionStatusResult {
  id: string;
  status: RedemptionCodeStatus;
  cafeName: string;
  drinkName: string;
  creditCost: number;
  expiresAt: string;
  redeemedAt: string | null;
}

/** data payload of POST /api/v1/barista/authenticate */
export interface BaristaAuthResult {
  cafeId: string;
  cafeName: string;
  /** Seconds until the trusted-device cookie expires — UI convenience only, the server re-checks on every call. */
  trustedForSeconds: number;
}

/** data payload of POST /api/v1/barista/redeem — the barista's green screen (PRD Module 8). */
export interface BaristaRedeemResult {
  memberFirstName: string;
  memberPhotoUrl: string | null;
  drinkName: string;
  creditsDeducted: number;
  redeemedAt: string;
}

/** One row of GET /api/v1/barista/today. */
export interface BaristaTodayItem {
  id: string;
  memberFirstName: string;
  drinkName: string;
  creditsDeducted: number;
  redeemedAt: string;
}
