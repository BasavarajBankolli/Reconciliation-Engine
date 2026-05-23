'use strict';

require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/crypto_reconciler',
  },

  matching: {
    timestampToleranceSeconds: parseFloat(process.env.TIMESTAMP_TOLERANCE_SECONDS) || 300,
    quantityTolerancePct: parseFloat(process.env.QUANTITY_TOLERANCE_PCT) || 0.01,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || 'logs',
  },

  upload: {
    maxFileSizeMb: 50,
    allowedMimeTypes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  },
};

module.exports = config;
