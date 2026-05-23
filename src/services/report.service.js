'use strict';

const { format: fastCsvFormat } = require('@fast-csv/format');
const { ReconciliationResult, RESULT_CATEGORIES } = require('../models/ReconciliationResult');
const { ReconciliationRun } = require('../models/ReconciliationRun');
const logger = require('../utils/logger');

/**
 * Fetch a run document by runId.
 * @param {string} runId
 * @returns {Promise<object|null>}
 */
async function getRun(runId) {
  return ReconciliationRun.findOne({ runId }).lean();
}

/**
 * Fetch all results for a run as plain objects.
 * @param {string} runId
 * @param {object} [filter]  optional additional Mongoose filter fields
 * @returns {Promise<object[]>}
 */
async function getResults(runId, filter = {}) {
  return ReconciliationResult.find({ runId, ...filter })
    .lean()
    .sort({ category: 1, createdAt: 1 });
}

/**
 * Fetch only the summary counters for a run.
 * @param {string} runId
 * @returns {Promise<object|null>}
 */
async function getSummary(runId) {
  const run = await getRun(runId);
  if (!run) return null;

  return {
    runId,
    status: run.status,
    config: run.config,
    ingestion: run.ingestion,
    summary: run.summary,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

/**
 * Flatten a result document into a row suitable for CSV export.
 * All user and exchange fields are prefixed to avoid column collisions.
 * @param {object} result
 * @returns {object}
 */
function flattenResultForCsv(result) {
  const u = result.userTransaction || {};
  const e = result.exchangeTransaction || {};

  return {
    category: result.category,
    reason: result.reason,
    conflicts: result.conflicts && result.conflicts.length
      ? result.conflicts.map((c) => `${c.field}(user=${c.userValue},exc=${c.exchangeValue},delta=${c.delta})`).join(' | ')
      : '',

    // User side
    user_transaction_id: u.transactionId || '',
    user_timestamp: u.rawTimestamp || '',
    user_type: u.rawType || '',
    user_asset: u.rawAsset || '',
    user_quantity: u.rawQuantity || '',
    user_price_usd: u.priceUsd != null ? u.priceUsd : '',
    user_fee: u.fee != null ? u.fee : '',
    user_note: u.note || '',
    user_is_valid: u.isValid != null ? u.isValid : '',
    user_quality_issues: u.qualityIssues && u.qualityIssues.length
      ? u.qualityIssues.map((i) => i.code).join(', ')
      : '',

    // Exchange side
    exchange_transaction_id: e.transactionId || '',
    exchange_timestamp: e.rawTimestamp || '',
    exchange_type: e.rawType || '',
    exchange_asset: e.rawAsset || '',
    exchange_quantity: e.rawQuantity || '',
    exchange_price_usd: e.priceUsd != null ? e.priceUsd : '',
    exchange_fee: e.fee != null ? e.fee : '',
    exchange_note: e.note || '',
    exchange_is_valid: e.isValid != null ? e.isValid : '',
    exchange_quality_issues: e.qualityIssues && e.qualityIssues.length
      ? e.qualityIssues.map((i) => i.code).join(', ')
      : '',
  };
}

/**
 * Stream a reconciliation report as CSV to an HTTP response.
 * @param {string}          runId
 * @param {object}          res           Express response
 * @param {object}          [filter]      additional category filter
 * @param {string}          [filename]    CSV download filename
 */
async function streamReportCsv(runId, res, filter = {}, filename = 'report.csv') {
  const results = await getResults(runId, filter);

  if (results.length === 0) {
    logger.warn('No results to export', { runId, filter });
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const csvStream = fastCsvFormat({ headers: true, quoteColumns: true });
  csvStream.pipe(res);

  for (const result of results) {
    csvStream.write(flattenResultForCsv(result));
  }

  csvStream.end();
}

/**
 * Return JSON results with optional category filter.
 * @param {string}  runId
 * @param {string}  [category]  RESULT_CATEGORIES value or undefined for all
 * @returns {Promise<object[]>}
 */
async function getResultsJson(runId, category) {
  const filter = category ? { category } : {};
  return getResults(runId, filter);
}

module.exports = {
  getRun,
  getSummary,
  getResultsJson,
  streamReportCsv,
  RESULT_CATEGORIES,
};
