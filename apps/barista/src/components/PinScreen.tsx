import { AlertCircle, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { authenticate, ApiError } from '@/lib/api';

interface PinScreenProps {
  cafeId: string;
  onAuthenticated: (cafeName: string) => void;
}

/**
 * PRD Module 8: "enters the cafe PIN once, after which that device stays
 * trusted." The PIN itself never touches localStorage/sessionStorage —
 * only the server-issued httpOnly cookie represents the trusted session
 * (apps/api/src/lib/baristaCookie.ts); this component only ever holds the
 * PIN in transient component state for the duration of the submit.
 */
export function PinScreen({ cafeId, onAuthenticated }: PinScreenProps) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || pin.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const result = await authenticate(cafeId, pin.trim());
      onAuthenticated(result.cafeName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen screen-center">
      <span className="brand-mark" aria-hidden="true">
        SC
      </span>
      <h1>Barista access</h1>
      <p className="subtitle">Enter this café&apos;s PIN to unlock scanning on this device.</p>
      <form onSubmit={handleSubmit} className="pin-form">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder="PIN"
          aria-label="Café PIN"
          data-testid="pin-input"
        />
        <div className="error-slot">
          {error ? (
            <p className="status status-error" role="alert" data-testid="pin-error">
              <AlertCircle size={16} aria-hidden />
              {error}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={busy || pin.trim() === ''} data-testid="pin-submit">
          <Lock size={17} aria-hidden />
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </main>
  );
}
