const User = require('../models/User');
const OTP = require('../models/OTP');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendSMS } = require('../services/smsService');
const appConfig = require('../config/app');
const { generateOTP } = require('../utils/helpers');
const tokenService = require('../services/tokenService');
const { sendEmail } = require('../services/emailService');
const { OTP_EXPIRY_MS } = require('../utils/constants');
const { createAuditLog } = require('../services/auditService');

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isVerified: user.isVerified,
  profileImage: user.profileImage,
  lastLogin: user.lastLogin,
});

exports.register = catchAsync(async (req, res, next) => {
  const { name, email, phone, password } = req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    return next(new AppError('User already exists with this email or phone', 400));
  }

  const user = await User.create({ name, email, phone, password });

  const otp = generateOTP();
  await OTP.create({
    phone,
    otp,
    purpose: 'verification',
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });

  await sendSMS(phone, `[${appConfig.brandName}] Your OTP for verification is: ${otp}`);

  const { accessToken, refreshToken } = tokenService.generateTokens(user._id);
  tokenService.setTokenCookies(res, accessToken, refreshToken);

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your phone.',
    data: {
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
    },
  });
});

exports.verifyOTP = catchAsync(async (req, res, next) => {
  const { phone, otp } = req.body;

  const otpRecord = await OTP.findOne({
    phone,
    otp,
    purpose: 'verification',
    isUsed: false,
  });

  if (!otpRecord || otpRecord.expiresAt < new Date()) {
    return next(new AppError('Invalid or expired OTP', 400));
  }

  await User.findOneAndUpdate({ phone }, { isVerified: true });
  otpRecord.isUsed = true;
  await otpRecord.save();

  res.json({ success: true, message: 'Phone verified successfully' });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, phone, password } = req.body;

  const user = await User.findOne({ $or: [{ email }, { phone }] }).select('+password +role');

  if (!user) {
    return next(new AppError('Invalid credentials', 401));
  }

  if (user.isLocked()) {
    return next(new AppError('Account is temporarily locked. Please try again later.', 403));
  }

  if (user.isBlocked) {
    return next(new AppError('Your account has been blocked. Contact support.', 403));
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.incrementLoginAttempts();
    return next(new AppError('Invalid credentials', 401));
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const { accessToken, refreshToken } = tokenService.generateTokens(user._id);
  tokenService.setTokenCookies(res, accessToken, refreshToken);

  await createAuditLog({
    user: user._id,
    action: 'login',
    model: 'User',
    modelId: user._id,
    req,
  });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
    },
  });
});

exports.logout = catchAsync(async (req, res) => {
  const token = req.headers.authorization?.startsWith('Bearer')
    ? req.headers.authorization.split(' ')[1]
    : req.cookies?.accessToken;

  if (token) tokenService.blacklistToken(token);

  tokenService.clearTokenCookies(res);

  if (req.user) {
    await createAuditLog({
      user: req.user._id,
      action: 'logout',
      model: 'User',
      modelId: req.user._id,
      req,
    });
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
  if (!refreshToken) {
    return next(new AppError('Refresh token is required', 401));
  }

  let decoded;
  try {
    decoded = tokenService.verifyRefreshToken(refreshToken);
  } catch {
    return next(new AppError('Invalid refresh token', 401));
  }

  const user = await User.findById(decoded.userId).select('+role');
  if (!user || user.isBlocked) {
    return next(new AppError('User not found or blocked', 401));
  }

  const tokens = tokenService.generateTokens(user._id);
  tokenService.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

  res.json({
    success: true,
    data: tokens,
  });
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError('No user found with this email address', 404));
  }

  const otp = generateOTP();
  await OTP.create({
    email,
    otp,
    purpose: 'password-reset',
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });

  // Send email
  await sendEmail({
    to: email,
    subject: `Password Reset OTP - ${appConfig.brandName}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>You requested a password reset. Your OTP is:</p>
        <h1 style="color: #8c5211; letter-spacing: 2px;">${otp}</h1>
        <p>This code will expire in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>
    `
  });

  res.json({ success: true, message: 'OTP sent to your email' });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { email, otp, password } = req.body;

  const otpRecord = await OTP.findOne({
    email,
    otp,
    purpose: 'password-reset',
    isUsed: false,
  });

  if (!otpRecord || otpRecord.expiresAt < new Date()) {
    return next(new AppError('Invalid or expired OTP', 400));
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) return next(new AppError('User not found', 404));

  user.password = password;
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  otpRecord.isUsed = true;
  await otpRecord.save();

  res.json({ success: true, message: 'Password reset successful' });
});

exports.changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect', 400));
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Password changed successfully' });
});

exports.getMe = catchAsync(async (req, res) => {
  if (!req.user) {
    return res.json({ success: true, data: null });
  }

  const user = await User.findById(req.user._id).select('+role').populate({
    path: 'bookings',
    select: 'bookingId theater date status pricing.total',
    options: { sort: { createdAt: -1 }, limit: 5 },
  });

  res.json({ success: true, data: { user: sanitizeUser(user) } });
});

exports.updateProfile = catchAsync(async (req, res, next) => {
  const updates = req.body;
  const user = await User.findById(req.user._id);

  if (updates.email && updates.email !== user.email) {
    const exists = await User.findOne({ email: updates.email });
    if (exists) return next(new AppError('Email already in use', 400));
  }

  if (updates.phone && updates.phone !== user.phone) {
    const exists = await User.findOne({ phone: updates.phone });
    if (exists) return next(new AppError('Phone already in use', 400));
  }

  Object.assign(user, updates);
  await user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user: sanitizeUser(user) },
  });
});

exports.deleteAccount = catchAsync(async (req, res) => {
  await User.findByIdAndDelete(req.user._id);
  tokenService.clearTokenCookies(res);
  res.json({ success: true, message: 'Account deleted successfully' });
});
