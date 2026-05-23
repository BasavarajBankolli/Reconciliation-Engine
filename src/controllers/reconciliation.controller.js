'use strict';

const { startReconciliation } = require('../services/reconciliation.service');
const {
  getSummary,
  getResultsJson,
  streamReportCsv,
  RESULT_CATEGORIES,
} = require('../services/report.service');
const { getRun } = require('../services/report.service');
const { createHttpError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * POST /reconcile
 *
 * Accepts multipart/form-data with two CSV files:
 *   - userFile       (field name: user_file)
 *   - exchangeFile   (field name: exchange_file)
 *
 * Optional JSON body / form fields for tolerance overrides:
 *   - timestampToleranceSeconds
 *   - quantityTolerancePct
 *
 * Responds 202 Accepted immediately with the runId.
 */
async function triggerReconciliation(req, res, next) {
  try {
    const files = req.files || {};
    const userFile = files.user_file?.[0];
    const exchangeFile = files.exchange_file?.[0];

    if (!userFile) throw createHttpError(400, 'Missing required file: user_file');
    if (!exchangeFile) throw createHttpError(400, 'Missing required file: exchange_file');

    const toleranceOverrides = {};
    if (req.body.timestampToleranceSeconds != null) {
      const v = Number(req.body.timestampToleranceSeconds);
      if (isNaN(v) || v < 0) throw createHttpError(400, 'timestampToleranceSeconds must be a non-negative number');
      toleranceOverrides.timestampToleranceSeconds = v;
    }
    if (req.body.quantityTolerancePct != null) {
      const v = Number(req.body.quantityTolerancePct);
      if (isNaN(v) || v < 0) throw createHttpError(400, 'quantityTolerancePct must be a non-negative number');
      toleranceOverrides.quantityTolerancePct = v;
    }

    const runId = await startReconciliation(
      userFile.path,
      exchangeFile.path,
      toleranceOverrides,
    );

    logger.info('Reconciliation triggered via API', { runId });

    return res.status(202).json({
      runId,
      message: `Reconciliation started. Poll /api/v1/report/${runId}/summary for progress.`    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /report/:runId
 *
 * Returns the full reconciliation report as JSON by default.
 * Add ?format=csv to stream a CSV file.
 */
async function getFullReport(req, res, next) {
  try {
    const { runId } = req.params;
    const run = await getRun(runId);
    if (!run) throw createHttpError(404, `Run '${runId}' not found`);

    if (req.query.format === 'csv') {
      return streamReportCsv(runId, res, {}, `reconciliation-${runId}.csv`);
    }

    const results = await getResultsJson(runId);
    return res.json({ runId, total: results.length, results });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /report/:runId/summary
 *
 * Returns counts only: matched, conflicting, unmatchedUser, unmatchedExchange.
 */
async function getReportSummary(req, res, next) {
  try {
    const { runId } = req.params;
    const summary = await getSummary(runId);
    if (!summary) throw createHttpError(404, `Run '${runId}' not found`);
    return res.json(summary);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /report/:runId/unmatched
 *
 * Returns only unmatched rows (UNMATCHED_USER + UNMATCHED_EXCHANGE) with reasons.
 * Add ?source=user or ?source=exchange to filter by side.
 * Add ?format=csv to stream a CSV file.
 */
async function getUnmatchedReport(req, res, next) {
  try {
    const { runId } = req.params;
    const run = await getRun(runId);
    if (!run) throw createHttpError(404, `Run '${runId}' not found`);

    const { source, format } = req.query;

    let categories = [RESULT_CATEGORIES.UNMATCHED_USER, RESULT_CATEGORIES.UNMATCHED_EXCHANGE];
    if (source === 'user') categories = [RESULT_CATEGORIES.UNMATCHED_USER];
    if (source === 'exchange') categories = [RESULT_CATEGORIES.UNMATCHED_EXCHANGE];

    const filter = { category: { $in: categories } };

    if (format === 'csv') {
      return streamReportCsv(runId, res, filter, `unmatched-${runId}.csv`);
    }

    const results = await getResultsJson(runId, undefined);
    const filtered = results.filter((r) => categories.includes(r.category));
    return res.json({ runId, total: filtered.length, results: filtered });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  triggerReconciliation,
  getFullReport,
  getReportSummary,
  getUnmatchedReport,
};
