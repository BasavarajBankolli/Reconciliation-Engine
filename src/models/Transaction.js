'use strict';

const mongoose = require('mongoose');

const DATA_QUALITY_ISSUES = Object.freeze({
  MALFORMED_TIMESTAMP: 'MALFORMED_TIMESTAMP',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  NEGATIVE_QUANTITY: 'NEGATIVE_QUANTITY',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
});

const dataQualityIssueSchema = new mongoose.Schema(
  {
    code: { type: String, enum: Object.values(DATA_QUALITY_ISSUES), required: true },
    message: { type: String, required: true },
    field: { type: String },
    rawValue: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const transactionSchema = new mongoose.Schema(
  {
    // ── Source identification ──────────────────────────────────────────
    runId: { type: String, required: true, index: true },
    source: { type: String, enum: ['user', 'exchange'], required: true, index: true },

    // ── Raw fields (exactly as parsed from CSV) ───────────────────────
    rawTransactionId: { type: String },
    rawTimestamp: { type: String },
    rawType: { type: String },
    rawAsset: { type: String },
    rawQuantity: { type: String },
    rawPriceUsd: { type: String },
    rawFee: { type: String },
    rawNote: { type: String },
    rawRowIndex: { type: Number },

    // ── Normalised / parsed fields ────────────────────────────────────
    transactionId: { type: String, index: true },
    timestamp: { type: Date, index: true },
    type: { type: String, index: true },           // canonical type
    asset: { type: String, index: true },           // canonical asset
    quantity: { type: Number },
    priceUsd: { type: Number },
    fee: { type: Number },
    note: { type: String },

    // ── Data quality ──────────────────────────────────────────────────
    isValid: { type: Boolean, required: true, default: true, index: true },
    qualityIssues: { type: [dataQualityIssueSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'transactions',
  },
);

// Compound index for efficient candidate lookup during matching
transactionSchema.index({ runId: 1, source: 1, asset: 1, type: 1, timestamp: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = { Transaction, DATA_QUALITY_ISSUES };
