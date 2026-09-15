const rateLimit = require('express-rate-limit');

exports.apiLimiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again in an hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

exports.authLimiter = rateLimit({
  max: 50,
  windowMs: 60 * 1000,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
