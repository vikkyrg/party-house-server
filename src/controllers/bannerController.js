const Banner = require('../models/Banner');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');
const { createAuditLog } = require('../services/auditService');

exports.getBanners = catchAsync(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.position) filter.position = req.query.position;

  const now = new Date();
  const banners = await Banner.find({
    ...filter,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
    ]
  }).sort('-priority');

  res.json({ success: true, count: banners.length, data: banners });
});

exports.getBanner = catchAsync(async (req, res, next) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) return next(new AppError('Banner not found', 404));
  res.json({ success: true, data: banner });
});

exports.createBanner = catchAsync(async (req, res, next) => {
  const bannerData = { ...req.body, createdBy: req.user._id };

  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'banners');
    bannerData.image = { url: uploaded.url, publicId: uploaded.publicId };
  } else if (!bannerData.image?.url) {
    return next(new AppError('Banner image is required', 400));
  }

  const banner = await Banner.create(bannerData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'Banner',
    modelId: banner._id,
    changes: { after: banner.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: banner });
});

exports.updateBanner = catchAsync(async (req, res, next) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) return next(new AppError('Banner not found', 404));

  const before = banner.toObject();

  if (req.file) {
    if (banner.image?.publicId) await deleteFromCloudinary(banner.image.publicId);
    const uploaded = await uploadToCloudinary(req.file, 'banners');
    req.body.image = { url: uploaded.url, publicId: uploaded.publicId };
  }

  Object.assign(banner, req.body);
  await banner.save();

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Banner',
    modelId: banner._id,
    changes: { before, after: banner.toObject() },
    req,
  });

  res.json({ success: true, data: banner });
});

exports.deleteBanner = catchAsync(async (req, res, next) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) return next(new AppError('Banner not found', 404));

  if (banner.image?.publicId) await deleteFromCloudinary(banner.image.publicId);
  await banner.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'Banner',
    modelId: banner._id,
    changes: { before: banner.toObject() },
    req,
  });

  res.json({ success: true, message: 'Banner deleted successfully' });
});

exports.toggleBannerStatus = catchAsync(async (req, res, next) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) return next(new AppError('Banner not found', 404));

  const before = { isActive: banner.isActive };
  banner.isActive = !banner.isActive;
  await banner.save();

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Banner',
    modelId: banner._id,
    changes: { before, after: { isActive: banner.isActive } },
    req,
  });

  res.json({ success: true, data: banner });
});
