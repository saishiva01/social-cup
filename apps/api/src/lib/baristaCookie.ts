import type { Response } from 'express';

import { loadEnv } from '../env.js';
import { BARISTA_TRUSTED_DEVICE_TTL_MS } from './tokens.js';

/**
 * The barista trusted-device token lives in an httpOnly cookie — never
 * localStorage (PRD Module 8's "device stays trusted" must not mean
 * client-readable JS storage of a bearer credential; see
 * docs/architecture/authentication.md, which documents this same
 * httpOnly-cookie approach as the intended pattern for a web auth surface).
 * Scoped to the barista API path only, so it is never sent on unrelated
 * requests.
 */
export const BARISTA_DEVICE_COOKIE_NAME = 'sc_barista_device';
const COOKIE_PATH = '/api/v1/barista';

export function setBaristaDeviceCookie(res: Response, rawToken: string): void {
  const { NODE_ENV } = loadEnv();
  res.cookie(BARISTA_DEVICE_COOKIE_NAME, rawToken, {
    httpOnly: true,
    // Secure requires HTTPS; local dev runs over plain http.
    secure: NODE_ENV !== 'development' && NODE_ENV !== 'test',
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: BARISTA_TRUSTED_DEVICE_TTL_MS,
  });
}
