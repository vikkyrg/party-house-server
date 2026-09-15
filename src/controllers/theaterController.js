const Theater = require('../models/Theater');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');
const { createAuditLog } = require('../services/auditService');

exports.getTheaters = catchAsync(async (req, res) => {
  const filter = {};
  if (!req.query.includeInactive) filter.isActive = true;
  if (req.query.city) filter.city = req.query.city;
  if (req.query.location) filter.location = req.query.location;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { address: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;
  const sort = req.query.sort || '-createdAt';

  const [theaters, total] = await Promise.all([
    Theater.find(filter)
      .populate('city', 'name code')
      .populate('location', 'name')
      .populate('eventTypes', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Theater.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: theaters.length,
    data: theaters,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

exports.getTheater = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.id)
    .populate('city', 'name code')
    .populate('location', 'name pincode')
    .populate('eventTypes', 'name description basePrice');

  if (!theater) return next(new AppError('Theater not found', 404));
  res.json({ success: true, data: theater });
});

exports.getTheaterAvailability = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.id);
  if (!theater) return next(new AppError('Theater not found', 404));

  const { date } = req.query;
  if (!date) return next(new AppError('Date is required', 400));

  const bookingDate = new Date(date);
  bookingDate.setHours(0, 0, 0, 0);

  const bookedSlots = await Booking.find({
    theater: req.params.id,
    date: bookingDate,
    status: { $nin: ['cancelled', 'no-show'] },
  }).select('timeSlot status');

  const bookedSlotIds = bookedSlots.map(b => b.timeSlot);

  const standardSlots = [
    { id: 'morning', time: '10:00 AM – 1:00 PM', available: !bookedSlotIds.includes('morning') },
    { id: 'afternoon', time: '2:00 PM – 5:00 PM', available: !bookedSlotIds.includes('afternoon') },
    { id: 'evening', time: '6:00 PM – 9:00 PM', available: !bookedSlotIds.includes('evening') },
    { id: 'night', time: '9:30 PM – 12:30 AM', available: !bookedSlotIds.includes('night') },
  ];

  res.json({ success: true, data: { theater: theater.name, date: bookingDate, slots: standardSlots } });
});

exports.getTheaterReviews = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.id);
  if (!theater) return next(new AppError('Theater not found', 404));

  const reviews = await Review.find({ theater: req.params.id, isApproved: true })
    .populate('user', 'name profileImage')
    .sort('-createdAt');

  res.json({ success: true, count: reviews.length, data: reviews });
});

exports.createTheater = catchAsync(async (req, res) => {
  const theaterData = { ...req.body };

  if (req.files?.length) {
    theaterData.images = [];
    for (const file of req.files) {
      const uploaded = await uploadToCloudinary(file, 'theaters');
      theaterData.images.push({ url: uploaded.url, publicId: uploaded.publicId });
    }
  }

  const theater = await Theater.create(theaterData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'Theater',
    modelId: theater._id,
    changes: { after: theater },
    req,
  });

  res.status(201).json({ success: true, data: theater });
});

exports.updateTheater = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.id);
  if (!theater) return next(new AppError('Theater not found', 404));

  const before = theater.toObject();
  Object.assign(theater, req.body);

  if (req.files?.length) {
    for (const file of req.files) {
      const uploaded = await uploadToCloudinary(file, 'theaters');
      theater.images.push({ url: uploaded.url, publicId: uploaded.publicId });
    }
  }

  await theater.save();

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Theater',
    modelId: theater._id,
    changes: { before, after: theater },
    req,
  });

  res.json({ success: true, data: theater });
});

exports.deleteTheater = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.id);
  if (!theater) return next(new AppError('Theater not found', 404));

  for (const img of theater.images) {
    if (img.publicId) await deleteFromCloudinary(img.publicId);
  }

  await theater.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'Theater',
    modelId: theater._id,
    req,
  });

  res.json({ success: true, message: 'Theater deleted successfully' });
});

exports.toggleTheaterStatus = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.id);
  if (!theater) return next(new AppError('Theater not found', 404));

  theater.isActive = !theater.isActive;
  await theater.save();

  res.json({
    success: true,
    message: `Theater ${theater.isActive ? 'activated' : 'deactivated'}`,
    data: theater,
  });
});
