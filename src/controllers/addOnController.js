const AddOn = require('../models/AddOn');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { createAuditLog } = require('../services/auditService');

exports.getAddOns = catchAsync(async (req, res) => {
  const filter = req.query.includeInactive ? {} : { isActive: true };
  if (req.query.category) filter.category = req.query.category;

  const addOns = await AddOn.find(filter).sort('sortOrder');
  res.json({ success: true, count: addOns.length, data: addOns });
});

exports.getAddOn = catchAsync(async (req, res, next) => {
  const addOn = await AddOn.findById(req.params.id);
  if (!addOn) return next(new AppError('Add-on not found', 404));
  res.json({ success: true, data: addOn });
});

const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');

exports.createAddOn = catchAsync(async (req, res) => {
  const addOnData = { ...req.body };
  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'add-ons');
    addOnData.image = { url: uploaded.url, publicId: uploaded.publicId, alt: addOnData.name };
  } else if (addOnData.image && typeof addOnData.image === 'string' && addOnData.image.startsWith('data:')) {
    addOnData.image = { url: addOnData.image, publicId: 'raw_' + Date.now(), alt: addOnData.name };
  }

  const addOn = await AddOn.create(addOnData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'AddOn',
    modelId: addOn._id,
    changes: { after: addOn.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: addOn });
});

exports.updateAddOn = catchAsync(async (req, res, next) => {
  const existing = await AddOn.findById(req.params.id);
  if (!existing) return next(new AppError('Add-on not found', 404));

  const updateData = { ...req.body };
  if (req.file) {
    if (existing.image?.publicId) await deleteFromCloudinary(existing.image.publicId);
    const uploaded = await uploadToCloudinary(req.file, 'add-ons');
    updateData.image = { url: uploaded.url, publicId: uploaded.publicId, alt: updateData.name || existing.name };
  } else if (updateData.image && typeof updateData.image === 'string' && updateData.image.startsWith('data:')) {
    updateData.image = { url: updateData.image, publicId: 'raw_' + Date.now(), alt: updateData.name || existing.name };
  }

  const before = existing.toObject();
  const addOn = await AddOn.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'AddOn',
    modelId: addOn._id,
    changes: { before, after: addOn.toObject() },
    req,
  });

  res.json({ success: true, data: addOn });
});

exports.deleteAddOn = catchAsync(async (req, res, next) => {
  const addOn = await AddOn.findById(req.params.id);
  if (!addOn) return next(new AppError('Add-on not found', 404));

  // Safe-deletion check
  const bookingCount = await Booking.countDocuments({ 'addOns.addOn': addOn._id });
  if (bookingCount > 0) {
    return next(
      new AppError(
        `Cannot delete add-on used in ${bookingCount} bookings. Deactivate instead.`,
        400
      )
    );
  }

  await addOn.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'AddOn',
    modelId: addOn._id,
    changes: { before: addOn.toObject() },
    req,
  });

  res.json({ success: true, message: 'Add-on deleted successfully' });
});
