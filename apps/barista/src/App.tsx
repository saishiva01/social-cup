import { useEffect, useState } from 'react';

import { PinScreen } from '@/components/PinScreen';
import { ScanScreen } from '@/components/ScanScreen';
import { readCafeIdFromLocation } from '@/lib/cafeId';
import { today } from '@/lib/api';

// Display-only convenience, not a credential — the actual trusted session
// lives entirely in the httpOnly cookie the server set. Losing this just
// means the header briefly reads "your café" instead of its name.
const CAFE_NAME_STORAGE_KEY = 'socialcup.baristaCafeName';

type Stage =
  | { name: 'no-cafe' }
  | { name: 'checking' }
  | { name: 'pin'; cafeId: string }
  | { name: 'ready'; cafeName: string };

export function App() {
  const [stage, setStage] = useState<Stage>({ name: 'checking' });
  // Kept alongside `stage` so a session-expired mid-shift can return to the
  // PIN screen without re-parsing the URL — the café id doesn't change.
  const [cafeId, setCafeId] = useState<string | null>(null);

  useEffect(() => {
    const id = readCafeIdFromLocation();
    setCafeId(id);
    if (!id) {
      setStage({ name: 'no-cafe' });
      return;
    }

    // No dedicated "am I trusted" endpoint — GET /barista/today doubles as
    // the session check (it's barista-auth-gated already, and useful on its
    // own). A 401 here just means this device hasn't entered the PIN yet
    // (or its trust has expired/been reset), not an error to surface.
    today()
      .then(() => {
        setStage({
          name: 'ready',
          cafeName: sessionStorage.getItem(CAFE_NAME_STORAGE_KEY) ?? 'your café',
        });
      })
      .catch(() => {
        setStage({ name: 'pin', cafeId: id });
      });
  }, []);

  if (stage.name === 'no-cafe') {
    return (
      <main className="screen screen-center">
        <h1>Social Cup</h1>
        <p className="subtitle">
          This link is missing a café. Ask Social Cup for your café&apos;s private scan link.
        </p>
      </main>
    );
  }

  if (stage.name === 'checking') {
    return (
      <main className="screen screen-center">
        <p className="status">Loading…</p>
      </main>
    );
  }

  if (stage.name === 'pin') {
    return (
      <PinScreen
        cafeId={stage.cafeId}
        onAuthenticated={(cafeName) => {
          sessionStorage.setItem(CAFE_NAME_STORAGE_KEY, cafeName);
          setStage({ name: 'ready', cafeName });
        }}
      />
    );
  }

  return (
    <ScanScreen
      cafeName={stage.cafeName}
      onSessionExpired={() => {
        if (cafeId) setStage({ name: 'pin', cafeId });
      }}
    />
  );
}
