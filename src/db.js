'use strict';

const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./utils/logger');

let isConnected = false;

async function connect() {
  if (isConnected) return;

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    isConnected = false;
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
    isConnected = true;
  });

  await mongoose.connect(config.mongodb.uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  isConnected = true;
  logger.info('MongoDB connected', { uri: config.mongodb.uri });
}

async function disconnect() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB disconnected gracefully');
}

module.exports = { connect, disconnect };
