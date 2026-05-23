'use strict';

const mongoose = require('mongoose');

const RUN_STATUS = Object.freeze({
  PENDING: 'PENDING',
  INGESTING: 'INGESTING',
  MATCHING: 'MATCHING',
  REPORTING: 'REPORTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

const reconciliationRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: Object.values(RUN_STATUS),
      default: RUN_STATUS.PENDING,
      index: true,
    },

    // Config used for this run (merged from defaults + request overrides)
    config: {
      timestampToleranceSeconds: { type: Number, required: true },
      quantityTolerancePct: { type: Number, required: true },
    },

    // Ingestion stats
    ingestion: {
      userTotal: { type: Number, default: 0 },
      userValid: { type: Number, default: 0 },
      userInvalid: { type: Number, default: 0 },
      exchangeTotal: { type: Number, default: 0 },
      exchangeValid: { type: Number, default: 0 },
      exchangeInvalid: { type: Number, default: 0 },
    },

    // Reconciliation summary
    summary: {
      matched: { type: Number, default: 0 },
      conflicting: { type: Number, default: 0 },
      unmatchedUser: { type: Number, default: 0 },
      unmatchedExchange: { type: Number, default: 0 },
    },

    error: { type: String },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'reconciliation_runs',
  },
);

const ReconciliationRun = mongoose.model('ReconciliationRun', reconciliationRunSchema);

module.exports = { ReconciliationRun, RUN_STATUS };
