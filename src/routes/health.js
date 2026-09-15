const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

/**
 * @route   GET /api/v1/health
 * @desc    Check server health and database connection
 * @access  Public
 */
router.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const dbHost = mongoose.connection.host || 'N/A';

  res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m ${Math.floor(process.uptime() % 60)}s`,
    database: {
      status: dbStatus,
      host: dbHost,
    },
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

/**
 * @route   GET /api/v1/health/ready
 * @desc    Kubernetes readiness probe
 * @access  Public
 */
router.get('/health/ready', async (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;

  if (!dbReady) {
    return res.status(503).json({
      success: false,
      message: 'Database not ready',
      database: 'disconnected',
    });
  }

  res.status(200).json({
    success: true,
    message: 'Service is ready',
  });
});

/**
 * @route   GET /api/v1/health/live
 * @desc    Kubernetes liveness probe
 * @access  Public
 */
router.get('/health/live', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Service is alive',
  });
});

module.exports = router;
