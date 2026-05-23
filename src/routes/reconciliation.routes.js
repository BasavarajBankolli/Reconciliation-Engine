'use strict';

const express = require('express');
const upload = require('../middleware/upload');
const {
  triggerReconciliation,
  getFullReport,
  getReportSummary,
  getUnmatchedReport,
} = require('../controllers/reconciliation.controller');

const router = express.Router();

/**
 * POST /reconcile
 * Trigger a new reconciliation run.
 * Expects multipart/form-data with fields: user_file, exchange_file
 * Optional body fields: timestampToleranceSeconds, quantityTolerancePct
 */
router.post(
  '/reconcile',
  upload.fields([
    { name: 'user_file', maxCount: 1 },
    { name: 'exchange_file', maxCount: 1 },
  ]),
  triggerReconciliation,
);

/**
 * GET /report/:runId
 * Full report – JSON or CSV (?format=csv)
 */
router.get('/report/:runId', getFullReport);

/**
 * GET /report/:runId/summary
 * Count summary only
 */
router.get('/report/:runId/summary', getReportSummary);

/**
 * GET /report/:runId/unmatched
 * Unmatched rows with reasons – JSON or CSV (?format=csv)
 * Optional filter: ?source=user|exchange
 */
router.get('/report/:runId/unmatched', getUnmatchedReport);

module.exports = router;
