const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  const uri =
    process.env.NODE_ENV === 'test' ? process.env.MONGODB_URI_TEST : process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MongoDB URI is not defined in environment variables');
  }

  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  let retries = 5;

  while (retries > 0) {
    try {
      const conn = await mongoose.connect(uri, options);
      logger.info(`MongoDB connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      retries -= 1;
      logger.error(`MongoDB connection failed. Retries left: ${retries}`, error.message);
      if (retries === 0) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
};

const disconnectDB = async () => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};

module.exports = { connectDB, disconnectDB };
