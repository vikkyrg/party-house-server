const Booking = require('../models/Booking');
const User = require('../models/User');
const Theater = require('../models/Theater');
const City = require('../models/City');
const Location = require('../models/Location');
const EventType = require('../models/EventType');
const AddOn = require('../models/AddOn');
const Banner = require('../models/Banner');
const Testimonial = require('../models/Testimonial');
const FAQ = require('../models/FAQ');
const Review = require('../models/Review');
const AuditLog = require('../models/AuditLog');
const Service = require('../models/Service');
const Gallery = require('../models/Gallery');
const Story = require('../models/Story');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendEmail } = require('../services/emailService');
const { createAuditLog } = require('../services/auditService');

// Valid booking status transitions
const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in-progress', 'cancelled', 'no-show'],
  'in-progress': ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  'no-show': [],
};

// ─── Dashboard ──────────────────────────────────────────────
exports.getDashboardStats = catchAsync(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    totalBookings,
    totalRevenue,
    totalUsers,
    totalTheaters,
    todayBookings,
    pendingBookings,
    confirmedBookings,
    cancelledBookings,
    activeCities,
    revenueThisMonth,
  ] = await Promise.all([
    Booking.countDocuments(),
    Booking.aggregate([
      { $match: { 'payment.status': 'paid' } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } },
    ]),
    User.countDocuments({ role: 'customer' }),
    Theater.countDocuments({ isActive: true }),
    Booking.countDocuments({
      date: { $gte: today, $lt: tomorrow },
      status: { $nin: ['cancelled'] },
    }),
    Booking.countDocuments({ status: 'pending' }),
    Booking.countDocuments({ status: 'confirmed' }),
    Booking.countDocuments({ status: 'cancelled' }),
    City.countDocuments({ isActive: true }),
    Booking.aggregate([
      {
        $match: {
          'payment.status': 'paid',
          createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) },
        },
      },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalUsers,
      totalTheaters,
      todayBookings,
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      activeCities,
      revenueThisMonth: revenueThisMonth[0]?.total || 0,
    },
  });
});

// ─── Dashboard Charts ───────────────────────────────────────
exports.getDashboardCharts = catchAsync(async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const matchDate = {};
  if (dateFrom) matchDate.$gte = new Date(dateFrom);
  if (dateTo) matchDate.$lte = new Date(dateTo);

  const dateFilter = Object.keys(matchDate).length ? { createdAt: matchDate } : {};

  const [
    bookingsByStatus,
    bookingsByCity,
    popularTheaters,
    popularEventTypes,
    revenueByMonth,
    addOnSales,
  ] = await Promise.all([
    // Bookings by status
    Booking.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // Bookings by city
    Booking.aggregate([
      { $match: dateFilter },
      {
        $lookup: {
          from: 'cities',
          localField: 'city',
          foreignField: '_id',
          as: 'cityInfo',
        },
      },
      { $unwind: { path: '$cityInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$city',
          name: { $first: '$cityInfo.name' },
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.total' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    // Popular theaters
    Booking.aggregate([
      { $match: { ...dateFilter, status: { $nin: ['cancelled'] } } },
      {
        $lookup: {
          from: 'theaters',
          localField: 'theater',
          foreignField: '_id',
          as: 'theaterInfo',
        },
      },
      { $unwind: { path: '$theaterInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$theater',
          name: { $first: '$theaterInfo.name' },
          bookings: { $sum: 1 },
          revenue: { $sum: '$pricing.total' },
        },
      },
      { $sort: { bookings: -1 } },
      { $limit: 10 },
    ]),
    // Popular event types
    Booking.aggregate([
      { $match: { ...dateFilter, status: { $nin: ['cancelled'] } } },
      {
        $lookup: {
          from: 'eventtypes',
          localField: 'eventType',
          foreignField: '_id',
          as: 'eventInfo',
        },
      },
      { $unwind: { path: '$eventInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$eventType',
          name: { $first: '$eventInfo.name' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    // Revenue by month (current year)
    Booking.aggregate([
      {
        $match: {
          'payment.status': 'paid',
          createdAt: {
            $gte: new Date(new Date().getFullYear(), 0, 1),
            $lte: new Date(new Date().getFullYear(), 11, 31),
          },
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          revenue: { $sum: '$pricing.total' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Add-on sales
    Booking.aggregate([
      { $match: { ...dateFilter, status: { $nin: ['cancelled'] } } },
      { $unwind: '$addOns' },
      {
        $lookup: {
          from: 'addons',
          localField: 'addOns.addOn',
          foreignField: '_id',
          as: 'addOnInfo',
        },
      },
      { $unwind: { path: '$addOnInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$addOns.addOn',
          name: { $first: '$addOnInfo.name' },
          totalQuantity: { $sum: '$addOns.quantity' },
          totalRevenue: { $sum: { $multiply: ['$addOns.price', '$addOns.quantity'] } },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      bookingsByStatus,
      bookingsByCity,
      popularTheaters,
      popularEventTypes,
      revenueByMonth,
      addOnSales,
    },
  });
});

// ─── Recent Activity ────────────────────────────────────────
exports.getRecentActivity = catchAsync(async (req, res) => {
  const [recentBookings, upcomingBookings, pendingPayments, recentReviews, recentAudit] =
    await Promise.all([
      Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name')
        .populate('theater', 'name')
        .lean(),
      Booking.find({
        date: { $gte: new Date() },
        status: { $in: ['confirmed', 'pending'] },
      })
        .sort({ date: 1 })
        .limit(5)
        .populate('user', 'name')
        .populate('theater', 'name')
        .lean(),
      Booking.find({ 'payment.status': 'pending' })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name')
        .populate('theater', 'name')
        .lean(),
      Review.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name')
        .populate('theater', 'name')
        .lean(),
      AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('user', 'name email')
        .lean(),
    ]);

  res.json({
    success: true,
    data: { recentBookings, upcomingBookings, pendingPayments, recentReviews, recentAudit },
  });
});

// ─── Bookings ───────────────────────────────────────────────
exports.getAllBookings = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    paymentStatus,
    city,
    theater,
    eventType,
    dateFrom,
    dateTo,
    search,
    sortBy = 'createdAt',
    order = 'desc',
  } = req.query;

  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};
  if (status) query.status = status;
  if (paymentStatus) query['payment.status'] = paymentStatus;
  if (city) query.city = city;
  if (theater) query.theater = theater;
  if (eventType) query.eventType = eventType;
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = new Date(dateFrom);
    if (dateTo) query.date.$lte = new Date(dateTo);
  }
  if (search) {
    query.$or = [
      { 'customerDetails.name': { $regex: search, $options: 'i' } },
      { 'customerDetails.phone': { $regex: search, $options: 'i' } },
      { 'customerDetails.email': { $regex: search, $options: 'i' } },
      { bookingId: { $regex: search, $options: 'i' } },
    ];
  }

  const bookings = await Booking.find(query)
    .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit)
    .populate('user', 'name email phone')
    .populate('theater', 'name city')
    .populate('eventType', 'name')
    .populate('city', 'name')
    .lean();

  const total = await Booking.countDocuments(query);

  res.json({
    success: true,
    data: {
      bookings,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(total / safeLimit),
        total,
        hasMore: page * safeLimit < total,
      },
    },
  });
});

exports.getBookingDetail = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('user', 'name email phone')
    .populate('theater', 'name images address city location')
    .populate('city', 'name code')
    .populate('eventType', 'name')
    .populate('addOns.addOn', 'name price category')
    .populate('confirmedBy', 'name')
    .populate('cancelledBy', 'name')
    .populate('review');

  if (!booking) return next(new AppError('Booking not found', 404));
  res.json({ success: true, data: booking });
});

exports.updateBookingStatus = catchAsync(async (req, res, next) => {
  const { status, notes } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) return next(new AppError('Booking not found', 404));

  // Validate status transition
  const allowed = VALID_TRANSITIONS[booking.status];
  if (!allowed || !allowed.includes(status)) {
    return next(
      new AppError(
        `Cannot transition booking from '${booking.status}' to '${status}'`,
        400
      )
    );
  }

  const before = { status: booking.status };
  booking.status = status;
  if (notes) booking.notes = notes;

  if (status === 'confirmed') {
    booking.confirmedBy = req.user._id;
    booking.confirmedAt = new Date();
  }
  if (status === 'completed') {
    booking.completedAt = new Date();
  }
  if (status === 'cancelled') {
    booking.cancelledBy = req.user._id;
    booking.cancelledAt = new Date();
    booking.cancellationReason = notes || 'Cancelled by admin';
  }

  await booking.save();

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Booking',
    modelId: booking._id,
    changes: { before, after: { status } },
    req,
  });

  try {
    await sendEmail({
      to: booking.customerDetails.email,
      subject: `Booking Status Update - ${booking.bookingId}`,
      template: 'booking-status-update',
      data: { booking, newStatus: status },
    });
  } catch {
    // Email failure should not block status update
  }

  res.json({ success: true, message: 'Booking status updated successfully', data: booking });
});

// ─── Revenue Report ─────────────────────────────────────────
exports.getRevenueReport = catchAsync(async (req, res) => {
  const { year = new Date().getFullYear(), city, theater } = req.query;

  const matchFilter = {
    'payment.status': 'paid',
    createdAt: {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    },
  };
  if (city) matchFilter.city = city;
  if (theater) matchFilter.theater = theater;

  const report = await Booking.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: { $month: '$createdAt' },
        revenue: { $sum: '$pricing.total' },
        bookings: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({ success: true, data: { year: parseInt(year, 10), report } });
});

// ─── Users ──────────────────────────────────────────────────
exports.getAllUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, role, search, blocked } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};
  if (role) query.role = role;
  if (blocked === 'true') query.isBlocked = true;
  if (blocked === 'false') query.isBlocked = false;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(query)
    .select('+role')
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);

  const total = await User.countDocuments(query);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page, 10),
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    },
  });
});

exports.getUserDetails = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('+role').populate('bookings');
  if (!user) return next(new AppError('User not found', 404));
  res.json({ success: true, data: user });
});

exports.updateUserRole = catchAsync(async (req, res, next) => {
  const { role } = req.body;
  if (!['customer', 'admin', 'super-admin'].includes(role)) {
    return next(new AppError('Invalid role', 400));
  }

  const user = await User.findById(req.params.id).select('+role');
  if (!user) return next(new AppError('User not found', 404));

  // Prevent removing the last super-admin
  if (user.role === 'super-admin' && role !== 'super-admin') {
    const superAdminCount = await User.countDocuments({ role: 'super-admin' });
    if (superAdminCount <= 1) {
      return next(new AppError('Cannot remove the last super-admin', 400));
    }
  }

  const before = { role: user.role };
  user.role = role;
  await user.save({ validateBeforeSave: false });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'User',
    modelId: user._id,
    changes: { before, after: { role } },
    req,
  });

  res.json({ success: true, data: user });
});

exports.blockUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) return next(new AppError('User not found', 404));

  const before = { isBlocked: user.isBlocked };
  user.isBlocked = req.body.isBlocked ?? !user.isBlocked;
  await user.save({ validateBeforeSave: false });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'User',
    modelId: user._id,
    changes: { before, after: { isBlocked: user.isBlocked } },
    req,
  });

  res.json({
    success: true,
    message: user.isBlocked ? 'User blocked' : 'User unblocked',
    data: user,
  });
});

// ─── Admin-specific listing endpoints ───────────────────────
exports.getAdminCities = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 100);
  const query = {};
  if (search) query.name = { $regex: search, $options: 'i' };

  const cities = await City.find(query)
    .sort('name')
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);
  const total = await City.countDocuments(query);

  // Attach theater counts
  const citiesWithCounts = await Promise.all(
    cities.map(async (city) => {
      const theaterCount = await Theater.countDocuments({ city: city._id });
      const locationCount = await Location.countDocuments({ city: city._id });
      return { ...city.toObject(), theaterCount, locationCount };
    })
  );

  res.json({
    success: true,
    data: citiesWithCounts,
    pagination: { page: parseInt(page, 10), total, totalPages: Math.ceil(total / safeLimit) },
  });
});

exports.getAdminLocations = catchAsync(async (req, res) => {
  const { city, search, page = 1, limit = 50 } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 100);
  const query = {};
  if (city) query.city = city;
  if (search) query.name = { $regex: search, $options: 'i' };

  const locations = await Location.find(query)
    .populate('city', 'name code')
    .sort('name')
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);
  const total = await Location.countDocuments(query);

  const locationsWithCounts = await Promise.all(
    locations.map(async (loc) => {
      const theaterCount = await Theater.countDocuments({ location: loc._id });
      return { ...loc.toObject(), theaterCount };
    })
  );

  res.json({
    success: true,
    data: locationsWithCounts,
    pagination: { page: parseInt(page, 10), total, totalPages: Math.ceil(total / safeLimit) },
  });
});

exports.getAdminTheaters = catchAsync(async (req, res) => {
  const { city, location, search, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } =
    req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};
  if (city) query.city = city;
  if (location) query.location = location;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
    ];
  }

  const theaters = await Theater.find(query)
    .populate('city', 'name code')
    .populate('location', 'name')
    .populate('eventTypes', 'name')
    .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);
  const total = await Theater.countDocuments(query);

  res.json({
    success: true,
    data: theaters,
    pagination: { page: parseInt(page, 10), total, totalPages: Math.ceil(total / safeLimit) },
  });
});

exports.getAdminEventTypes = catchAsync(async (req, res) => {
  const eventTypes = await EventType.find().sort('sortOrder');
  res.json({ success: true, data: eventTypes });
});

exports.getAdminAddOns = catchAsync(async (req, res) => {
  const { category, search } = req.query;
  const query = {};
  if (category) query.category = category;
  if (search) query.name = { $regex: search, $options: 'i' };

  const addOns = await AddOn.find(query).sort('sortOrder');
  res.json({ success: true, data: addOns });
});

exports.getAdminBanners = catchAsync(async (req, res) => {
  const { position } = req.query;
  const query = {};
  if (position) query.position = position;

  const banners = await Banner.find(query)
    .populate('createdBy', 'name')
    .sort('-priority');
  res.json({ success: true, data: banners });
});

exports.getAdminTestimonials = catchAsync(async (req, res) => {
  const testimonials = await Testimonial.find()
    .populate('theater', 'name')
    .sort('sortOrder');
  res.json({ success: true, data: testimonials });
});

exports.getAdminFAQs = catchAsync(async (req, res) => {
  const { category } = req.query;
  const query = {};
  if (category) query.category = category;

  const faqs = await FAQ.find(query).sort('sortOrder');
  res.json({ success: true, data: faqs });
});

exports.getAdminReviews = catchAsync(async (req, res) => {
  const { approved, theater, search, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};
  if (approved === 'true') query.isApproved = true;
  if (approved === 'false') query.isApproved = false;
  if (theater) query.theater = theater;

  const reviews = await Review.find(query)
    .populate('user', 'name email')
    .populate('theater', 'name')
    .populate('booking', 'bookingId')
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);
  const total = await Review.countDocuments(query);

  res.json({
    success: true,
    data: reviews,
    pagination: { page: parseInt(page, 10), total, totalPages: Math.ceil(total / safeLimit) },
  });
});

exports.getAdminServices = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};
  if (search) query.title = { $regex: search, $options: 'i' };

  const services = await Service.find(query)
    .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);
  const total = await Service.countDocuments(query);

  res.json({
    success: true,
    data: services,
    pagination: { page: parseInt(page, 10), total, totalPages: Math.ceil(total / safeLimit) },
  });
});

exports.getAdminGallery = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};
  if (search) query.title = { $regex: search, $options: 'i' };

  const gallery = await Gallery.find(query)
    .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);
  const total = await Gallery.countDocuments(query);

  res.json({
    success: true,
    data: gallery,
    pagination: { page: parseInt(page, 10), total, totalPages: Math.ceil(total / safeLimit) },
  });
});

exports.getAdminStories = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};
  if (search) query.title = { $regex: search, $options: 'i' };

  const stories = await Story.find(query)
    .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);
  const total = await Story.countDocuments(query);

  res.json({
    success: true,
    data: stories,
    pagination: { page: parseInt(page, 10), total, totalPages: Math.ceil(total / safeLimit) },
  });
});

// ─── Audit Logs ─────────────────────────────────────────────
exports.getAuditLogs = catchAsync(async (req, res) => {
  const { page = 1, limit = 50, action, model, user: userId, dateFrom, dateTo, search } =
    req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 100);
  const query = {};
  if (action) query.action = action;
  if (model) query.model = model;
  if (userId) query.user = userId;
  if (search) query.modelId = search;
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(dateTo);
  }

  const logs = await AuditLog.find(query)
    .populate('user', 'name email role')
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);

  const total = await AuditLog.countDocuments(query);

  res.json({
    success: true,
    data: {
      logs,
      pagination: { page: parseInt(page, 10), total, totalPages: Math.ceil(total / safeLimit) },
    },
  });
});

// ─── Export ─────────────────────────────────────────────────
exports.exportBookings = catchAsync(async (req, res) => {
  const { status, city, dateFrom, dateTo } = req.query;
  const query = {};
  if (status) query.status = status;
  if (city) query.city = city;
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = new Date(dateFrom);
    if (dateTo) query.date.$lte = new Date(dateTo);
  }

  const bookings = await Booking.find(query)
    .populate('theater', 'name')
    .populate('user', 'name email')
    .populate('city', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'Booking ID',
    'Customer',
    'Email',
    'Theater',
    'City',
    'Date',
    'Time Slot',
    'Status',
    'Payment Status',
    'Total',
  ];

  const rows = bookings.map((b) => [
    b.bookingId,
    b.customerDetails?.name || b.user?.name,
    b.customerDetails?.email || b.user?.email,
    b.theater?.name,
    b.city?.name,
    new Date(b.date).toISOString().split('T')[0],
    b.timeSlot,
    b.status,
    b.payment?.status,
    b.pricing?.total,
  ]);

  const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

  await createAuditLog({
    user: req.user._id,
    action: 'export',
    model: 'Booking',
    modelId: req.user._id,
    req,
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=bookings-export.csv');
  res.send(csv);
});
