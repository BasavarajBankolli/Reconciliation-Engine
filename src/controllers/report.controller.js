'use strict';

const { ReconciliationRun } = require('../models/ReconciliationRun');
const { ReconciliationResult } = require('../models/ReconciliationResult');

const getFullReport = async (req, res, next) => {
  try {
    const { runId } = req.params;

    const run = await ReconciliationRun.findOne({ runId });

    if (!run) {
      return res.status(404).json({
        error: 'Run not found',
      });
    }

    const results = await ReconciliationResult.find({ runId });

    res.status(200).json({
      runId,
      summary: run.summary,
      results,
    });
  } catch (err) {
    next(err);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const { runId } = req.params;

    const run = await ReconciliationRun.findOne({ runId });

    if (!run) {
      return res.status(404).json({
        error: 'Run not found',
      });
    }

    res.status(200).json({
      runId,
      summary: run.summary,
    });
  } catch (err) {
    next(err);
  }
};

const getUnmatched = async (req, res, next) => {
  try {
    const { runId } = req.params;

    const unmatched = await ReconciliationResult.find({
      runId,

      category: {
        $in: ['UNMATCHED_USER', 'UNMATCHED_EXCHANGE'],
      },
    });

    res.status(200).json({
      runId,
      unmatched,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getFullReport,
  getSummary,
  getUnmatched,
};