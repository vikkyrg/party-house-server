const inMemoryNotificationService = require('../services/inMemoryNotificationService');
const catchAsync = require('../utils/catchAsync');

// @desc    Get unread notification count from application memory (No MongoDB query)
// @route   GET /api/v1/admin/booking-notifications/unread-count
// @access  Private (Admin / Super-Admin)
exports.getUnreadCount = catchAsync(async (req, res) => {
  const unreadCount = inMemoryNotificationService.getCount();
  res.status(200).json({
    success: true,
    data: {
      unreadCount,
    },
  });
});

// @desc    Clear / reset unread notification count to 0 in memory when admin views Bookings page
// @route   PATCH /api/v1/admin/booking-notifications/clear-count or mark-all-read
// @access  Private (Admin / Super-Admin)
exports.clearUnreadCount = catchAsync(async (req, res) => {
  inMemoryNotificationService.resetCount();
  res.status(200).json({
    success: true,
    message: 'Booking notification badge count cleared',
    data: {
      unreadCount: 0,
    },
  });
});

// Compatibility stubs for any existing calls
exports.getAdminBookingNotifications = catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: [],
    unreadCount: inMemoryNotificationService.getCount(),
  });
});

exports.markAsRead = catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    unreadCount: inMemoryNotificationService.getCount(),
  });
});

exports.markAsReadByBookingId = catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    unreadCount: inMemoryNotificationService.getCount(),
  });
});

exports.markAllAsRead = exports.clearUnreadCount;
