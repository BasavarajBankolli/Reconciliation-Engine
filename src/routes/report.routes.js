'use strict';

const express = require('express');

const {
  getFullReport,
  getSummary,
  getUnmatched,
} = require('../controllers/report.controller');

const router = express.Router();

router.get('/report/:runId', getFullReport);

router.get('/report/:runId/summary', getSummary);

router.get('/report/:runId/unmatched', getUnmatched);

module.exports = router;