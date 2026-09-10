/**
 * The cafe's private scan link (PRD Module 8: "each cafe has its own scan
 * link and PIN... the link is not a secret — the PIN is the credential").
 * Read from the URL path (`https://scan.socialcup.app/<cafeId>`) with a
 * `?cafeId=` query param as a fallback for local testing. No router is
 * introduced for this (apps/barista intentionally has none) — the app has
 * exactly one meaningful "route": a cafe id.
 */
export function readCafeIdFromLocation(): string | null {
  const fromPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (isUuid(fromPath)) return fromPath;

  const fromQuery = new URLSearchParams(window.location.search).get('cafeId');
  if (fromQuery && isUuid(fromQuery)) return fromQuery;

  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
