'use strict';

const fs = require('fs');
const csv = require('csv-parser');
const { Transaction, DATA_QUALITY_ISSUES } = require('../models/Transaction');
const { normalizeAsset } = require('../utils/assetAliases');
const { normalizeType } = require('../utils/typeMapping');
const logger = require('../utils/logger');

// Required fields that must be present (non-empty) for a row to be valid
const REQUIRED_FIELDS = ['transaction_id', 'timestamp', 'type', 'asset', 'quantity'];

/**
 * Parse a CSV file into raw row objects.
 * Resolves with an array of { rowIndex, row } objects.
 * @param {string} filePath
 * @returns {Promise<Array<{rowIndex: number, row: object}>>}
 */
function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let rowIndex = 0;

    fs.createReadStream(filePath)
      .pipe(csv({ trim: true, skipEmptyLines: true }))
      .on('data', (row) => {
        rows.push({ rowIndex: ++rowIndex, row });
      })
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

/**
 * Validate a single raw row and return an array of quality issues.
 * An empty array means the row is clean.
 * @param {object} row  raw CSV row
 * @returns {Array<{code, message, field, rawValue}>}
 */
function validateRow(row) {
  const issues = [];

  // 1. Missing required fields
  for (const field of REQUIRED_FIELDS) {
    const val = row[field];
    if (val === undefined || val === null || String(val).trim() === '') {
      issues.push({
        code: DATA_QUALITY_ISSUES.MISSING_REQUIRED_FIELD,
        message: `Required field '${field}' is missing or empty`,
        field,
        rawValue: val,
      });
    }
  }

  // 2. Timestamp validation (only if field exists)
  if (row.timestamp !== undefined && String(row.timestamp).trim() !== '') {
    const ts = new Date(String(row.timestamp).trim());
    if (isNaN(ts.getTime())) {
      issues.push({
        code: DATA_QUALITY_ISSUES.MALFORMED_TIMESTAMP,
        message: `Timestamp '${row.timestamp}' could not be parsed as a valid date`,
        field: 'timestamp',
        rawValue: row.timestamp,
      });
    }
  }

  // 3. Quantity validation
  if (row.quantity !== undefined && String(row.quantity).trim() !== '') {
    const qty = parseFloat(row.quantity);
    if (isNaN(qty)) {
      issues.push({
        code: DATA_QUALITY_ISSUES.INVALID_QUANTITY,
        message: `Quantity '${row.quantity}' is not a valid number`,
        field: 'quantity',
        rawValue: row.quantity,
      });
    } else if (qty < 0) {
      issues.push({
        code: DATA_QUALITY_ISSUES.NEGATIVE_QUANTITY,
        message: `Quantity '${row.quantity}' is negative – likely a data entry error`,
        field: 'quantity',
        rawValue: row.quantity,
      });
    }
  }

  // 4. Type validation
  if (row.type !== undefined && String(row.type).trim() !== '') {
    if (normalizeType(row.type) === null) {
      issues.push({
        code: DATA_QUALITY_ISSUES.UNKNOWN_TYPE,
        message: `Transaction type '${row.type}' is not recognised`,
        field: 'type',
        rawValue: row.type,
      });
    }
  }

  return issues;
}

/**
 * Build a Transaction document from a raw CSV row.
 * @param {object}  row
 * @param {number}  rowIndex
 * @param {string}  source       'user' | 'exchange'
 * @param {string}  runId
 * @param {Array}   qualityIssues
 * @returns {object}  plain object ready for Mongoose insertion
 */
function buildTransactionDoc(row, rowIndex, source, runId, qualityIssues) {
  const rawTimestamp = String(row.timestamp || '').trim();
  const parsedTimestamp = rawTimestamp ? new Date(rawTimestamp) : null;
  const validTimestamp = parsedTimestamp && !isNaN(parsedTimestamp.getTime())
    ? parsedTimestamp
    : null;

  const rawQty = String(row.quantity || '').trim();
  const parsedQty = rawQty ? parseFloat(rawQty) : null;
  const validQty = parsedQty !== null && !isNaN(parsedQty) && parsedQty >= 0
    ? parsedQty
    : null;

  return {
    runId,
    source,
    rawTransactionId: String(row.transaction_id || '').trim() || null,
    rawTimestamp: rawTimestamp || null,
    rawType: String(row.type || '').trim() || null,
    rawAsset: String(row.asset || '').trim() || null,
    rawQuantity: rawQty || null,
    rawPriceUsd: String(row.price_usd || '').trim() || null,
    rawFee: String(row.fee || '').trim() || null,
    rawNote: String(row.note || '').trim() || null,
    rawRowIndex: rowIndex,

    transactionId: String(row.transaction_id || '').trim() || null,
    timestamp: validTimestamp,
    type: normalizeType(row.type),
    asset: normalizeAsset(row.asset),
    quantity: validQty,
    priceUsd: row.price_usd ? parseFloat(row.price_usd) || null : null,
    fee: row.fee ? parseFloat(row.fee) || null : null,
    note: String(row.note || '').trim() || null,

    isValid: qualityIssues.length === 0,
    qualityIssues,
  };
}

/**
 * Ingest a CSV file into MongoDB.
 *
 * Strategy:
 *  - Parse all rows
 *  - Validate each row, collecting quality issues (never silently drop)
 *  - Detect duplicate transaction IDs within the file; flag subsequent occurrences
 *  - Bulk-insert everything (valid + invalid) so nothing is lost
 *
 * @param {string}  filePath   absolute path to the CSV
 * @param {'user'|'exchange'} source
 * @param {string}  runId
 * @returns {Promise<{total, valid, invalid, docs}>}
 */
async function ingestCsv(filePath, source, runId) {
  logger.info(`Ingesting ${source} CSV`, { filePath, runId });

  const parsedRows = await parseCsv(filePath);
  const seenIds = new Map(); // transactionId → rowIndex of first occurrence
  const docs = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const { rowIndex, row } of parsedRows) {
    const issues = validateRow(row);

    // Duplicate ID detection
    const txId = String(row.transaction_id || '').trim();
    if (txId) {
      if (seenIds.has(txId)) {
        issues.push({
          code: DATA_QUALITY_ISSUES.DUPLICATE_ID,
          message: `Duplicate transaction_id '${txId}' – first seen at row ${seenIds.get(txId)}`,
          field: 'transaction_id',
          rawValue: txId,
        });
      } else {
        seenIds.set(txId, rowIndex);
      }
    }

    if (issues.length > 0) {
      logger.warn(`Data quality issue in ${source} row ${rowIndex}`, {
        runId,
        rowIndex,
        transactionId: txId || '(missing)',
        issues: issues.map((i) => i.code),
      });
      invalidCount++;
    } else {
      validCount++;
    }

    docs.push(buildTransactionDoc(row, rowIndex, source, runId, issues));
  }

  // Bulk insert for performance
  if (docs.length > 0) {
    await Transaction.insertMany(docs, { ordered: false });
  }

  logger.info(`Ingestion complete for ${source}`, {
    runId,
    total: parsedRows.length,
    valid: validCount,
    invalid: invalidCount,
  });

  return {
    total: parsedRows.length,
    valid: validCount,
    invalid: invalidCount,
    docs,
  };
}

module.exports = { ingestCsv };
