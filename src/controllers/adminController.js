const Booking = require('../models/Booking');
const User = require('../models/User');
const Theater = require('../models/Theater');
const Room = require('../models/Room');
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
const ContactMessage = require('../models/ContactMessage');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendEmail } = require('../services/emailService');
const { createAuditLog } = require('../services/auditService');

const {
  doesOverlap,
  normalizeBookingDate,
  getActiveBookingsFilter,
} = require('../utils/dateUtils');

// Valid booking status transitions
const VALID_TRANSITIONS = {
  pending: ['pending', 'pending_payment', 'pending_verification', 'confirmed', 'cancelled'],
  pending_payment: ['pending', 'pending_payment', 'pending_verification', 'confirmed', 'cancelled'],
  pending_verification: ['pending', 'pending_verification', 'confirmed', 'cancelled'],
  confirmed: ['confirmed', 'in-progress', 'completed', 'cancelled', 'no-show'],
  'in-progress': ['in-progress', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
  'no-show': ['no-show'],
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
    totalRooms,
    totalEventTypes,
    totalAddOns,
    totalServices,
    totalGallery,
    unreadContactMessages,
    totalVerifiedAdvance,
    completedBookings,
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
    Booking.countDocuments({
      status: { $in: ['pending', 'pending_payment', 'pending_verification'] },
      $nor: [
        {
          status: { $in: ['pending', 'pending_payment'] },
          'payment.status': { $in: ['pending', 'failed'] },
          holdExpiresAt: { $exists: true, $ne: null, $lt: new Date() },
        },
        {
          status: { $in: ['pending', 'pending_payment'] },
          'payment.status': { $in: ['pending', 'failed'] },
          expiresAt: { $exists: true, $ne: null, $lt: new Date() },
        },
        {
          status: { $in: ['pending', 'pending_payment'] },
          'payment.status': { $in: ['pending', 'failed'] },
          $and: [
            { $or: [{ holdExpiresAt: { $exists: false } }, { holdExpiresAt: null }] },
            { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }] },
          ],
          createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) },
        },
      ],
    }),
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
    Room.countDocuments({ isActive: true }),
    EventType.countDocuments({ isActive: true }),
    AddOn.countDocuments({ isActive: true }),
    Service.countDocuments({ isActive: true }),
    Gallery.countDocuments(),
    ContactMessage.countDocuments({ status: 'new' }),
    Booking.aggregate([
      { $match: { 'payment.status': 'paid' } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [
                { $gt: ['$payment.amountPaid', 0] },
                '$payment.amountPaid',
                { $ifNull: ['$pricing.advanceAmount', 750] }
              ]
            }
          }
        }
      },
    ]),
    Booking.countDocuments({ status: 'completed' }),
  ]);

  res.json({
    success: true,
    data: {
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalVerifiedAdvance: totalVerifiedAdvance[0]?.total || 0,
      totalUsers,
      totalTheaters,
      todayBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      cancelledBookings,
      activeCities,
      revenueThisMonth: revenueThisMonth[0]?.total || 0,
      totalRooms,
      totalEventTypes,
      totalAddOns,
      totalServices,
      totalGallery,
      unreadContactMessages,
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
    const dateQuery = {};
    if (dateFrom && dateFrom !== 'undefined' && dateFrom !== 'null') {
      const parsedFrom = new Date(dateFrom);
      if (!isNaN(parsedFrom.getTime())) {
        parsedFrom.setHours(0, 0, 0, 0);
        dateQuery.$gte = parsedFrom;
      }
    }
    if (dateTo && dateTo !== 'undefined' && dateTo !== 'null') {
      const parsedTo = new Date(dateTo);
      if (!isNaN(parsedTo.getTime())) {
        parsedTo.setHours(23, 59, 59, 999);
        dateQuery.$lte = parsedTo;
      }
    }
    if (Object.keys(dateQuery).length > 0) {
      query.date = dateQuery;
    }
  }
  if (search) {
    query.$or = [
      { 'customerDetails.name': { $regex: search, $options: 'i' } },
      { 'customerDetails.phone': { $regex: search, $options: 'i' } },
      { 'customerDetails.email': { $regex: search, $options: 'i' } },
      { bookingId: { $regex: search, $options: 'i' } },
      { bulkBookingId: { $regex: search, $options: 'i' } },
    ];
  }

  // Pending unpaid bookings should appear only while their 10-minute hold is active.
  // Unless the admin specifically queries for 'cancelled' bookings, exclude expired unpaid holds from active listing.
  if (status !== 'cancelled') {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    query.$nor = [
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        holdExpiresAt: { $exists: true, $ne: null, $lt: now },
      },
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        expiresAt: { $exists: true, $ne: null, $lt: now },
      },
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        $and: [
          { $or: [{ holdExpiresAt: { $exists: false } }, { holdExpiresAt: null }] },
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }] },
        ],
        createdAt: { $lt: tenMinutesAgo },
      },
    ];
  }

  const bookings = await Booking.find(query)
    .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit)
    .populate('user', 'name email phone')
    .populate('theater', 'name city address')
    .populate('room', 'name couple maximumMembers')
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
    .populate('room', 'name couple maximumMembers slots weekdayPrice weekendPrice')
    .populate('city', 'name code')
    .populate('eventType', 'name')
    .populate('addOns.addOn', 'name price category')
    .populate('confirmedBy', 'name email')
    .populate('cancelledBy', 'name email')
    .populate('payment.verifiedBy', 'name email')
    .populate('review');

  if (!booking) return next(new AppError('Booking not found', 404));
  res.json({ success: true, data: booking });
});

exports.updateBookingStatus = catchAsync(async (req, res, next) => {
  let { status, notes } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) return next(new AppError('Booking not found', 404));

  // If action is reject, default status to cancelled
  if (req.body.action === 'reject') {
    status = 'cancelled';
  } else if (req.body.action === 'verify') {
    status = 'confirmed';
  } else if (!status) {
    status = booking.status;
  }

  // Validate status transition
  const allowed = VALID_TRANSITIONS[booking.status] || [];
  if (booking.status !== status && !allowed.includes(status)) {
    return next(
      new AppError(
        `Cannot transition booking from '${booking.status}' to '${status}'`,
        400
      )
    );
  }

  const before = { status: booking.status };
  
  if (['pending', 'confirmed', 'in-progress'].includes(status) && ['cancelled', 'no-show', 'failed'].includes(booking.status)) {
    const filter = getActiveBookingsFilter({
      _id: { $ne: booking._id },
      room: booking.room,
      date: booking.date,
    });
    const activeBookings = await Booking.find(filter);
    const isOverlap = activeBookings.some((b) => doesOverlap(b.timeSlot, booking.timeSlot));
    if (isOverlap) {
      return next(new AppError(`Cannot update status to '${status}' because the time slot is currently booked by another active booking.`, 409));
    }
  }

  booking.status = status;
  if (notes) booking.notes = notes;

  // Handle explicit verification action
  if (req.body.action === 'verify' || (status === 'confirmed' && req.body.paymentStatus === 'paid')) {
    // If booking hold had expired, ensure no other active reservation has taken the slot
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const wasExpired = ['pending', 'pending_payment'].includes(booking.status) &&
      (['pending', 'failed'].includes(booking.payment?.status)) &&
      ((booking.holdExpiresAt && booking.holdExpiresAt < now) ||
       (booking.expiresAt && booking.expiresAt < now) ||
       (!booking.holdExpiresAt && !booking.expiresAt && booking.createdAt < tenMinutesAgo));

    if (wasExpired) {
      const filter = getActiveBookingsFilter({
        _id: { $ne: booking._id },
        room: booking.room,
        date: booking.date,
      });
      const activeBookings = await Booking.find(filter);
      const isOverlap = activeBookings.some((b) => doesOverlap(b.timeSlot, booking.timeSlot));
      if (isOverlap) {
        return next(new AppError('Cannot confirm this booking: The hold has expired and this slot has already been reserved by another customer.', 409));
      }
    }

    booking.payment.status = 'paid';
    booking.payment.amountPaid = booking.pricing?.advanceAmount || 750;
    booking.payment.paidAt = new Date();
    booking.payment.verifiedAt = new Date();
    booking.payment.verifiedBy = req.user._id;
    booking.status = 'confirmed';
    booking.confirmedBy = req.user._id;
    booking.confirmedAt = new Date();
  } else if (req.body.action === 'reject') {
    if (!req.body.rejectionReason || !req.body.rejectionReason.trim()) {
      return next(new AppError('A rejection reason is mandatory when rejecting a payment.', 400));
    }
    booking.payment.status = 'rejected';
    booking.payment.rejectedReason = req.body.rejectionReason.trim();
    booking.status = 'cancelled';
    booking.cancelledBy = req.user._id;
    booking.cancelledAt = new Date();
    booking.cancellationReason = `Payment verification rejected: ${req.body.rejectionReason.trim()}`;
  } else if (status === 'confirmed') {
    // A booking must not become confirmed until its required advance payment has been verified
    const isPaymentPaid = booking.payment?.status === 'paid' || req.body.paymentStatus === 'paid';
    if (!isPaymentPaid) {
      return next(
        new AppError(
          'Cannot confirm booking: Required advance payment has not been verified yet.',
          400
        )
      );
    }
    if (req.body.paymentStatus === 'paid' && booking.payment.status !== 'paid') {
      booking.payment.status = 'paid';
      booking.payment.amountPaid = booking.pricing?.advanceAmount || 750;
      booking.payment.paidAt = new Date();
      booking.payment.verifiedAt = new Date();
      booking.payment.verifiedBy = req.user._id;
      if (req.body.paymentMethod) booking.payment.method = req.body.paymentMethod;
    }
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
    // If booking was paid and refund is requested
    if (req.body.processRefund && booking.payment?.status === 'paid') {
      booking.payment.status = 'refunded';
      booking.payment.refundedAt = new Date();
      booking.payment.refundAmount = booking.payment.amountPaid || booking.pricing?.advanceAmount || 750;
    }
  }

  // Update payment status independently if specified
  if (req.body.paymentStatus && !['confirmed'].includes(status) && req.body.action !== 'reject') {
    booking.payment.status = req.body.paymentStatus;
    if (req.body.paymentStatus === 'paid') {
      booking.payment.amountPaid = booking.payment.amountPaid || booking.pricing?.advanceAmount || 750;
      booking.payment.paidAt = booking.payment.paidAt || new Date();
      booking.payment.verifiedAt = booking.payment.verifiedAt || new Date();
      booking.payment.verifiedBy = req.user._id;
    } else if (req.body.paymentStatus === 'refunded') {
      booking.payment.refundedAt = new Date();
    }
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
  const { location, search, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } =
    req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};
  if (location) query.location = location;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
    ];
  }

  const theaters = await Theater.find(query)
    .populate('location', 'name')
    .populate('rooms', '_id isActive')
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
  const eventTypes = await EventType.find().sort({ createdAt: -1 });
  res.json({ success: true, data: eventTypes });
});

exports.getAdminAddOns = catchAsync(async (req, res) => {
  const { category, search } = req.query;
  const query = {};
  if (category) query.category = category;
  if (search) query.name = { $regex: search, $options: 'i' };

  const addOns = await AddOn.find(query).sort({ name: 1 });
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
    .sort({ createdAt: -1 });
  res.json({ success: true, data: testimonials });
});

exports.getAdminFAQs = catchAsync(async (req, res) => {
  const { category } = req.query;
  const query = {};
  if (category) query.category = category;

  const faqs = await FAQ.find(query).sort({ createdAt: -1 });
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
    const createdQuery = {};
    if (dateFrom && dateFrom !== 'undefined' && dateFrom !== 'null') {
      const parsedFrom = new Date(dateFrom);
      if (!isNaN(parsedFrom.getTime())) {
        parsedFrom.setHours(0, 0, 0, 0);
        createdQuery.$gte = parsedFrom;
      }
    }
    if (dateTo && dateTo !== 'undefined' && dateTo !== 'null') {
      const parsedTo = new Date(dateTo);
      if (!isNaN(parsedTo.getTime())) {
        parsedTo.setHours(23, 59, 59, 999);
        createdQuery.$lte = parsedTo;
      }
    }
    if (Object.keys(createdQuery).length > 0) {
      query.createdAt = createdQuery;
    }
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
    const dateQuery = {};
    if (dateFrom && dateFrom !== 'undefined' && dateFrom !== 'null') {
      const parsedFrom = new Date(dateFrom);
      if (!isNaN(parsedFrom.getTime())) {
        parsedFrom.setHours(0, 0, 0, 0);
        dateQuery.$gte = parsedFrom;
      }
    }
    if (dateTo && dateTo !== 'undefined' && dateTo !== 'null') {
      const parsedTo = new Date(dateTo);
      if (!isNaN(parsedTo.getTime())) {
        parsedTo.setHours(23, 59, 59, 999);
        dateQuery.$lte = parsedTo;
      }
    }
    if (Object.keys(dateQuery).length > 0) {
      query.date = dateQuery;
    }
  }

  if (status !== 'cancelled') {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    query.$nor = [
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        holdExpiresAt: { $exists: true, $ne: null, $lt: now },
      },
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        expiresAt: { $exists: true, $ne: null, $lt: now },
      },
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        $and: [
          { $or: [{ holdExpiresAt: { $exists: false } }, { holdExpiresAt: null }] },
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }] },
        ],
        createdAt: { $lt: tenMinutesAgo },
      },
    ];
  }

  const bookings = await Booking.find(query)
    .populate('theater', 'name')
    .populate('user', 'name email')
    .populate('city', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'Booking ID',
    'Bulk Booking ID',
    'Customer',
    'Email',
    'Phone',
    'Theater',
    'City',
    'Date',
    'Time Slot',
    'Status',
    'Payment Status',
    'Total Amount',
    'Advance Paid',
    'UPI Ref',
  ];

  const rows = bookings.map((b) => [
    b.bookingId,
    b.bulkBookingId || '',
    `"${b.customerDetails?.name || b.user?.name || ''}"`,
    `"${b.customerDetails?.email || b.user?.email || ''}"`,
    `"${b.customerDetails?.phone || ''}"`,
    `"${b.theater?.name || b.theaterName || ''}"`,
    `"${b.city?.name || b.cityName || ''}"`,
    b.date ? new Date(b.date).toISOString().split('T')[0] : '',
    `"${b.timeSlot || ''}"`,
    b.status,
    b.payment?.status,
    b.pricing?.total || 0,
    b.payment?.amountPaid || (b.payment?.status === 'paid' ? (b.pricing?.advanceAmount || 750) : 0),
    `"${b.payment?.upiTransactionId || ''}"`,
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
