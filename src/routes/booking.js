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

// Create booking-specific rate limiter with abuse protection
// Allows up to 30 requests per hour per IP/user to permit legitimate multi-step browsing and bulk bookings
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 booking creations per hour
  message: {
    success: false,
    message: 'Rate limit exceeded. Please try again later or contact support.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

const router = express.Router();

router.get(
  '/check-availability',
  validateRequest(checkAvailabilitySchema, 'query'),
  bookingController.checkAvailability
);

// Public / Guest / Customer booking creation endpoints (uses resolveCustomerAuth)
const { resolveCustomerAuth } = require('../middleware/auth');
const { bulkBookingSchema } = require('../validators/bookingValidator');

router.post(
  '/',
  resolveCustomerAuth,
  bookingLimiter,
  validateRequest(createBookingSchema),
  bookingController.createBooking
);

router.post(
  '/bulk',
  resolveCustomerAuth,
  bookingLimiter,
  validateRequest(bulkBookingSchema),
  bookingController.createBulkBooking
);

// Authenticated booking management routes
router.use(protect);

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
