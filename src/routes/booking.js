const express = require('express');
const bookingController = require('../controllers/bookingController');
const { protect, restrictTo } = require('../middleware/auth');
const { resolveCustomerAuth } = require('../middleware/auth');
const { ensureBookingSession } = require('../middleware/bookingSession');
const validateRequest = require('../middleware/validateRequest');
const {
  createBookingSchema,
  createBookingHoldSchema,
  bookingDraftIdSchema,
  saveBookingDraftSchema,
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

router.use(ensureBookingSession);

router.get(
  '/check-availability',
  validateRequest(checkAvailabilitySchema, 'query'),
  bookingController.checkAvailability
);

router.post(
  '/hold',
  resolveCustomerAuth,
  bookingLimiter,
  validateRequest(createBookingHoldSchema),
  bookingController.createBookingHold
);

router.delete('/hold/:holdId', bookingController.releaseBookingHold);

router.get(
  '/drafts/:draftId',
  validateRequest(bookingDraftIdSchema, 'params'),
  bookingController.getBookingDraft
);
router.put(
  '/drafts/:draftId',
  validateRequest(bookingDraftIdSchema, 'params'),
  validateRequest(saveBookingDraftSchema),
  resolveCustomerAuth,
  bookingController.saveBookingDraft
);
router.delete(
  '/drafts/:draftId',
  validateRequest(bookingDraftIdSchema, 'params'),
  bookingController.deleteBookingDraft
);

// Public / Guest / Customer booking creation endpoints (uses resolveCustomerAuth)
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

router.get('/current-session', resolveCustomerAuth, bookingController.getCurrentSessionBooking);

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
