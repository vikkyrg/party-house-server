const crypto = require('crypto');
const Subscriber = require('../models/Subscriber');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Email regex validation
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * @desc    Subscribe an email address to the newsletter
 * @route   POST /api/newsletter/subscribe or /api/v1/newsletter/subscribe
 * @access  Public
 */
exports.subscribe = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return next(new AppError('Please provide a valid email address.', 400));
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 254) {
    return next(new AppError('Please enter a valid email address format (e.g. name@example.com).', 400));
  }

  // Check if subscriber already exists
  const existingSubscriber = await Subscriber.findOne({ email: normalizedEmail });

  if (existingSubscriber) {
    if (existingSubscriber.status === 'subscribed') {
      return res.status(200).json({
        success: true,
        alreadySubscribed: true,
        message: "You're already subscribed! Thank you for staying connected with Rio Party House.",
        data: {
          email: existingSubscriber.email,
          status: existingSubscriber.status,
        },
      });
    }

    // Re-subscribe if previously unsubscribed
    existingSubscriber.status = 'subscribed';
    existingSubscriber.subscribedAt = new Date();
    existingSubscriber.unsubscribedAt = undefined;
    existingSubscriber.consentGiven = true;
    existingSubscriber.ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    existingSubscriber.userAgent = req.headers['user-agent'] || '';
    await existingSubscriber.save();

    return res.status(200).json({
      success: true,
      message: 'Welcome back! You have successfully resubscribed to our updates.',
      data: {
        email: existingSubscriber.email,
        status: existingSubscriber.status,
      },
    });
  }

  // Create new subscription record
  const newSubscriber = await Subscriber.create({
    email: normalizedEmail,
    status: 'subscribed',
    source: req.body.source || 'website_footer',
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] || '',
    consentGiven: true,
    subscribedAt: new Date(),
    unsubscribeToken: crypto.randomBytes(24).toString('hex'),
  });

  return res.status(201).json({
    success: true,
    message: 'Thank you for subscribing! You are now on our list for exclusive offers and updates.',
    data: {
      email: newSubscriber.email,
      status: newSubscriber.status,
    },
  });
});

/**
 * @desc    Unsubscribe an email address
 * @route   POST /api/newsletter/unsubscribe or /api/v1/newsletter/unsubscribe
 * @access  Public
 */
exports.unsubscribe = catchAsync(async (req, res, next) => {
  const { email, token } = req.body;

  if (!email && !token) {
    return next(new AppError('Please provide your email address or unsubscribe token.', 400));
  }

  const query = {};
  if (token) query.unsubscribeToken = token;
  else if (email) query.email = email.trim().toLowerCase();

  const subscriber = await Subscriber.findOne(query);

  if (!subscriber) {
    return next(new AppError('Subscription record not found.', 404));
  }

  subscriber.status = 'unsubscribed';
  subscriber.unsubscribedAt = new Date();
  await subscriber.save();

  return res.status(200).json({
    success: true,
    message: 'You have been successfully unsubscribed from Rio Party House marketing updates.',
  });
});
