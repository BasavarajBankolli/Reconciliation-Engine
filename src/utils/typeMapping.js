'use strict';

/**
 * Canonical type values used internally.
 */
const TYPES = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
});

/**
 * Raw type string → canonical type (uppercase, trimmed).
 * Extend this map to cover any exchange-specific labels.
 */
const TYPE_ALIAS_MAP = {
  BUY: TYPES.BUY,
  PURCHASE: TYPES.BUY,
  SELL: TYPES.SELL,
  SALE: TYPES.SELL,
  TRANSFER_IN: TYPES.TRANSFER_IN,
  'TRANSFER-IN': TYPES.TRANSFER_IN,
  TRANSFERIN: TYPES.TRANSFER_IN,
  RECEIVE: TYPES.TRANSFER_IN,
  DEPOSIT: TYPES.DEPOSIT,
  TRANSFER_OUT: TYPES.TRANSFER_OUT,
  'TRANSFER-OUT': TYPES.TRANSFER_OUT,
  TRANSFEROUT: TYPES.TRANSFER_OUT,
  SEND: TYPES.TRANSFER_OUT,
  WITHDRAWAL: TYPES.WITHDRAWAL,
  WITHDRAW: TYPES.WITHDRAWAL,
};

/**
 * Pairs that represent the same real-world event from opposite
 * perspectives (user side vs exchange side).
 */
const PERSPECTIVE_PAIRS = [
  [TYPES.TRANSFER_OUT, TYPES.TRANSFER_IN],
  [TYPES.WITHDRAWAL, TYPES.DEPOSIT],
];

/**
 * Normalise a raw type string to its canonical form.
 * Returns null for unknown types so callers can flag the row.
 * @param {string} raw
 * @returns {string|null}
 */
function normalizeType(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  return TYPE_ALIAS_MAP[upper] || null;
}

/**
 * Return true if typeA and typeB match, considering:
 *  1. Exact canonical match.
 *  2. Opposite-perspective pairs (e.g. TRANSFER_OUT ↔ TRANSFER_IN).
 * @param {string} typeA  canonical
 * @param {string} typeB  canonical
 * @returns {boolean}
 */
function typesMatch(typeA, typeB) {
  if (typeA === typeB) return true;
  for (const [a, b] of PERSPECTIVE_PAIRS) {
    if ((typeA === a && typeB === b) || (typeA === b && typeB === a)) return true;
  }
  return false;
}

module.exports = { TYPES, normalizeType, typesMatch };
