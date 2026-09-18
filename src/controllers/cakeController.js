const Cake = require('../models/Cake');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { createAuditLog } = require('../services/auditService');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');

exports.getCakes = catchAsync(async (req, res) => {
  const filter = req.query.includeInactive ? {} : { isActive: true };

  const cakes = await Cake.find(filter).sort('sortOrder');
  res.json({ success: true, count: cakes.length, data: cakes });
});

exports.getCake = catchAsync(async (req, res, next) => {
  const cake = await Cake.findById(req.params.id);
  if (!cake) return next(new AppError('Cake not found', 404));
  res.json({ success: true, data: cake });
});

exports.createCake = catchAsync(async (req, res) => {
  const cakeData = { ...req.body };
  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'cakes');
    cakeData.image = { url: uploaded.url, publicId: uploaded.publicId, alt: cakeData.name };
  } else if (cakeData.image && typeof cakeData.image === 'string' && cakeData.image.startsWith('data:')) {
    cakeData.image = { url: cakeData.image, publicId: 'raw_' + Date.now(), alt: cakeData.name };
  }

  const cake = await Cake.create(cakeData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'Cake',
    modelId: cake._id,
    changes: { after: cake.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: cake });
});

exports.updateCake = catchAsync(async (req, res, next) => {
  const existing = await Cake.findById(req.params.id);
  if (!existing) return next(new AppError('Cake not found', 404));

  const updateData = { ...req.body };
  if (req.file) {
    if (existing.image?.publicId) await deleteFromCloudinary(existing.image.publicId);
    const uploaded = await uploadToCloudinary(req.file, 'cakes');
    updateData.image = { url: uploaded.url, publicId: uploaded.publicId, alt: updateData.name || existing.name };
  } else if (updateData.image && typeof updateData.image === 'string' && updateData.image.startsWith('data:')) {
    updateData.image = { url: updateData.image, publicId: 'raw_' + Date.now(), alt: updateData.name || existing.name };
  }

  const before = existing.toObject();
  const cake = await Cake.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Cake',
    modelId: cake._id,
    changes: { before, after: cake.toObject() },
    req,
  });

  res.json({ success: true, data: cake });
});

exports.deleteCake = catchAsync(async (req, res, next) => {
  const cake = await Cake.findById(req.params.id);
  if (!cake) return next(new AppError('Cake not found', 404));

  // Safe-deletion check
  const bookingCount = await Booking.countDocuments({ 'cake.cakeId': cake._id });
  if (bookingCount > 0) {
    return next(
      new AppError(
        `Cannot delete cake used in ${bookingCount} bookings. Deactivate instead.`,
        400
      )
    );
  }

  await cake.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'Cake',
    modelId: cake._id,
    changes: { before: cake.toObject() },
    req,
  });

  res.json({ success: true, message: 'Cake deleted successfully' });
});
