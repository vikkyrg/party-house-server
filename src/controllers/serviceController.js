const Service = require('../models/Service');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
// Removed cloudinary

// @desc    Get all services
// @route   GET /api/v1/services
// @access  Public
exports.getServices = catchAsync(async (req, res, next) => {
  const reqQuery = { ...req.query };
  const removeFields = ['select', 'sort', 'page', 'limit'];
  removeFields.forEach((param) => delete reqQuery[param]);

  let queryStr = JSON.stringify(reqQuery);
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (match) => `$${match}`);
  
  let query = Service.find(JSON.parse(queryStr));

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('sortOrder -createdAt');
  }

  const services = await query;

  res.status(200).json({
    success: true,
    count: services.length,
    data: services,
  });
});

// @desc    Add service
// @route   POST /api/v1/services
// @access  Private/Admin
exports.addService = catchAsync(async (req, res, next) => {
  if (!req.file && !req.body.image) {
    return next(new AppError(`Please upload a file`, 400));
  }

  const data = { ...req.body };
  if (data.features && typeof data.features === 'string') {
    data.features = JSON.parse(data.features);
  }

  if (req.file) {
    const base64Data = req.file.buffer.toString('base64');
    data.image = `data:${req.file.mimetype};base64,${base64Data}`;
  }

  const service = await Service.create(data);

  res.status(201).json({
    success: true,
    data: service,
  });
});

// @desc    Update service
// @route   PUT /api/v1/services/:id
// @access  Private/Admin
exports.updateService = catchAsync(async (req, res, next) => {
  let service = await Service.findById(req.params.id);

  if (!service) {
    return next(new AppError(`Service not found with id of ${req.params.id}`, 404));
  }

  const data = { ...req.body };
  if (data.features && typeof data.features === 'string') {
    data.features = JSON.parse(data.features);
  }

  if (req.file) {
    const base64Data = req.file.buffer.toString('base64');
    data.image = `data:${req.file.mimetype};base64,${base64Data}`;
  }

  service = await Service.findByIdAndUpdate(req.params.id, data, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: service,
  });
});

// @desc    Delete service
// @route   DELETE /api/v1/services/:id
// @access  Private/Admin
exports.deleteService = catchAsync(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new AppError(`Service not found with id of ${req.params.id}`, 404));
  }



  await service.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});
