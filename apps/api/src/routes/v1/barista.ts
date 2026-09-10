import { baristaAuthSchema, redeemCodeSchema } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler.js';
import { setBaristaDeviceCookie } from '../../lib/baristaCookie.js';
import { baristaAuthRateLimit, baristaRedeemRateLimit } from '../../middleware/rateLimit.js';
import { requireBaristaAuth } from '../../middleware/requireBaristaAuth.js';
import { validateBody } from '../../middleware/validate.js';
import type { BaristaService } from '../../services/baristaService.js';

/**
 * Barista-facing endpoints (PRD Module 8). Not part of the member
 * auth/entitlement model at all — see
 * docs/architecture/authentication.md, "Barista access is a separate model
 * entirely." /authenticate is the only route reachable without a trusted
 * device cookie; every route after it requires one, and derives the cafe
 * exclusively from that cookie (never from anything the browser sends in
 * the request body), per PRD: "Do NOT allow a barista to choose another
 * cafe after authenticating through a private cafe URL."
 */
export function createBaristaRouter(deps: { baristaService: BaristaService }): Router {
  const router: Router = Router();

  router.post(
    '/authenticate',
    baristaAuthRateLimit(),
    validateBody(baristaAuthSchema),
    asyncHandler(async (req, res) => {
      const { rawDeviceToken, result } = await deps.baristaService.authenticate({
        cafeId: req.body.cafeId,
        pin: req.body.pin,
      });
      setBaristaDeviceCookie(res, rawDeviceToken);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.use(requireBaristaAuth(deps.baristaService));

  router.post(
    '/redeem',
    baristaRedeemRateLimit(),
    validateBody(redeemCodeSchema),
    asyncHandler(async (req, res) => {
      const result = await deps.baristaService.redeem({
        cafeId: req.barista!.cafeId,
        deviceId: req.barista!.deviceId,
        code: req.body.code,
      });
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.get(
    '/today',
    asyncHandler(async (req, res) => {
      const result = await deps.baristaService.today(req.barista!.cafeId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
