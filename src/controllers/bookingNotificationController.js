const BookingNotification = require('../models/BookingNotification');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// @desc    Get booking notifications with unread count
// @route   GET /api/v1/admin/booking-notifications
// @access  Private (Admin / Super-Admin)
exports.getAdminBookingNotifications = catchAsync(async (req, res, next) => {
  const { unreadOnly, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const skip = (parseInt(page, 10) - 1) * safeLimit;

  const query = {};
  if (unreadOnly === 'true' || unreadOnly === true) {
    query.isRead = false;
  }

  const notifications = await BookingNotification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .populate('booking', 'bookingId status payment customerDetails timeSlot date roomName theaterName pricing');

  const total = await BookingNotification.countDocuments(query);
  const unreadCount = await BookingNotification.countDocuments({ isRead: false });

  res.status(200).json({
    success: true,
    data: notifications,
    unreadCount,
    pagination: {
      page: parseInt(page, 10),
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    },
  });
});

// @desc    Get unread notification count only (Lightweight polling)
// @route   GET /api/v1/admin/booking-notifications/unread-count
// @access  Private (Admin / Super-Admin)
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const unreadCount = await BookingNotification.countDocuments({ isRead: false });
  // Also get the latest unread notification if any
  const latestNotification = await BookingNotification.findOne({ isRead: false })
    .sort({ createdAt: -1 })
    .select('bookingId title message type createdAt');

  res.status(200).json({
    success: true,
    data: {
      unreadCount,
      latestNotification,
    },
  });
});

// @desc    Mark a single notification as read
// @route   PATCH /api/v1/admin/booking-notifications/:id/read
// @access  Private (Admin / Super-Admin)
exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await BookingNotification.findById(req.params.id);
  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  notification.isRead = true;
  notification.readAt = new Date();
  notification.readBy = req.user._id;
  await notification.save();

  const unreadCount = await BookingNotification.countDocuments({ isRead: false });

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: notification,
    unreadCount,
  });
});

// @desc    Mark notification as read by Booking ID (e.g. when reviewing a booking on details page)
// @route   PATCH /api/v1/admin/booking-notifications/booking/:bookingId/read
// @access  Private (Admin / Super-Admin)
exports.markAsReadByBookingId = catchAsync(async (req, res, next) => {
  const { bookingId } = req.params;

  await BookingNotification.updateMany(
    {
      $or: [{ booking: bookingId }, { bookingId: bookingId }],
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
        readBy: req.user._id,
      },
    }
  );

  const unreadCount = await BookingNotification.countDocuments({ isRead: false });

  res.status(200).json({
    success: true,
    message: 'Notifications for booking marked as read',
    unreadCount,
  });
});

// @desc    Mark all notifications as read
// @route   PATCH /api/v1/admin/booking-notifications/mark-all-read
// @access  Private (Admin / Super-Admin)
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  await BookingNotification.updateMany(
    { isRead: false },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
        readBy: req.user._id,
      },
    }
  );

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
    unreadCount: 0,
  });
});

