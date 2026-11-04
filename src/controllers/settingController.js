const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const settingService = require('../services/settingService');
const Setting = require('../models/Setting');

/**
 * Public endpoint: Get booking payment settings (e.g. advance payment amount)
 */
exports.getPublicPaymentSettings = catchAsync(async (req, res) => {
  const advanceAmount = await settingService.getAdvancePaymentAmount();
  res.status(200).json({
    success: true,
    data: {
      advancePaymentAmount: advanceAmount,
    },
  });
});

/**
 * Admin endpoint: Get all settings or payment settings
 */
exports.getAdminSettings = catchAsync(async (req, res) => {
  const advanceAmount = await settingService.getAdvancePaymentAmount();
  const settingDoc = await Setting.findOne({ key: 'advancePaymentAmount' }).populate('updatedBy', 'name email');

  res.status(200).json({
    success: true,
    data: {
      advancePaymentAmount: advanceAmount,
      updatedAt: settingDoc?.updatedAt,
      updatedBy: settingDoc?.updatedBy,
    },
  });
});

/**
 * Admin endpoint: Update advance payment amount setting
 */
exports.updateAdvancePaymentSetting = catchAsync(async (req, res, next) => {
  const { advancePaymentAmount } = req.body;

  if (advancePaymentAmount === undefined || advancePaymentAmount === null) {
    return next(new AppError('advancePaymentAmount is required', 400));
  }

  const num = Number(advancePaymentAmount);
  if (isNaN(num) || num < 0) {
    return next(new AppError('advancePaymentAmount must be a valid non-negative number', 400));
  }

  const setting = await settingService.setSetting(
    'advancePaymentAmount',
    num,
    'Default booking advance payment amount in INR',
    req.user?._id
  );

  res.status(200).json({
    success: true,
    message: 'Advance payment setting updated successfully',
    data: {
      advancePaymentAmount: setting.value,
      updatedAt: setting.updatedAt,
    },
  });
});

