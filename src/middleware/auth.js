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
    return next();
  }

  try {
    const decoded = tokenService.verifyAccessToken(token);
    const currentUser = await User.findById(decoded.userId).select('+role');
    
    if (currentUser && !currentUser.isBlocked && !(currentUser.lockUntil && currentUser.lockUntil > Date.now())) {
      req.user = currentUser;
    } else {
      req.user = null;
    }
  } catch {
    req.user = null;
  }
  next();
});

/**
 * resolveCustomerAuth
 * 
 * Customer bookings & payments on Rio Party House support guest reservations.
 * If an authenticated user token is present, attaches req.user.
 * If no token is provided, checks if an account exists for customerDetails.email/phone
 * or provisions a guest customer record so booking documents maintain referential integrity.
 */
exports.resolveCustomerAuth = catchAsync(async (req, res, next) => {
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
        return next();
      }
    } catch {
      // Continue to guest resolution if token expired or invalid
    }
  }

  // Resolve or create guest customer user profile
  const details = req.body?.customerDetails || (req.body?.bookings && req.body.bookings[0]?.customerDetails);
  const email = (details?.email || req.body?.email || '').trim().toLowerCase();
  const phone = (details?.phone || req.body?.phone || '').trim().replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
  const name = (details?.name || req.body?.name || 'Guest Customer').trim();

  if (email || phone) {
    const query = [];
    if (email) query.push({ email });
    if (phone) query.push({ phone });
    let existingUser = await User.findOne({ $or: query });

    if (!existingUser) {
      const crypto = require('crypto');
      // Must satisfy regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
      const randomPassword = `GuestA1@${crypto.randomBytes(4).toString('hex')}`;
      try {
        existingUser = await User.create({
          name: name || 'Guest Customer',
          email: email || `guest-${Date.now()}@riopartyhouse.in`,
          phone: phone || `9${Math.floor(100000000 + Math.random() * 900000000)}`,
          password: randomPassword,
          role: 'customer',
          isVerified: true,
        });
      } catch (err) {
        // If unique collision occurred concurrently or validation, fetch existing
        existingUser = await User.findOne({ $or: query });
      }
    }

    if (existingUser) {
      req.user = existingUser;
      return next();
    }
  }

  // If bookingId provided on payment/status routes
  if (req.params?.bookingId || req.body?.bookingId) {
    const bookingId = req.params?.bookingId || req.body?.bookingId;
    const booking = await require('../models/Booking').findById(bookingId);
    if (booking && booking.user) {
      const bookingUser = await User.findById(booking.user);
      if (bookingUser) {
        req.user = bookingUser;
        return next();
      }
    }
  }

  // If no email/phone provided yet, proceed with null user or let controller handle validation
  req.user = null;
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
