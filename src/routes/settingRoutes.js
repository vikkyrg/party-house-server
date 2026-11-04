const express = require('express');
const settingController = require('../controllers/settingController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Public route to fetch payment settings (for customer booking flow)
router.get('/payment', settingController.getPublicPaymentSettings);

// Admin-protected routes
router.use(protect, restrictTo('admin', 'super-admin'));
router.get('/', settingController.getAdminSettings);
router.put('/advance-payment', settingController.updateAdvancePaymentSetting);

module.exports = router;

