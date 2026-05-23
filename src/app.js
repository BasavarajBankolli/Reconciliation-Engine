'use strict';

const express = require('express');
const reconciliationRoutes = require('./routes/reconciliation.routes');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Health check ─────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

  // ── API routes ────────────────────────────────────────────────────────
  app.use('/api/v1', reconciliationRoutes);

  // ── 404 handler ───────────────────────────────────────────────────────
  app.use((req, res) => {
    logger.warn('404 Not Found', { method: req.method, url: req.originalUrl });
    res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
  });

  // ── Centralised error handler ─────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
