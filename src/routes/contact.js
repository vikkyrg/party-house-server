const express = require('express');
const contactMessageController = require('../controllers/contactMessageController');
const validateRequest = require('../middleware/validateRequest');
const { createContactMessageSchema } = require('../validators/contactMessageValidator');
const rateLimit = require('express-rate-limit');

// Rate limiter for contact submissions: max 5 messages per 15 minutes per IP
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many messages submitted from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

router.post(
  '/',
  contactLimiter,
  validateRequest(createContactMessageSchema),
  contactMessageController.submitContactMessage
);

module.exports = router;
