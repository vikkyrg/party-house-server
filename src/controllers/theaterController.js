const Theater = require('../models/Theater');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
require('../models/Room');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToRawData, deleteFromCloudinary } = require('../services/fileService');
const { createAuditLog } = require('../services/auditService');

exports.getTheaters = catchAsync(async (req, res) => {
  const filter = {};
  if (!req.query.includeInactive) filter.isActive = true;
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
      .populate('location', 'name')
      .populate('rooms', '_id isActive')
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
    .populate('location', 'name pincode')
    .populate('rooms', '_id name capacity basePrice additionalGuestPrice isActive')
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

  let standardSlots = [];
  if (theater.slots && theater.slots.length > 0) {
    const parseTime = (timeStr) => {
      if (!timeStr) return 0;
      const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!match) return 0;
      let [_, hours, minutes, modifier] = match;
      hours = parseInt(hours, 10);
      if (hours === 12) hours = 0;
      if (modifier.toUpperCase() === 'PM') hours += 12;
      return hours * 60 + parseInt(minutes, 10);
    };

    const sortedSlots = [...theater.slots].sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));

    standardSlots = sortedSlots.map(s => {
      const slotStr = `${s.startTime} - ${s.endTime}`;
      return { id: slotStr, time: slotStr, available: !bookedSlotIds.includes(slotStr) };
    });
  }

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
  ['city', 'capacity', 'pricePerHour', 'additionalGuestPrice', 'theatreVideoUrl', 'branchVideoUrl', 'slots', 'eventTypes'].forEach((field) => delete theaterData[field]);

  if (typeof theaterData.slots === 'string') {
    try {
      theaterData.slots = JSON.parse(theaterData.slots);
    } catch (err) {
      theaterData.slots = [];
    }
  }

  if (req.files?.length) {
    theaterData.images = [];
    for (const file of req.files) {
      const uploaded = await uploadToRawData(file);
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
  ['city', 'capacity', 'pricePerHour', 'additionalGuestPrice', 'theatreVideoUrl', 'branchVideoUrl', 'slots', 'eventTypes'].forEach((field) => delete req.body[field]);
  
  if (typeof req.body.slots === 'string') {
    try {
      req.body.slots = JSON.parse(req.body.slots);
    } catch (err) {
      req.body.slots = [];
    }
  }

  // Use .set() to ensure Mongoose correctly merges arrays and objects
  theater.set(req.body);

  if (req.files?.length) {
    for (const file of req.files) {
      const uploaded = await uploadToRawData(file);
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
