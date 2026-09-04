import { Router } from 'express';

/**
 * Versioned API root. No business routes exist yet — this file exists so
 * the versioning convention (mount every future route under /api/v1, add
 * /api/v2 alongside it rather than in place of it when a breaking change is
 * needed) is established before the first real endpoint is added.
 */
// Explicit type annotation: without it, declaration emit tries to name
// @types/express-serve-static-core by its pnpm store path (TS2742).
const router: Router = Router();

router.get('/', (_req, res) => {
  res.status(200).json({ version: 'v1', status: 'ok' });
});

export default router;
