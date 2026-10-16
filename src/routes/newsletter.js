const express = require('express');
const rateLimit = require('express-rate-limit');
const newsletterController = require('../controllers/newsletterController');

// Rate limiter for newsletter subscription: max 5 requests per 10 minutes per IP
const newsletterLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many subscription attempts from this IP, please try again in a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

router.post('/subscribe', newsletterLimiter, newsletterController.subscribe);
router.post('/unsubscribe', newsletterController.unsubscribe);

module.exports = router;
