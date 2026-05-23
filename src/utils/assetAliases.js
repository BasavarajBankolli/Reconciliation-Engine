'use strict';

/**
 * Canonical asset symbol → set of aliases (all uppercase).
 * Add entries here without touching matching logic.
 */
const ALIAS_MAP = {
  BTC: new Set(['BTC', 'BITCOIN', 'XBT']),
  ETH: new Set(['ETH', 'ETHEREUM', 'ETHER']),
  SOL: new Set(['SOL', 'SOLANA']),
  USDT: new Set(['USDT', 'TETHER']),
  USDC: new Set(['USDC', 'USD COIN']),
  MATIC: new Set(['MATIC', 'POLYGON']),
  LINK: new Set(['LINK', 'CHAINLINK']),
  BNB: new Set(['BNB', 'BINANCE COIN']),
  ADA: new Set(['ADA', 'CARDANO']),
  DOT: new Set(['DOT', 'POLKADOT']),
};

/** Reverse lookup: alias (uppercase) → canonical symbol */
const REVERSE_MAP = {};
for (const [canonical, aliases] of Object.entries(ALIAS_MAP)) {
  for (const alias of aliases) {
    REVERSE_MAP[alias] = canonical;
  }
}

/**
 * Normalise an asset string to its canonical ticker symbol.
 * Falls back to the original (trimmed, uppercased) if no alias is found.
 * @param {string} raw
 * @returns {string}
 */
function normalizeAsset(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  return REVERSE_MAP[upper] || upper;
}

/**
 * Return true if two asset strings refer to the same canonical asset.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function assetsMatch(a, b) {
  return normalizeAsset(a) === normalizeAsset(b);
}

module.exports = { normalizeAsset, assetsMatch };
