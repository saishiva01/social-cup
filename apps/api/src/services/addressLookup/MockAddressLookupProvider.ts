import { createHash } from 'node:crypto';

import type { AddressSuggestion } from '@social-cup/types';

import type { AddressLookupProvider } from './AddressLookupProvider.js';

/**
 * Local dev/demo stand-in for Google Places Autocomplete — see
 * docs/architecture/address-lookup.md. Makes no network call, requires no
 * API key, and every suggestion is unambiguously labeled as a mock
 * (`source: 'mock'`, and the word "(mock suggestion)" in the description
 * text itself) so it can never be mistaken for a real address lookup result,
 * per root CLAUDE.md: "do not fake production Google results and present
 * them as real."
 *
 * Coordinates are deterministically derived from the query text (a stable
 * hash, not `Math.random()`) purely so repeated searches for the same text
 * return the same suggestions in a demo/test run — they are not real
 * geocodes and must never be treated as one.
 */
const DALLAS_STREETS = [
  'Main St',
  'Elm St',
  'Commerce St',
  'Ross Ave',
  'McKinney Ave',
  'Greenville Ave',
] as const;

function seededOffset(seed: string, salt: string): number {
  const hash = createHash('sha256').update(`${seed}:${salt}`).digest();
  // Map the first 4 bytes to a small, deterministic +/- 0.05 degree offset —
  // enough to place mock pins at visibly different points around Dallas.
  const value = hash.readUInt32BE(0) / 0xffffffff;
  return (value - 0.5) * 0.1;
}

const DALLAS_CENTER = { latitude: 32.7767, longitude: -96.797 };

export function createMockAddressLookupProvider(): AddressLookupProvider {
  return {
    async search(query) {
      const trimmed = query.trim();
      if (trimmed.length === 0) return [];

      return DALLAS_STREETS.slice(0, 5).map((street, index) => {
        const seed = `${trimmed.toLowerCase()}:${index}`;
        const houseNumber = 100 + (index + 1) * 111;
        return {
          id: `mock:${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`,
          description: `${trimmed} — ${houseNumber} ${street}, Dallas, TX (mock suggestion)`,
          address: `${houseNumber} ${street}, Dallas, TX 75201`,
          neighborhood: null,
          latitude: DALLAS_CENTER.latitude + seededOffset(seed, 'lat'),
          longitude: DALLAS_CENTER.longitude + seededOffset(seed, 'lng'),
          source: 'mock',
        } satisfies AddressSuggestion;
      });
    },
  };
}
