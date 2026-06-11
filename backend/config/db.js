const mongoose = require('mongoose');
const logger = require('./logger');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/leadcity-sos';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    logger.info('Connected to MongoDB successfully.');
  })
  .catch((err) => {
    logger.error('Failed to connect to MongoDB:', err);
  });

const db = mongoose.connection;

module.exports = { db };
