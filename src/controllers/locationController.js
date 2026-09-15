const Location = require('../models/Location');
const Theater = require('../models/Theater');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');
const { createAuditLog } = require('../services/auditService');

exports.getLocations = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.city) filter.city = req.query.city;
  if (!req.query.includeInactive) filter.isActive = true;

  const locations = await Location.find(filter).populate('city', 'name code').sort('name');
  res.json({ success: true, count: locations.length, data: locations });
});

exports.getLocation = catchAsync(async (req, res, next) => {
  const location = await Location.findById(req.params.id).populate('city', 'name code');
  if (!location) return next(new AppError('Location not found', 404));
  res.json({ success: true, data: location });
});

exports.createLocation = catchAsync(async (req, res) => {
  const locationData = { ...req.body };

  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'locations');
    locationData.image = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const location = await Location.create(locationData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'Location',
    modelId: location._id,
    changes: { after: location.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: location });
});

exports.updateLocation = catchAsync(async (req, res, next) => {
  const existing = await Location.findById(req.params.id);
  if (!existing) return next(new AppError('Location not found', 404));

  const before = existing.toObject();

  if (req.file) {
    if (existing.image?.publicId) await deleteFromCloudinary(existing.image.publicId);
    const uploaded = await uploadToCloudinary(req.file, 'locations');
    req.body.image = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const location = await Location.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Location',
    modelId: location._id,
    changes: { before, after: location.toObject() },
    req,
  });

  res.json({ success: true, data: location });
});

exports.deleteLocation = catchAsync(async (req, res, next) => {
  const location = await Location.findById(req.params.id);
  if (!location) return next(new AppError('Location not found', 404));

  // Safe-deletion check
  const theaterCount = await Theater.countDocuments({ location: location._id });
  if (theaterCount > 0) {
    return next(
      new AppError(
        `Cannot delete location with ${theaterCount} theaters. Deactivate instead.`,
        400
      )
    );
  }

  if (location.image?.publicId) await deleteFromCloudinary(location.image.publicId);
  await location.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'Location',
    modelId: location._id,
    changes: { before: location.toObject() },
    req,
  });

  res.json({ success: true, message: 'Location deleted successfully' });
});
