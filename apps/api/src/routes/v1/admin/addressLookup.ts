import { addressLookupQuerySchema } from '@social-cup/validation';
import type { AddressLookupQuery } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../../lib/asyncHandler.js';
import { validateQuery } from '../../../middleware/validate.js';
import type { AddressLookupProvider } from '../../../services/addressLookup/AddressLookupProvider.js';

/**
 * Admin address autofill (PRD Module 9). Backed only by the mock provider in
 * this phase — see docs/architecture/address-lookup.md and
 * apps/api/src/services/addressLookup/. Every suggestion returned carries
 * `source: 'mock'` so the admin UI can visibly label it as such.
 */
export function createAddressLookupRouter(provider: AddressLookupProvider): Router {
  const router: Router = Router();

  router.get(
    '/',
    validateQuery(addressLookupQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as AddressLookupQuery;
      const suggestions = await provider.search(query.query);
      res.status(200).json({ success: true, data: suggestions });
    }),
  );

  return router;
}
