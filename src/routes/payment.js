const express = require('express');
const paymentController = require('../controllers/paymentController');
const { resolveCustomerAuth } = require('../middleware/auth');

const router = express.Router();

router.use(resolveCustomerAuth);
router.post('/submit-upi', paymentController.submitUpiPayment);
router.get('/status/:bookingId', paymentController.checkPaymentStatus);
router.get('/invoice/:id', paymentController.getInvoice);

module.exports = router;
