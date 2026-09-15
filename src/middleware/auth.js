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
