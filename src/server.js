'use strict';

const { createApp } = require('./app');
const { connect } = require('./db');
const config = require('./config');
const logger = require('./utils/logger');

async function main() {
  await connect();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`Server runnig at: http://localhost:${config.port}`, { env: config.env });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received – shutting down gracefully`);
    server.close(async () => {
      const { disconnect } = require('./db');
      await disconnect();
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
