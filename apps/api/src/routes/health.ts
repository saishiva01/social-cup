import { Router } from 'express';

// Explicit type annotation: without it, declaration emit tries to name
// @types/express-serve-static-core by its pnpm store path (TS2742).
const router: Router = Router();

/**
 * postgres.js reports a refused connection (e.g. Postgres/Docker not
 * running — the single most common local-dev readiness failure) as a Node
 * `AggregateError` whose `.message` is an empty string; the useful detail
 * lives in `.code` (e.g. "ECONNREFUSED") instead. Falling back to
 * `error.message` alone would report an empty reason for exactly the
 * failure this endpoint most needs to explain.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (error.message) return code ? `${code}: ${error.message}` : error.message;
    if (code) return code;
    return error.name || 'unknown error';
  }
  return 'unknown error';
}

/**
 * Liveness probe: is the process up and able to handle requests at all.
 * Deliberately does not touch the database — a slow/unavailable database
 * should surface on /health/ready, not make ECS kill and restart a
 * perfectly healthy process.
 */
router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe: is the process ready to serve real traffic, i.e. can it
 * reach the database. Used by the ALB target group / ECS readiness check to
 * decide whether to route traffic to this task. Reuses the app's shared
 * connection pool (see src/app.ts) rather than opening a new connection per
 * check.
 */
router.get('/ready', async (req, res) => {
  const { client } = req.app.locals;

  try {
    await client`select 1`;
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      reason: describeError(error),
    });
  }
});

export default router;
