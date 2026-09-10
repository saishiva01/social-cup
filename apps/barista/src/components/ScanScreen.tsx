import type { BaristaRedeemResult, BaristaTodayItem } from '@social-cup/types';
import { useState, type FormEvent } from 'react';

import { ApiError, redeem, today } from '@/lib/api';
import { ResultBanner } from '@/components/ResultBanner';

type Outcome =
  { kind: 'success'; data: BaristaRedeemResult } | { kind: 'failure'; message: string } | null;

interface ScanScreenProps {
  cafeName: string;
  /** Called when the server reports the trusted-device session is no longer valid (expired, or a PIN reset revoked it) — routes back to PinScreen instead of showing a dead-end red screen forever. */
  onSessionExpired: () => void;
}

/**
 * Ready-to-scan state (PRD Module 8). No camera/QR decoding is implemented
 * (see docs/architecture/redemption.md, "What's explicitly deferred") — the
 * barista types the code the member reads off their phone, or the six-digit
 * backup code; both go through the same POST /barista/redeem, which is the
 * only place that decides success/failure (this component never guesses).
 */
export function ScanScreen({ cafeName, onSessionExpired }: ScanScreenProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [showToday, setShowToday] = useState(false);
  const [todayItems, setTodayItems] = useState<BaristaTodayItem[] | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || code.trim() === '') return;
    setBusy(true);
    try {
      const data = await redeem(code.trim());
      setOutcome({ kind: 'success', data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setOutcome({
        kind: 'failure',
        message: err instanceof ApiError ? err.message : 'No connection',
      });
    } finally {
      setCode('');
      setBusy(false);
    }
  }

  async function handleToggleToday() {
    const next = !showToday;
    setShowToday(next);
    if (next) {
      setTodayError(null);
      try {
        setTodayItems(await today());
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
          return;
        }
        setTodayError(
          err instanceof ApiError ? err.message : 'Could not load today’s redemptions.',
        );
      }
    }
  }

  return (
    <main className="screen">
      <header className="scan-header">
        <h1>{cafeName}</h1>
        <button
          type="button"
          className="link-button"
          onClick={handleToggleToday}
          data-testid="today-toggle"
        >
          {showToday ? 'Back to scanning' : "Today's redemptions"}
        </button>
      </header>

      {showToday ? (
        <TodayList items={todayItems} error={todayError} />
      ) : (
        <>
          {outcome ? (
            <div onClick={() => setOutcome(null)} role="presentation">
              <ResultBanner outcome={outcome} />
              <p className="tap-hint">Tap anywhere to scan the next code</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="code-form">
              <input
                type="text"
                autoFocus
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Enter code or 6-digit backup"
                aria-label="Redemption code"
                data-testid="code-input"
              />
              <button type="submit" disabled={busy || code.trim() === ''} data-testid="code-submit">
                {busy ? 'Checking…' : 'Redeem'}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}

function TodayList({ items, error }: { items: BaristaTodayItem[] | null; error: string | null }) {
  if (error) {
    return (
      <p className="status status-error" role="alert">
        {error}
      </p>
    );
  }
  if (!items) {
    return <p className="status">Loading…</p>;
  }
  if (items.length === 0) {
    return <p className="status">No redemptions yet today.</p>;
  }
  return (
    <ul className="today-list" data-testid="today-list">
      {items.map((item) => (
        <li key={item.id} className="today-row">
          <span>{item.memberFirstName}</span>
          <span>{item.drinkName}</span>
          <span>{item.creditsDeducted} cr</span>
          <span>
            {new Date(item.redeemedAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
