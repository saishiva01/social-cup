import type { AddressSuggestion } from '@social-cup/types';

/**
 * Address autofill for the admin cafe-creation form (PRD Module 9: "Google
 * Places (admin panel address autofill only)"). See
 * docs/architecture/address-lookup.md for the full status.
 *
 * Real Google Places integration is explicitly deferred to a later,
 * dedicated external-integration phase (root CLAUDE.md: "DO NOT perform real
 * Google Places API integration") — this interface exists now so that phase
 * only ever needs to add a new implementation (a
 * `GooglePlacesAddressLookupProvider`) and flip the factory below, with no
 * change to `adminCafeService`, the route, or the admin UI that calls it.
 */
export interface AddressLookupProvider {
  search(query: string): Promise<AddressSuggestion[]>;
}
