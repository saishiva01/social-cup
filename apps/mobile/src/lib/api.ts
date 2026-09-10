import type {
  AuthTokens,
  BillingPortalResult,
  CafeDetail,
  CafeListItem,
  CreateRedemptionResult,
  DiaryEntry,
  LoginResult,
  MembershipStatusResult,
  PaginatedResult,
  PublicUser,
  Rating,
  RedemptionStatusResult,
  RegisterResult,
  ResetPasswordResult,
  SignatureDrinkListItem,
  StartSubscriptionResult,
  UpdateProfileInput,
  VerifyEmailResult,
} from '@social-cup/types';

/** Inlined at build time by Expo — never put a secret behind EXPO_PUBLIC_. */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientDeps {
  /** Current in-memory access token (null when signed out). */
  getAccessToken: () => string | null;
  /**
   * Rotates the refresh token and updates the auth state. Called when a
   * request comes back 401; the provider single-flights this so parallel
   * requests trigger exactly one rotation (refresh-token reuse is treated
   * as theft server-side and revokes the whole chain — see
   * docs/architecture/authentication.md).
   */
  refreshSession: () => Promise<void>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
}

/**
 * Thin typed wrapper over the Social Cup REST API (docs/architecture/system-architecture.md).
 * Response/error shapes come from the shared @social-cup/types package; the
 * server's `{ success, data }` envelope is unwrapped so callers get `data`
 * directly or an ApiError.
 */
export class ApiClient {
  constructor(private readonly deps: ApiClientDeps) {}

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, auth = false, retryOnUnauthorized = true } = options;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
      const accessToken = this.deps.getAccessToken();
      if (!accessToken) throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && auth && retryOnUnauthorized) {
      // Expired access token — rotate the refresh token once, then retry.
      await this.deps.refreshSession();
      return this.request<T>(path, { ...options, retryOnUnauthorized: false });
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string; details?: Record<string, string[]> };
      } | null;
      throw new ApiError(
        response.status,
        payload?.error?.code ?? 'REQUEST_FAILED',
        payload?.error?.message ?? 'Request failed',
        payload?.error?.details,
      );
    }

    // 204 No Content (logout) has no body.
    if (response.status === 204) return undefined as T;

    const payload = (await response.json()) as { data: T };
    return payload.data;
  }

  login(email: string, password: string): Promise<LoginResult> {
    return this.request('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  }

  register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<RegisterResult> {
    return this.request('/api/v1/auth/register', { method: 'POST', body: input });
  }

  verifyEmail(token: string): Promise<VerifyEmailResult> {
    return this.request('/api/v1/auth/verify-email', { method: 'POST', body: { token } });
  }

  resendVerification(email: string): Promise<{ message: string }> {
    return this.request('/api/v1/auth/resend-verification', { method: 'POST', body: { email } });
  }

  forgotPassword(email: string): Promise<{ message: string }> {
    return this.request('/api/v1/auth/forgot-password', { method: 'POST', body: { email } });
  }

  resetPassword(token: string, password: string): Promise<ResetPasswordResult> {
    return this.request('/api/v1/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    });
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return this.request('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken } });
  }

  /** Logout needs no access token — the refresh token revokes the chain. */
  logout(refreshToken: string): Promise<void> {
    return this.request('/api/v1/auth/logout', { method: 'POST', body: { refreshToken } });
  }

  getMe(): Promise<PublicUser> {
    return this.request('/api/v1/me', { auth: true });
  }

  updateMe(fields: UpdateProfileInput): Promise<PublicUser> {
    return this.request('/api/v1/me', { method: 'PATCH', body: fields, auth: true });
  }

  getCafes(params: {
    search?: string;
    neighborhood?: string;
    lat?: number;
    lng?: number;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<CafeListItem>> {
    return this.request(`/api/v1/cafes${toQueryString(params)}`, { auth: true });
  }

  getFeaturedCafes(params: { lat?: number; lng?: number }): Promise<CafeListItem[]> {
    return this.request(`/api/v1/cafes/featured${toQueryString(params)}`, { auth: true });
  }

  getSignatureDrinks(): Promise<SignatureDrinkListItem[]> {
    return this.request('/api/v1/cafes/signature-drinks', { auth: true });
  }

  getNeighborhoods(): Promise<string[]> {
    return this.request('/api/v1/cafes/neighborhoods', { auth: true });
  }

  getCafeDetail(id: string): Promise<CafeDetail> {
    return this.request(`/api/v1/cafes/${id}`, { auth: true });
  }

  getMyRating(drinkId: string): Promise<Rating | null> {
    return this.request(`/api/v1/drinks/${drinkId}/rating`, { auth: true });
  }

  rateDrink(drinkId: string, input: { stars: number; note: string | null }): Promise<Rating> {
    return this.request(`/api/v1/drinks/${drinkId}/rating`, {
      method: 'PUT',
      body: input,
      auth: true,
    });
  }

  getDiary(params: { page?: number; pageSize?: number }): Promise<PaginatedResult<DiaryEntry>> {
    return this.request(`/api/v1/me/ratings${toQueryString(params)}`, { auth: true });
  }

  getMembership(): Promise<MembershipStatusResult> {
    return this.request('/api/v1/membership', { auth: true });
  }

  subscribeMembership(): Promise<StartSubscriptionResult> {
    return this.request('/api/v1/membership/subscribe', { method: 'POST', auth: true });
  }

  createBillingPortalSession(): Promise<BillingPortalResult> {
    return this.request('/api/v1/membership/billing-portal', { method: 'POST', auth: true });
  }

  /** PRD Module 8: creates the five-minute redemption code. Only reachable for an active Member (server-enforced, not just UI). */
  createRedemption(cafeId: string, drinkId: string): Promise<CreateRedemptionResult> {
    return this.request('/api/v1/redemptions', {
      method: 'POST',
      body: { cafeId, drinkId },
      auth: true,
    });
  }

  /** Polled while the member waits for the barista to scan the code — the server's status is the only source of truth. */
  getRedemptionStatus(redemptionId: string): Promise<RedemptionStatusResult> {
    return this.request(`/api/v1/redemptions/${redemptionId}`, { auth: true });
  }
}

/** Builds a `?key=value&...` query string, dropping undefined/empty values. */
function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
