const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const tokenService = require('../services/tokenService');

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  let decoded;
  try {
    decoded = tokenService.verifyAccessToken(token);
  } catch {
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }

  const currentUser = await User.findById(decoded.userId).select('+role');
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  if (currentUser.isBlocked) {
    return next(new AppError('Your account has been blocked. Please contact support.', 403));
  }

  if (currentUser.lockUntil && currentUser.lockUntil > Date.now()) {
    return next(new AppError('Account is temporarily locked. Please try again later.', 403));
  }

  req.user = currentUser;
  req.isAuthenticated = true;
  next();
});

exports.checkAuth = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    req.user = null;
    req.isAuthenticated = false;
    return next();
  }

  try {
    const decoded = tokenService.verifyAccessToken(token);
    const currentUser = await User.findById(decoded.userId).select('+role');
    
    if (currentUser && !currentUser.isBlocked && !(currentUser.lockUntil && currentUser.lockUntil > Date.now())) {
      req.user = currentUser;
      req.isAuthenticated = true;
    } else {
      req.user = null;
      req.isAuthenticated = false;
    }
  } catch {
    req.user = null;
    req.isAuthenticated = false;
  }
  next();
});

/**
 * resolveCustomerAuth
 * 
 * Customer bookings & payments on Rio Party House support guest reservations.
 * If an authenticated user token is present, attaches req.user.
 * Guest customers receive a private profile associated with the server-side browser session.
 */
exports.resolveCustomerAuth = catchAsync(async (req, res, next) => {
  req.isAuthenticated = false;
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (token) {
    try {
      const decoded = tokenService.verifyAccessToken(token);
      const currentUser = await User.findById(decoded.userId).select('+role');
      if (currentUser && !currentUser.isBlocked) {
        req.user = currentUser;
        req.isAuthenticated = true;
        return next();
      }
    } catch {
      // Continue to guest resolution if token expired or invalid
    }
  }

  // Resolve or create a guest profile for this browser session without matching account credentials.
  const details = req.body?.customerDetails || (req.body?.bookings && req.body.bookings[0]?.customerDetails);
  const name = (details?.name || req.body?.name || 'Guest Customer').trim();

  if (req.bookingSessionId && (details || req.body?.email || req.body?.phone)) {
    let guestUser = await User.findOne({ bookingSessionId: req.bookingSessionId }).select('+role');

    if (!guestUser) {
      const crypto = require('crypto');
      try {
        guestUser = await User.create({
          name: name || 'Guest Customer',
          email: `guest-${crypto.randomBytes(16).toString('hex')}@sessions.riopartyhouse.in`,
          phone: `9${crypto.randomInt(100000000, 1000000000)}`,
          password: `GuestA1@${crypto.randomBytes(8).toString('hex')}`,
          role: 'customer',
          isVerified: true,
          bookingSessionId: req.bookingSessionId,
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        guestUser = await User.findOne({ bookingSessionId: req.bookingSessionId }).select('+role');
        if (!guestUser) throw error;
      }
    }

    req.user = guestUser;
    return next();
  }

  req.user = null;
  req.isAuthenticated = false;
  next();
});

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};
