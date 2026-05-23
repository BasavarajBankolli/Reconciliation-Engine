'use strict';

const { Transaction } = require('../models/Transaction');
const { ReconciliationResult, RESULT_CATEGORIES } = require('../models/ReconciliationResult');
const { assetsMatch } = require('../utils/assetAliases');
const { typesMatch } = require('../utils/typeMapping');
const logger = require('../utils/logger');

/**
 * Convert a Transaction document to a lightweight snapshot object
 * suitable for embedding in a ReconciliationResult.
 * @param {object|null} tx  Mongoose doc or null
 * @returns {object|null}
 */
function toSnapshot(tx) {
  if (!tx) return null;
  return {
    transactionId: tx.transactionId,
    source: tx.source,
    timestamp: tx.timestamp,
    rawTimestamp: tx.rawTimestamp,
    type: tx.type,
    rawType: tx.rawType,
    asset: tx.asset,
    rawAsset: tx.rawAsset,
    quantity: tx.quantity,
    rawQuantity: tx.rawQuantity,
    priceUsd: tx.priceUsd,
    fee: tx.fee,
    note: tx.note,
    isValid: tx.isValid,
    qualityIssues: tx.qualityIssues || [],
  };
}

/**
 * Compute the absolute difference between two timestamps in seconds.
 * Returns Infinity if either is null/invalid.
 * @param {Date|null} a
 * @param {Date|null} b
 * @returns {number}
 */
function timestampDeltaSeconds(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.getTime() - b.getTime()) / 1000;
}

/**
 * Compute the percentage difference between two quantities relative to
 * the larger of the two.  Returns Infinity if either is null/zero.
 * @param {number|null} a
 * @param {number|null} b
 * @returns {number}
 */
function quantityDeltaPct(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return Infinity;
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return 0;
  return (Math.abs(a - b) / base) * 100;
}

/**
 * Attempt to match a single user transaction against a pool of exchange
 * transactions.  Returns the best match or null.
 *
 * Matching criteria (all must pass):
 *  1. asset   – canonical match (case-insensitive, aliases resolved)
 *  2. type    – canonical match OR perspective-opposite pair
 *  3. timestamp – within tolerance window
 *  4. quantity  – within percentage tolerance
 *
 * Among candidates that satisfy the tolerance window we pick the one with
 * the smallest combined score (normalised timestamp delta + normalised qty delta).
 *
 * @param {object}  userTx            Transaction doc
 * @param {object[]} exchangeCandidates  Transaction docs (pre-filtered by asset bucket)
 * @param {object}  tolerances        { timestampToleranceSeconds, quantityTolerancePct }
 * @returns {{ match: object|null, deltaTs: number, deltaQty: number }}
 */
function findBestMatch(userTx, exchangeCandidates, tolerances) {
  const { timestampToleranceSeconds, quantityTolerancePct } = tolerances;

  let bestMatch = null;
  let bestScore = Infinity;
  let bestDeltaTs = Infinity;
  let bestDeltaQty = Infinity;

  for (const exTx of exchangeCandidates) {
    // Asset must match
    if (!assetsMatch(userTx.asset, exTx.asset)) continue;

    // Type must match
    if (!typesMatch(userTx.type, exTx.type)) continue;

    const dTs = timestampDeltaSeconds(userTx.timestamp, exTx.timestamp);
    const dQty = quantityDeltaPct(userTx.quantity, exTx.quantity);

    /**
     * IMPORTANT:
     * We now allow a wider search window so we can classify
     * nearby transactions as CONFLICTING instead of dropping them.
     */

    const maxTsWindow = timestampToleranceSeconds * 3;
    const maxQtyWindow = quantityTolerancePct * 3;

    if (dTs > maxTsWindow) continue;
    if (dQty > maxQtyWindow) continue;

    // Lower score = better match
    const normTs = dTs / maxTsWindow;
    const normQty = dQty / maxQtyWindow;

    const score = normTs + normQty;

    if (score < bestScore) {
      bestScore = score;
      bestMatch = exTx;
      bestDeltaTs = dTs;
      bestDeltaQty = dQty;
    }
  }

  return {
    match: bestMatch,
    deltaTs: bestDeltaTs,
    deltaQty: bestDeltaQty,
  };
}

/**
 * Determine whether a matched pair is MATCHED or CONFLICTING.
 *
 * A pair is CONFLICTING when the fields that were used to find it land
 * within tolerance but other critical fields (quantity, timestamp) differ
 * beyond tolerance – OR if both transaction IDs are present and they differ
 * (suggesting a cross-file ID mismatch picked up by proximity matching).
 *
 * In practice this means: if the pair was matched by proximity and any key
 * field is outside tolerance we escalate to CONFLICTING.
 *
 * @param {object}  userTx
 * @param {object}  exTx
 * @param {number}  deltaTs
 * @param {number}  deltaQty
 * @param {object}  tolerances
 * @returns {{ category: string, reason: string, conflicts: Array }}
 */
function classifyMatch(userTx, exTx, deltaTs, deltaQty, tolerances) {
  const { timestampToleranceSeconds, quantityTolerancePct } = tolerances;

  const conflicts = [];

  // Timestamp conflict
  if (deltaTs > timestampToleranceSeconds) {
    conflicts.push({
      field: 'timestamp',
      userValue: userTx.timestamp,
      exchangeValue: exTx.timestamp,
      delta: `${deltaTs.toFixed(1)}s`,
      tolerance: `${timestampToleranceSeconds}s`,
    });
  }

  if (deltaQty > quantityTolerancePct) {
    conflicts.push({
      field: 'quantity',
      userValue: userTx.quantity,
      exchangeValue: exTx.quantity,
      delta: `${deltaQty.toFixed(4)}%`,
      tolerance: `${quantityTolerancePct}%`,
    });
  }

  // Optional transactionId mismatch detection
  if (
    userTx.transactionId &&
    exTx.transactionId &&
    userTx.transactionId !== exTx.transactionId
  ) {
    conflicts.push({
      field: 'transactionId',
      userValue: userTx.transactionId,
      exchangeValue: exTx.transactionId,
    });
  }

  // Final classification
  if (conflicts.length > 0) {
    return {
      category: RESULT_CATEGORIES.CONFLICTING,
      reason: `Potential match found but conflicts detected in: ${conflicts
        .map((c) => c.field)
        .join(', ')}`,
      conflicts,
    };
  }

  return {
    category: RESULT_CATEGORIES.MATCHED,
    reason: `Matched within configured tolerances`,
    conflicts: [],
  };
}

/**
 * Main matching algorithm.
 *
 * Algorithm overview:
 *  1. Load all valid transactions for the run from the DB.
 *  2. Build a bucket map: canonical asset → exchange transactions.
 *     This reduces the search from O(n*m) to O(n * avg_bucket_size).
 *  3. For each valid user transaction, search its asset bucket for the
 *     best matching exchange transaction (greedy, closest score).
 *  4. Mark matched exchange transactions as claimed to prevent duplicates.
 *  5. Classify each pair as MATCHED or CONFLICTING.
 *  6. Collect unclaimed exchange transactions as UNMATCHED_EXCHANGE.
 *  7. Invalid rows from either source are marked UNMATCHED with a reason.
 *
 * @param {string} runId
 * @param {object} tolerances  { timestampToleranceSeconds, quantityTolerancePct }
 * @returns {Promise<{matched, conflicting, unmatchedUser, unmatchedExchange}>}
 */
async function runMatching(runId, tolerances) {
  logger.info('Starting matching algorithm', { runId, tolerances });

  // Load valid transactions only for matching; load invalid ones for reporting
  const [userTxs, exchangeTxs] = await Promise.all([
    Transaction.find({ runId, source: 'user' }).lean(),
    Transaction.find({ runId, source: 'exchange' }).lean(),
  ]);

  const validUserTxs = userTxs.filter((t) => t.isValid);
  const invalidUserTxs = userTxs.filter((t) => !t.isValid);
  const validExchangeTxs = exchangeTxs.filter((t) => t.isValid);
  const invalidExchangeTxs = exchangeTxs.filter((t) => !t.isValid);

  logger.info('Transactions loaded for matching', {
    runId,
    validUser: validUserTxs.length,
    invalidUser: invalidUserTxs.length,
    validExchange: validExchangeTxs.length,
    invalidExchange: invalidExchangeTxs.length,
  });

  // ── Build asset buckets for O(1) lookup ───────────────────────────────
  /** @type {Map<string, object[]>} canonical asset → exchange tx list */
  const exchangeBuckets = new Map();
  for (const exTx of validExchangeTxs) {
    const key = exTx.asset || '__unknown__';
    if (!exchangeBuckets.has(key)) exchangeBuckets.set(key, []);
    exchangeBuckets.get(key).push(exTx);
  }

  const claimedExchangeIds = new Set(); // _id strings of matched exchange txs
  const results = [];

  // ── Match valid user transactions ────────────────────────────────────
  for (const userTx of validUserTxs) {
    const bucket = exchangeBuckets.get(userTx.asset) || [];
    const unclaimed = bucket.filter((t) => !claimedExchangeIds.has(String(t._id)));

    const { match, deltaTs, deltaQty } = findBestMatch(userTx, unclaimed, tolerances);

    if (!match) {
      results.push({
        runId,
        category: RESULT_CATEGORIES.UNMATCHED_USER,
        reason: `No exchange transaction found within tolerance window (asset=${userTx.asset}, type=${userTx.type}, ts=${userTx.rawTimestamp})`,
        userTransaction: toSnapshot(userTx),
        exchangeTransaction: null,
        conflicts: [],
      });
      continue;
    }

    claimedExchangeIds.add(String(match._id));
    const { category, reason, conflicts } = classifyMatch(
      userTx,
      match,
      deltaTs,
      deltaQty,
      tolerances,
    );

    results.push({
      runId,
      category,
      reason,
      userTransaction: toSnapshot(userTx),
      exchangeTransaction: toSnapshot(match),
      conflicts,
    });
  }

  // ── Unmatched exchange (valid but unclaimed) ──────────────────────────
  for (const exTx of validExchangeTxs) {
    if (!claimedExchangeIds.has(String(exTx._id))) {
      results.push({
        runId,
        category: RESULT_CATEGORIES.UNMATCHED_EXCHANGE,
        reason: `No matching user transaction found (asset=${exTx.asset}, type=${exTx.type}, ts=${exTx.rawTimestamp})`,
        userTransaction: null,
        exchangeTransaction: toSnapshot(exTx),
        conflicts: [],
      });
    }
  }

  // ── Invalid rows – flag but do not attempt to match ───────────────────
  for (const tx of invalidUserTxs) {
    const issueCodes = tx.qualityIssues.map((i) => i.code).join(', ');
    results.push({
      runId,
      category: RESULT_CATEGORIES.UNMATCHED_USER,
      reason: `Row skipped due to data quality issues: ${issueCodes}`,
      userTransaction: toSnapshot(tx),
      exchangeTransaction: null,
      conflicts: [],
    });
  }

  for (const tx of invalidExchangeTxs) {
    const issueCodes = tx.qualityIssues.map((i) => i.code).join(', ');
    results.push({
      runId,
      category: RESULT_CATEGORIES.UNMATCHED_EXCHANGE,
      reason: `Row skipped due to data quality issues: ${issueCodes}`,
      userTransaction: null,
      exchangeTransaction: toSnapshot(tx),
      conflicts: [],
    });
  }

  // ── Bulk insert results ───────────────────────────────────────────────
  if (results.length > 0) {
    await ReconciliationResult.insertMany(results, { ordered: false });
  }

  const summary = {
    matched: results.filter((r) => r.category === RESULT_CATEGORIES.MATCHED).length,
    conflicting: results.filter((r) => r.category === RESULT_CATEGORIES.CONFLICTING).length,
    unmatchedUser: results.filter((r) => r.category === RESULT_CATEGORIES.UNMATCHED_USER).length,
    unmatchedExchange: results.filter((r) => r.category === RESULT_CATEGORIES.UNMATCHED_EXCHANGE)
      .length,
  };

  logger.info('Matching complete', { runId, ...summary });
  return summary;
}

module.exports = { runMatching };
