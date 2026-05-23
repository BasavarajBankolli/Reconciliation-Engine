'use strict';

const { v4: uuidv4 } = require('uuid');
const { ReconciliationRun, RUN_STATUS } = require('../models/ReconciliationRun');
const { ingestCsv } = require('./ingestion.service');
const { runMatching } = require('./matching.service');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Merge default tolerances from config with any overrides supplied in the
 * POST /reconcile request body.
 * @param {object} overrides  partial tolerance object from request body
 * @returns {{ timestampToleranceSeconds: number, quantityTolerancePct: number }}
 */
function buildTolerances(overrides = {}) {
  return {
    timestampToleranceSeconds:
      overrides.timestampToleranceSeconds != null
        ? Number(overrides.timestampToleranceSeconds)
        : config.matching.timestampToleranceSeconds,
    quantityTolerancePct:
      overrides.quantityTolerancePct != null
        ? Number(overrides.quantityTolerancePct)
        : config.matching.quantityTolerancePct,
  };
}

/**
 * Start a reconciliation run asynchronously.
 *
 * This function returns immediately with the runId so the API can respond
 * with 202 Accepted.  The actual work happens in the background.
 *
 * @param {string}  userFilePath      absolute path to user CSV
 * @param {string}  exchangeFilePath  absolute path to exchange CSV
 * @param {object}  toleranceOverrides
 * @returns {Promise<string>}  runId
 */
async function startReconciliation(userFilePath, exchangeFilePath, toleranceOverrides = {}) {
  const runId = uuidv4();
  const tolerances = buildTolerances(toleranceOverrides);

  // Create the run document immediately so callers can poll its status
  await ReconciliationRun.create({
    runId,
    status: RUN_STATUS.PENDING,
    config: tolerances,
  });

  logger.info('Reconciliation run created', { runId, tolerances });

  // Fire-and-forget; errors are caught and persisted to the run document
  _executeRun(runId, userFilePath, exchangeFilePath, tolerances).catch((err) => {
    logger.error('Unhandled error in reconciliation run', { runId, error: err.message });
  });

  return runId;
}

/**
 * Internal: execute the full pipeline for a run.
 * Updates run status at each stage and persists errors on failure.
 */
async function _executeRun(runId, userFilePath, exchangeFilePath, tolerances) {
  try {
    // ── Stage 1: Ingestion ─────────────────────────────────────────────
    await ReconciliationRun.updateOne({ runId }, { status: RUN_STATUS.INGESTING });

    const [userStats, exchangeStats] = await Promise.all([
      ingestCsv(userFilePath, 'user', runId),
      ingestCsv(exchangeFilePath, 'exchange', runId),
    ]);

    await ReconciliationRun.updateOne(
      { runId },
      {
        status: RUN_STATUS.MATCHING,
        'ingestion.userTotal': userStats.total,
        'ingestion.userValid': userStats.valid,
        'ingestion.userInvalid': userStats.invalid,
        'ingestion.exchangeTotal': exchangeStats.total,
        'ingestion.exchangeValid': exchangeStats.valid,
        'ingestion.exchangeInvalid': exchangeStats.invalid,
      },
    );

    // ── Stage 2: Matching ──────────────────────────────────────────────
    const summary = await runMatching(runId, tolerances);

    // ── Stage 3: Finalise ──────────────────────────────────────────────
    await ReconciliationRun.updateOne(
      { runId },
      {
        status: RUN_STATUS.COMPLETED,
        'summary.matched': summary.matched,
        'summary.conflicting': summary.conflicting,
        'summary.unmatchedUser': summary.unmatchedUser,
        'summary.unmatchedExchange': summary.unmatchedExchange,
        completedAt: new Date(),
      },
    );

    logger.info('Reconciliation run completed', { runId, summary });
  } catch (err) {
    logger.error('Reconciliation run failed', { runId, error: err.message, stack: err.stack });

    await ReconciliationRun.updateOne(
      { runId },
      { status: RUN_STATUS.FAILED, error: err.message },
    ).catch(() => {});
  }
}

module.exports = { startReconciliation };
