const City = require('../models/City');
const Location = require('../models/Location');
const Theater = require('../models/Theater');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');
const { createAuditLog } = require('../services/auditService');

exports.getCities = catchAsync(async (req, res) => {
  const filter = req.query.includeInactive ? {} : { isActive: true };
  const cities = await City.find(filter).sort('name');
  res.json({ success: true, count: cities.length, data: cities });
});

exports.getCity = catchAsync(async (req, res, next) => {
  const city = await City.findById(req.params.id);
  if (!city) return next(new AppError('City not found', 404));
  res.json({ success: true, data: city });
});

exports.getCityLocations = catchAsync(async (req, res, next) => {
  const city = await City.findById(req.params.id);
  if (!city) return next(new AppError('City not found', 404));

  const locations = await Location.find({ city: req.params.id, isActive: true }).sort('name');
  res.json({ success: true, count: locations.length, data: locations });
});

exports.createCity = catchAsync(async (req, res) => {
  const cityData = { ...req.body };

  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'cities');
    cityData.image = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const city = await City.create(cityData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'City',
    modelId: city._id,
    changes: { after: city.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: city });
});

exports.updateCity = catchAsync(async (req, res, next) => {
  const existing = await City.findById(req.params.id);
  if (!existing) return next(new AppError('City not found', 404));

  const before = existing.toObject();

  if (req.file) {
    if (existing.image?.publicId) await deleteFromCloudinary(existing.image.publicId);
    const uploaded = await uploadToCloudinary(req.file, 'cities');
    req.body.image = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const city = await City.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'City',
    modelId: city._id,
    changes: { before, after: city.toObject() },
    req,
  });

  res.json({ success: true, data: city });
});

exports.deleteCity = catchAsync(async (req, res, next) => {
  const city = await City.findById(req.params.id);
  if (!city) return next(new AppError('City not found', 404));

  // Safe-deletion check
  const locationCount = await Location.countDocuments({ city: city._id });
  const theaterCount = await Theater.countDocuments({ city: city._id });
  if (locationCount > 0 || theaterCount > 0) {
    return next(
      new AppError(
        `Cannot delete city with ${locationCount} locations and ${theaterCount} theaters. Deactivate instead.`,
        400
      )
    );
  }

  if (city.image?.publicId) await deleteFromCloudinary(city.image.publicId);
  await city.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'City',
    modelId: city._id,
    changes: { before: city.toObject() },
    req,
  });

  res.json({ success: true, message: 'City deleted successfully' });
});
