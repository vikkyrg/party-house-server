const express = require('express');
const adminController = require('../controllers/adminController');
const addOnController = require('../controllers/addOnController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.use(protect, restrictTo('admin', 'super-admin'));

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/charts', adminController.getDashboardCharts);
router.get('/dashboard/recent', adminController.getRecentActivity);

// Bookings
router.get('/bookings', adminController.getAllBookings);
router.get('/bookings/:id', adminController.getBookingDetail);
router.put('/bookings/:id/status', adminController.updateBookingStatus);
router.get('/export/bookings', adminController.exportBookings);

// Revenue
router.get('/revenue-report', adminController.getRevenueReport);

// Users
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserDetails);
router.put('/users/:id/role', restrictTo('super-admin'), adminController.updateUserRole);
router.put('/users/:id/block', adminController.blockUser);

// Admin resource listings (include inactive records)
router.get('/cities', adminController.getAdminCities);
router.get('/locations', adminController.getAdminLocations);
router.get('/theaters', adminController.getAdminTheaters);
router.get('/event-types', adminController.getAdminEventTypes);
router.get('/addons', adminController.getAdminAddOns);
router.put('/addons/reorder', addOnController.reorderAddOns);
router.get('/banners', adminController.getAdminBanners);
router.get('/testimonials', adminController.getAdminTestimonials);
router.get('/faqs', adminController.getAdminFAQs);
router.get('/reviews', adminController.getAdminReviews);
router.get('/services', adminController.getAdminServices);
router.get('/gallery', adminController.getAdminGallery);
router.get('/stories', adminController.getAdminStories);

const contactMessageController = require('../controllers/contactMessageController');
const validateRequest = require('../middleware/validateRequest');
const { updateContactMessageStatusSchema } = require('../validators/contactMessageValidator');

// Audit Logs
router.get('/audit-logs', adminController.getAuditLogs);

// Contact Messages
router.get('/contact-messages', contactMessageController.getAdminContactMessages);
router.get('/contact-messages/unread-count', contactMessageController.getUnreadCount);
router.patch('/contact-messages/mark-all-read', contactMessageController.markAllAsRead);
router.get('/contact-messages/:id', contactMessageController.getContactMessageById);
router.patch(
  '/contact-messages/:id/status',
  validateRequest(updateContactMessageStatusSchema),
  contactMessageController.updateContactMessageStatus
);
router.delete('/contact-messages/:id', contactMessageController.deleteContactMessage);


// Booking Notifications
const bookingNotificationController = require('../controllers/bookingNotificationController');
router.get('/booking-notifications', bookingNotificationController.getAdminBookingNotifications);
router.get('/booking-notifications/unread-count', bookingNotificationController.getUnreadCount);
router.patch('/booking-notifications/mark-all-read', bookingNotificationController.markAllAsRead);
router.patch('/booking-notifications/:id/read', bookingNotificationController.markAsRead);
router.patch('/booking-notifications/booking/:bookingId/read', bookingNotificationController.markAsReadByBookingId);

module.exports = router;


