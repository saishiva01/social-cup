import type { ResetPasswordResult, VerifyEmailResult } from '@social-cup/types';

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

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? 'Request failed',
    );
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export function verifyEmail(token: string): Promise<VerifyEmailResult> {
  return post('/api/v1/auth/verify-email', { token });
}

export function resetPassword(token: string, password: string): Promise<ResetPasswordResult> {
  return post('/api/v1/auth/reset-password', { token, password });
}
