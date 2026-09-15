const crypto = require('crypto');
const AppError = require('../utils/AppError');

/**
 * Verify Razorpay webhook signature
 * Must be used before handling webhook requests
 */
exports.verifyRazorpayWebhook = (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      return next(new AppError('Missing webhook signature', 400));
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return next(new AppError('Webhook secret not configured', 500));
    }

    // Generate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    // Compare signatures
    if (signature !== expectedSignature) {
      return next(new AppError('Invalid webhook signature', 401));
    }

    // Signature is valid, proceed
    next();
  } catch (error) {
    next(new AppError('Webhook verification failed', 500));
  }
};
