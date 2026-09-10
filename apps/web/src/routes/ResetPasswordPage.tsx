import { passwordSchema } from '@social-cup/validation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError, resetPassword } from '../lib/api';

type State = 'form' | 'submitting' | 'success' | 'error';

/**
 * Reached from the password-reset email's HTTPS link
 * (https://<APP_WEB_URL>/reset-password?token=...). The token comes from the
 * URL and is sent to the API only when the user submits the new password —
 * it is never displayed or persisted here.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<State>('form');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold text-brand-error">Invalid link</h1>
        <p className="mt-2 text-sm text-slate-600">
          This password reset link is missing its token. Request a new one from the Social Cup
          app&apos;s &quot;Forgot password?&quot; screen.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setErrorMessage('Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setState('submitting');
    try {
      await resetPassword(token as string, password);
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMessage(
        err instanceof ApiError ? err.message : 'This reset link is invalid or has expired.',
      );
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold text-brand-success">Password updated</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your password has been reset. Sign in from the Social Cup app with your new password.
        </p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold text-brand-error">Reset link invalid</h1>
        <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
        <p className="mt-4 text-sm">
          <Link className="text-brand-primary underline" to="/">
            Back to Social Cup
          </Link>
        </p>
      </div>
    );
  }

  const busy = state === 'submitting';

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="text-lg font-semibold">Choose a new password</h1>

      <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="password">
        New password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={busy}
      />

      <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="confirmPassword">
        Confirm new password
      </label>
      <input
        id="confirmPassword"
        type="password"
        autoComplete="new-password"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        disabled={busy}
      />

      {errorMessage ? (
        <p className="mt-3 text-sm text-brand-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        className="mt-5 w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        disabled={busy}
      >
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
