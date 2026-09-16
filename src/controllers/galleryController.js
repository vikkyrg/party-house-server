const Gallery = require('../models/Gallery');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');
const { createAuditLog } = require('../services/auditService');

exports.getGalleryItems = catchAsync(async (req, res) => {
  const filter = req.query.includeInactive ? {} : { isActive: true };
  if (req.query.category) filter.category = req.query.category;

  const items = await Gallery.find(filter).sort('sortOrder -createdAt');
  res.json({ success: true, count: items.length, data: items });
});

exports.getGalleryItem = catchAsync(async (req, res, next) => {
  const item = await Gallery.findById(req.params.id);
  if (!item) return next(new AppError('Gallery item not found', 404));
  res.json({ success: true, data: item });
});

exports.createGalleryItem = catchAsync(async (req, res, next) => {
  const itemData = { ...req.body, createdBy: req.user._id };

  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'gallery');
    itemData.image = { url: uploaded.url, publicId: uploaded.publicId, alt: itemData.title };
  } else {
    return next(new AppError('Gallery image is required', 400));
  }

  const item = await Gallery.create(itemData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'Gallery',
    modelId: item._id,
    changes: { after: item.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: item });
});

exports.updateGalleryItem = catchAsync(async (req, res, next) => {
  const existing = await Gallery.findById(req.params.id);
  if (!existing) return next(new AppError('Gallery item not found', 404));

  const before = existing.toObject();

  if (req.file) {
    if (existing.image?.publicId) await deleteFromCloudinary(existing.image.publicId);
    const uploaded = await uploadToCloudinary(req.file, 'gallery');
    req.body.image = { url: uploaded.url, publicId: uploaded.publicId, alt: req.body.title || existing.title };
  }

  const item = await Gallery.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Gallery',
    modelId: item._id,
    changes: { before, after: item.toObject() },
    req,
  });

  res.json({ success: true, data: item });
});

exports.deleteGalleryItem = catchAsync(async (req, res, next) => {
  const item = await Gallery.findById(req.params.id);
  if (!item) return next(new AppError('Gallery item not found', 404));

  if (item.image?.publicId) await deleteFromCloudinary(item.image.publicId);
  await item.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'Gallery',
    modelId: item._id,
    changes: { before: item.toObject() },
    req,
  });

  res.json({ success: true, message: 'Gallery item deleted successfully' });
});

exports.toggleGalleryStatus = catchAsync(async (req, res, next) => {
  const item = await Gallery.findById(req.params.id);
  if (!item) return next(new AppError('Gallery item not found', 404));

  const before = { isActive: item.isActive };
  item.isActive = !item.isActive;
  await item.save();

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Gallery',
    modelId: item._id,
    changes: { before, after: { isActive: item.isActive } },
    req,
  });

  res.json({ success: true, data: item });
});
