import { createDatabase } from '@social-cup/database';

import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { logger } from './lib/logger.js';

const env = loadEnv();
const { client, close } = createDatabase();
const app = createApp({ client });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Social Cup API listening');
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error while closing HTTP server');
    }
    try {
      await close();
    } catch (closeErr) {
      logger.error({ err: closeErr }, 'Error while closing database connection');
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(err ? 1 : 0);
    }
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  process.exit(1);
});
