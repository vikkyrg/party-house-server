const express = require('express');
const bookingController = require('../controllers/bookingController');
const { protect, restrictTo } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const {
  createBookingSchema,
  cancelBookingSchema,
  checkAvailabilitySchema,
} = require('../validators/bookingValidator');
const rateLimit = require('express-rate-limit');

// Create booking-specific rate limiter
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 bookings per hour
  message: {
    success: false,
    message: 'You can only create 3 bookings per hour. Please contact support for bulk bookings.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if logged in, otherwise IP
    return req.user?.id || req.ip;
  },
});

const router = express.Router();

router.get(
  '/check-availability',
  validateRequest(checkAvailabilitySchema, 'query'),
  bookingController.checkAvailability
);

router.use(protect);

router.post(
  '/',
  bookingLimiter,
  validateRequest(createBookingSchema),
  bookingController.createBooking
);
router.get('/', bookingController.getUserBookings);
router.get('/my', bookingController.getMyBookings);
router.get('/:id', bookingController.getBooking);
router.get('/:id/invoice', bookingController.downloadInvoice);
router.delete('/:id', validateRequest(cancelBookingSchema), bookingController.cancelBooking);
router.post(
  '/:id/reschedule',
  restrictTo('admin', 'super-admin'),
  bookingController.rescheduleBooking
);

module.exports = router;
