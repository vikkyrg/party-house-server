const express = require('express');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const { verifyRazorpayWebhook } = require('../middleware/verifyWebhook');

const router = express.Router();

router.post('/webhook', verifyRazorpayWebhook, paymentController.handleWebhook);

router.use(protect);
router.post('/create-order', paymentController.createOrder);
router.post('/verify', paymentController.verifyPayment);
router.get('/invoice/:id', paymentController.getInvoice);

module.exports = router;
