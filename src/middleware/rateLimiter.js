const rateLimit = require('express-rate-limit');

exports.apiLimiter = rateLimit({
  max: 5000,
  windowMs: 15 * 60 * 1000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

exports.authLimiter = rateLimit({
  max: 500,
  windowMs: 15 * 60 * 1000,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
