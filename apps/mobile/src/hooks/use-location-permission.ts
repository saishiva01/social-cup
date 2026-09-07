import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

/**
 * Location-permission foundation only (PRD Module 2: requested once,
 * explained as "used to sort cafes by distance"). This hook tracks the
 * permission state and can request it — it never reads or persists the
 * device's precise location. Cafe discovery/geolocation search is a later
 * phase; when it lands, this state decides whether distance sorting is
 * available or the saved neighbourhood orders the list instead (per the
 * PRD's declined-permission behavior).
 */
export type LocationPermissionState =
  | 'undetermined' // never asked, or the user can be asked again
  | 'granted'
  | 'denied';

export function useLocationPermission() {
  const [state, setState] = useState<LocationPermissionState>('undetermined');

  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync().then((permission) => {
      if (cancelled) return;
      if (permission.granted) setState('granted');
      else if (permission.status === Location.PermissionStatus.DENIED) setState('denied');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    // getForegroundPermissionsAsync above reports the state; request() shows
    // the OS dialog once. Repeated requests after a denial are ignored by
    // the OS, so we don't nag — the screen explains the consequence instead.
    const result = await Location.requestForegroundPermissionsAsync();
    if (result.granted) setState('granted');
    else if (result.status === Location.PermissionStatus.DENIED) setState('denied');
  }, []);

  return { state, requestPermission };
}
