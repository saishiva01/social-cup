import { Router } from 'express';

import type { AuthService } from '../../services/authService.js';
import type { UserService } from '../../services/userService.js';
import { createAuthRouter } from './auth.js';
import { createMeRouter } from './me.js';

/**
 * Versioned API root. Every future route mounts under /api/v1; a breaking
 * change adds /api/v2 alongside it rather than replacing it. Routers are
 * built from injected services so integration tests can pass fakes and
 * real services alike (see apps/api/src/__tests__/).
 */
export function createV1Router(deps: {
  authService: AuthService;
  userService: UserService;
}): Router {
  const router: Router = Router();

  router.get('/', (_req, res) => {
    res.status(200).json({ version: 'v1', status: 'ok' });
  });

  router.use('/auth', createAuthRouter(deps.authService));
  router.use('/me', createMeRouter(deps.userService));

  return router;
}
