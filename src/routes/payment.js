const express = require('express');
const paymentController = require('../controllers/paymentController');
const { resolveCustomerAuth } = require('../middleware/auth');
const { ensureBookingSession } = require('../middleware/bookingSession');

const router = express.Router();

router.use(ensureBookingSession);

router.post('/submit-upi', resolveCustomerAuth, paymentController.submitUpiPayment);
router.get('/status/:bookingId', resolveCustomerAuth, paymentController.checkPaymentStatus);
router.get(
  '/invoice/:id',
  (req, res, next) => {
    req.params.bookingId = req.params.id;
    resolveCustomerAuth(req, res, next);
  },
  paymentController.getInvoice
);

module.exports = router;
