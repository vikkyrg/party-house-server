const express = require('express');
const adminController = require('../controllers/adminController');
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
router.get('/banners', adminController.getAdminBanners);
router.get('/testimonials', adminController.getAdminTestimonials);
router.get('/faqs', adminController.getAdminFAQs);
router.get('/reviews', adminController.getAdminReviews);

// Audit Logs
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
