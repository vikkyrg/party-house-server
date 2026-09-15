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

exports.createAddOn = catchAsync(async (req, res) => {
  const addOn = await AddOn.create(req.body);

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

  const before = existing.toObject();
  const addOn = await AddOn.findByIdAndUpdate(req.params.id, req.body, {
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
