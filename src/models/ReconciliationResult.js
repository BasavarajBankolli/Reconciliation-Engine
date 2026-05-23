'use strict';

const mongoose = require('mongoose');

const RESULT_CATEGORIES = Object.freeze({
  MATCHED: 'MATCHED',
  CONFLICTING: 'CONFLICTING',
  UNMATCHED_USER: 'UNMATCHED_USER',
  UNMATCHED_EXCHANGE: 'UNMATCHED_EXCHANGE',
});

/**
 * Embeds a lightweight snapshot of a transaction for report output,
 * avoiding the need to join back to the transactions collection.
 */
const txSnapshotSchema = new mongoose.Schema(
  {
    transactionId: String,
    source: String,
    timestamp: Date,
    rawTimestamp: String,
    type: String,
    rawType: String,
    asset: String,
    rawAsset: String,
    quantity: Number,
    rawQuantity: String,
    priceUsd: Number,
    fee: Number,
    note: String,
    isValid: Boolean,
    qualityIssues: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { _id: false },
);

const reconciliationResultSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: Object.values(RESULT_CATEGORIES),
      required: true,
      index: true,
    },
    reason: { type: String, required: true },

    userTransaction: { type: txSnapshotSchema, default: null },
    exchangeTransaction: { type: txSnapshotSchema, default: null },

    // For CONFLICTING rows – which fields differ and by how much
    conflicts: {
      type: [
        {
          field: String,
          userValue: mongoose.Schema.Types.Mixed,
          exchangeValue: mongoose.Schema.Types.Mixed,
          delta: mongoose.Schema.Types.Mixed,
          tolerance: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'reconciliation_results',
  },
);

reconciliationResultSchema.index({ runId: 1, category: 1 });

const ReconciliationResult = mongoose.model('ReconciliationResult', reconciliationResultSchema);

module.exports = { ReconciliationResult, RESULT_CATEGORIES };
