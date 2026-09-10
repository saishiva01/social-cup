import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * A single, one-shot coordinate read for sorting the cafe list by distance
 * (PRD Module 3) — separate from useLocationPermission, which only tracks
 * grant state. Never persisted, never sent anywhere but the one list
 * request. Only reads once permission is already granted.
 */
export function useCurrentLocation(enabled: boolean): Coordinates | null {
  const [fetchedCoords, setFetchedCoords] = useState<Coordinates | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((position) => {
        if (cancelled) return;
        setFetchedCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      })
      .catch(() => {
        // Best-effort — the list falls back to neighbourhood/name order.
        if (!cancelled) setFetchedCoords(null);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? fetchedCoords : null;
}
