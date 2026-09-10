import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { verifyEmail } from '../lib/api';

type State = 'verifying' | 'success' | 'failed';

/**
 * Reached from the verification email's HTTPS link
 * (https://<APP_WEB_URL>/verify-email?token=...). The token comes from the
 * URL and is sent to the API exactly once — it is never displayed or
 * persisted here. The API's verify-email endpoint is already idempotent for
 * an already-verified account with a still-valid token, so "success" covers
 * both a first verification and a repeat click of the same link.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<State>('verifying');

  useEffect(() => {
    if (!token) {
      setState('failed');
      return;
    }
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setState('success');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'verifying') {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold">Verifying your email…</h1>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold text-brand-success">Email verified</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account is ready. You can now sign in from the Social Cup app.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-lg font-semibold text-brand-error">Verification link invalid</h1>
      <p className="mt-2 text-sm text-slate-600">
        This link is invalid or has expired. Open the Social Cup app, sign in with your email and
        password, and we&apos;ll offer to resend a fresh verification link.
      </p>
      <p className="mt-4 text-sm">
        <Link className="text-brand-primary underline" to="/">
          Back to Social Cup
        </Link>
      </p>
    </div>
  );
}
