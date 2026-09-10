import type {
  AddressSuggestion,
  AdminCafeDetail,
  AdminCafeInput,
  AdminCafeListItem,
  AdminDashboardSummary,
  AdminDrink,
  AdminDrinkInput,
  AdminMemberDetail,
  AdminMemberListItem,
  AdminRedemptionListItem,
  AuthTokens,
  LoginResult,
  PaginatedResult,
  PayoutPeriodSummaryItem,
  PayoutStatement,
  PublicUser,
  RecordPayoutPaymentResult,
  SetBaristaPinResult,
  VoidRedemptionResult,
} from '@social-cup/types';

/** Inlined at build time by Vite — never put a secret behind VITE_. */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
  getAccessToken: () => string | null;
  refreshSession: () => Promise<void>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
}

/** Same shape/behavior as apps/mobile/src/lib/api.ts's client, adapted for the admin surface. */
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

    if (response.status === 204) return undefined as T;
    const payload = (await response.json()) as { data: T };
    return payload.data;
  }

  /** GET-with-Authorization-header download — a plain <a href> can't carry a Bearer token. Returns a Blob and the server-provided filename. */
  private async download(path: string): Promise<{ blob: Blob; filename: string }> {
    const accessToken = this.deps.getAccessToken();
    if (!accessToken) throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');

    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
      await this.deps.refreshSession();
      return this.download(path);
    }
    if (!response.ok) {
      throw new ApiError(response.status, 'REQUEST_FAILED', 'Download failed');
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    return { blob: await response.blob(), filename: match?.[1] ?? 'download.csv' };
  }

  login(email: string, password: string): Promise<LoginResult> {
    return this.request('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return this.request('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken } });
  }

  logout(refreshToken: string): Promise<void> {
    return this.request('/api/v1/auth/logout', { method: 'POST', body: { refreshToken } });
  }

  getMe(): Promise<PublicUser> {
    return this.request('/api/v1/me', { auth: true });
  }

  getDashboardSummary(): Promise<AdminDashboardSummary> {
    return this.request('/api/v1/admin/dashboard', { auth: true });
  }

  getCafes(params: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<PaginatedResult<AdminCafeListItem>> {
    return this.request(`/api/v1/admin/cafes${toQueryString(params)}`, { auth: true });
  }

  getCafe(id: string): Promise<AdminCafeDetail> {
    return this.request(`/api/v1/admin/cafes/${id}`, { auth: true });
  }

  createCafe(input: AdminCafeInput): Promise<AdminCafeDetail> {
    return this.request('/api/v1/admin/cafes', { method: 'POST', body: input, auth: true });
  }

  updateCafe(id: string, fields: Partial<AdminCafeInput>): Promise<AdminCafeDetail> {
    return this.request(`/api/v1/admin/cafes/${id}`, { method: 'PATCH', body: fields, auth: true });
  }

  setPayoutRate(
    id: string,
    payoutRateCents: number,
  ): Promise<{ cafeId: string; payoutRateCents: number }> {
    return this.request(`/api/v1/admin/cafes/${id}/payout-rate`, {
      method: 'PATCH',
      body: { payoutRateCents },
      auth: true,
    });
  }

  setBaristaPin(id: string, pin: string): Promise<SetBaristaPinResult> {
    return this.request(`/api/v1/admin/cafes/${id}/barista-pin`, {
      method: 'PUT',
      body: { pin },
      auth: true,
    });
  }

  createDrink(cafeId: string, input: AdminDrinkInput): Promise<AdminDrink> {
    return this.request(`/api/v1/admin/cafes/${cafeId}/drinks`, {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  updateDrink(drinkId: string, fields: Partial<AdminDrinkInput>): Promise<AdminDrink> {
    return this.request(`/api/v1/admin/drinks/${drinkId}`, {
      method: 'PATCH',
      body: fields,
      auth: true,
    });
  }

  getMembers(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  }): Promise<PaginatedResult<AdminMemberListItem>> {
    return this.request(`/api/v1/admin/members${toQueryString(params)}`, { auth: true });
  }

  getMember(id: string): Promise<AdminMemberDetail> {
    return this.request(`/api/v1/admin/members/${id}`, { auth: true });
  }

  deactivateMember(id: string): Promise<AdminMemberListItem> {
    return this.request(`/api/v1/admin/members/${id}/deactivate`, { method: 'POST', auth: true });
  }

  reactivateMember(id: string): Promise<AdminMemberListItem> {
    return this.request(`/api/v1/admin/members/${id}/reactivate`, { method: 'POST', auth: true });
  }

  getRedemptions(params: {
    page?: number;
    pageSize?: number;
    cafeId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    voided?: boolean;
  }): Promise<PaginatedResult<AdminRedemptionListItem>> {
    return this.request(`/api/v1/admin/redemptions${toQueryString(params)}`, { auth: true });
  }

  getRedemption(id: string): Promise<AdminRedemptionListItem> {
    return this.request(`/api/v1/admin/redemptions/${id}`, { auth: true });
  }

  voidRedemption(id: string, reason: string): Promise<VoidRedemptionResult> {
    return this.request(`/api/v1/admin/redemptions/${id}/void`, {
      method: 'POST',
      body: { reason },
      auth: true,
    });
  }

  getPayoutSummary(periodStart: string, periodEnd: string): Promise<PayoutPeriodSummaryItem[]> {
    return this.request(`/api/v1/admin/payouts${toQueryString({ periodStart, periodEnd })}`, {
      auth: true,
    });
  }

  getPayoutStatement(
    cafeId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<PayoutStatement> {
    return this.request(
      `/api/v1/admin/payouts/${cafeId}/statement${toQueryString({ periodStart, periodEnd })}`,
      { auth: true },
    );
  }

  downloadPayoutStatementCsv(
    cafeId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<{ blob: Blob; filename: string }> {
    return this.download(
      `/api/v1/admin/payouts/${cafeId}/statement.csv${toQueryString({ periodStart, periodEnd })}`,
    );
  }

  recordPayment(
    cafeId: string,
    input: {
      periodStart: string;
      periodEnd: string;
      amountCents: number;
      reference?: string | null;
    },
  ): Promise<RecordPayoutPaymentResult> {
    return this.request(`/api/v1/admin/payouts/${cafeId}/payments`, {
      method: 'POST',
      body: input,
      auth: true,
    });
  }

  addressLookup(query: string): Promise<AddressSuggestion[]> {
    return this.request(`/api/v1/admin/address-lookup${toQueryString({ query })}`, { auth: true });
  }
}

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
