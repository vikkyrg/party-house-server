const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/profile', userController.getProfile);
router.get('/bookings', userController.getBookingHistory);

module.exports = router;
