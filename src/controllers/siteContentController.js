const SiteContent = require('../models/SiteContent');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all site content
// @route   GET /api/v1/site-content
// @access  Public
exports.getAllSiteContent = asyncHandler(async (req, res, next) => {
  const content = await SiteContent.find();
  res.status(200).json({
    success: true,
    count: content.length,
    data: content,
  });
});

// @desc    Get site content by type
// @route   GET /api/v1/site-content/:type
// @access  Public
exports.getSiteContentByType = asyncHandler(async (req, res, next) => {
  const content = await SiteContent.findOne({ type: req.params.type });
  
  if (!content) {
    return next(new ErrorResponse(`Content not found with type of ${req.params.type}`, 404));
  }

  res.status(200).json({
    success: true,
    data: content,
  });
});

// @desc    Create or update site content
// @route   PUT /api/v1/site-content/:type
// @access  Private/Admin
exports.upsertSiteContent = asyncHandler(async (req, res, next) => {
  let content = await SiteContent.findOne({ type: req.params.type });

  if (content) {
    content.data = req.body.data;
    await content.save();
  } else {
    content = await SiteContent.create({
      type: req.params.type,
      data: req.body.data,
    });
  }

  res.status(200).json({
    success: true,
    data: content,
  });
});
