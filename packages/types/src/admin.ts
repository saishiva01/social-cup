/**
 * DTOs for the Phase 6 admin API surface (PRD Module 9). Every value here is
 * only ever returned to a caller who has already passed `requireAdmin` — see
 * apps/api/src/middleware/requireAdmin.ts. Money is always integer cents,
 * never a float (root CLAUDE.md financial rules).
 */
import type { Cafe, WeeklyHours } from './cafes.js';
import type { MembershipStatus } from './membership.js';

export type AdminRole = 'user' | 'admin';

export interface AdminCafeListItem {
  id: string;
  name: string;
  neighborhood: string;
  featured: boolean;
  payoutRateCents: number | null;
  pinIsSet: boolean;
  drinkCount: number;
  updatedAt: string;
}

/** Fields an admin may set when creating or editing a cafe (PRD Module 9). */
export interface AdminCafeInput {
  name: string;
  perkLine?: string | null;
  neighborhood: string;
  address: string;
  latitude: number;
  longitude: number;
  photos?: string[];
  vibeTags?: string[];
  hours?: WeeklyHours;
  featured?: boolean;
}

export interface AdminCafeDetail {
  cafe: Cafe;
  payoutRateCents: number | null;
  pinIsSet: boolean;
  drinks: AdminDrink[];
}

export interface AdminDrink {
  id: string;
  cafeId: string;
  name: string;
  description: string | null;
  category: string | null;
  photoUrl: string | null;
  retailPriceCents: number;
  creditPrice: number;
  signature: boolean;
  isActive: boolean;
  updatedAt: string;
}

export interface AdminDrinkInput {
  name: string;
  description?: string | null;
  category?: string | null;
  photoUrl?: string | null;
  retailPriceCents: number;
  creditPrice: number;
  signature?: boolean;
  isActive?: boolean;
}

/** data payload of PUT /admin/cafes/:id/barista-pin — never the hash, never the raw PIN. */
export interface SetBaristaPinResult {
  cafeId: string;
  pinVersion: number;
}

export interface AdminMemberListItem {
  id: string;
  email: string;
  displayName: string;
  neighborhood: string | null;
  emailVerified: boolean;
  deactivatedAt: string | null;
  membershipStatus: MembershipStatus | 'visitor';
  credits: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export interface AdminMemberRedemptionSummary {
  id: string;
  cafeName: string;
  drinkName: string;
  creditAmount: number;
  redeemedAt: string;
  voided: boolean;
}

export interface AdminMemberDetail extends AdminMemberListItem {
  recentRedemptions: AdminMemberRedemptionSummary[];
}

export interface AdminRedemptionListItem {
  id: string;
  memberId: string;
  memberDisplayName: string;
  memberEmail: string;
  cafeId: string;
  cafeName: string;
  drinkId: string;
  drinkName: string;
  creditAmount: number;
  payoutRateCents: number;
  payoutAmountCents: number;
  redeemedAt: string;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
}

/** data payload of POST /admin/redemptions/:id/void */
export interface VoidRedemptionResult {
  redemptionId: string;
  voidedAt: string;
  reason: string;
  compensatingCreditAmount: number;
}

export type PayoutPaymentStatus = 'unpaid' | 'partially_recorded' | 'recorded';

export interface PayoutPeriodSummaryItem {
  cafeId: string;
  cafeName: string;
  redemptionCount: number;
  totalCredits: number;
  amountOwedCents: number;
  amountRecordedCents: number;
  paymentStatus: PayoutPaymentStatus;
}

export interface PayoutStatementRow {
  redemptionId: string;
  memberDisplayName: string;
  drinkName: string;
  creditAmount: number;
  payoutRateCents: number;
  payoutAmountCents: number;
  redeemedAt: string;
}

export interface PayoutPaymentRecord {
  id: string;
  cafeId: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  reference: string | null;
  recordedByAdminEmail: string;
  recordedAt: string;
}

export interface PayoutStatement {
  cafeId: string;
  cafeName: string;
  periodStart: string;
  periodEnd: string;
  redemptions: PayoutStatementRow[];
  totals: { redemptionCount: number; totalCredits: number; totalAmountOwedCents: number };
  payments: PayoutPaymentRecord[];
  totalRecordedCents: number;
}

/** data payload of POST /admin/payouts/:cafeId/payments */
export type RecordPayoutPaymentResult = PayoutPaymentRecord;

/**
 * A single address-lookup suggestion (PRD Module 9 admin address autofill).
 * `source` is always surfaced to the caller so the admin UI can visibly mark
 * a mock suggestion as such — see docs/architecture/address-lookup.md. Real
 * Google Places integration is deferred; when built, `source` becomes
 * `'google_places'` for those results with no shape change.
 */
export interface AddressSuggestion {
  id: string;
  description: string;
  address: string;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  source: 'mock' | 'google_places';
}

/** data payload of GET /admin/dashboard (PRD Module 9 Dashboard). */
export interface AdminDashboardSummary {
  totalMembers: number;
  activeCafes: number;
  redemptionsThisMonth: number;
  creditsRedeemedThisMonth: number;
  totalOwedToCafesThisMonthCents: number;
  totalMarginThisMonthCents: number;
}
