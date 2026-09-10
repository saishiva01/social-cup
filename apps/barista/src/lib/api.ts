import type { BaristaAuthResult, BaristaRedeemResult, BaristaTodayItem } from '@social-cup/types';

/** Inlined at build time by Vite — never put a secret behind VITE_. */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

/**
 * Thin fetch wrapper over the barista API surface (PRD Module 8). Unlike
 * apps/mobile's ApiClient, there is no bearer token — `credentials:
 * 'include'` sends the httpOnly trusted-device cookie
 * (apps/api/src/lib/baristaCookie.ts) on every request, and the browser
 * itself, not this code, is what holds the credential. Never reads or
 * writes that cookie's value directly (it's httpOnly — JS cannot see it).
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? 'Something went wrong',
    );
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export function authenticate(cafeId: string, pin: string): Promise<BaristaAuthResult> {
  return request('/api/v1/barista/authenticate', { method: 'POST', body: { cafeId, pin } });
}

export function redeem(code: string): Promise<BaristaRedeemResult> {
  return request('/api/v1/barista/redeem', { method: 'POST', body: { code } });
}

export function today(): Promise<BaristaTodayItem[]> {
  return request('/api/v1/barista/today');
}
