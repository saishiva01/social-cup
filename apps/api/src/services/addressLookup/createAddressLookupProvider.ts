import { createMockAddressLookupProvider } from './MockAddressLookupProvider.js';
import type { AddressLookupProvider } from './AddressLookupProvider.js';

/**
 * Always returns the mock provider in this phase — no `GOOGLE_PLACES_API_KEY`
 * env var exists, and none is required (root CLAUDE.md: real Google Places
 * integration is deferred to a later external-integration phase). When that
 * phase adds a `GooglePlacesAddressLookupProvider`, this factory is the only
 * place that changes: something like
 * `env.GOOGLE_PLACES_API_KEY ? createGooglePlacesAddressLookupProvider(env.GOOGLE_PLACES_API_KEY) : createMockAddressLookupProvider()`,
 * with no change to the route or admin UI that calls `AddressLookupProvider.search`.
 */
export function createAddressLookupProvider(): AddressLookupProvider {
  return createMockAddressLookupProvider();
}
