const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { getRazorpay } = require('../config/razorpay');
const { sendEmail } = require('../services/emailService');

exports.createOrder = catchAsync(async (req, res, next) => {
  const { bookingId } = req.body;
  const booking = await Booking.findById(bookingId);

  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.user.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized', 403));
  }
  if (booking.payment.status === 'paid') {
    return next(new AppError('Booking is already paid', 400));
  }

  const razorpay = getRazorpay();
  const order = await razorpay.orders.create({
    amount: Math.round(booking.pricing.total * 100),
    currency: 'INR',
    receipt: booking.bookingId,
    notes: { bookingId: booking._id.toString() },
  });

  booking.payment.razorpayOrderId = order.id;
  booking.payment.method = 'razorpay';
  await booking.save();

  res.json({
    success: true,
    data: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      bookingId: booking.bookingId,
    },
  });
});

exports.verifyPayment = catchAsync(async (req, res, next) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, bookingId } = req.body;

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpaySignature) {
    return next(new AppError('Payment verification failed', 400));
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) return next(new AppError('Booking not found', 404));

  booking.payment.status = 'paid';
  booking.payment.razorpayPaymentId = razorpayPaymentId;
  booking.payment.razorpaySignature = razorpaySignature;
  booking.payment.paidAt = new Date();
  booking.status = 'confirmed';
  booking.confirmedAt = new Date();
  await booking.save();

  await sendEmail({
    to: booking.customerDetails.email,
    subject: `Payment Received - ${booking.bookingId}`,
    template: 'payment-success',
    data: { booking },
  });

  res.json({ success: true, message: 'Payment verified successfully', data: booking });
});

exports.handleWebhook = catchAsync(async (req, res) => {
  const event = req.body.event;
  const payment = req.body.payload.payment.entity;

  // Handle different events
  switch (event) {
    case 'payment.captured':
      // Update booking payment status
      await Booking.findOneAndUpdate(
        { 'payment.razorpayPaymentId': payment.id },
        {
          'payment.status': 'paid',
          'payment.paidAt': new Date(payment.captured_at * 1000),
        }
      );
      break;

    case 'payment.failed':
      // Mark payment as failed
      await Booking.findOneAndUpdate(
        { 'payment.razorpayPaymentId': payment.id },
        { 'payment.status': 'failed' }
      );
      break;

    case 'refund.processed':
      // Update refund status
      await Booking.findOneAndUpdate(
        { 'payment.razorpayPaymentId': payment.id },
        {
          'payment.status': 'refunded',
          'payment.refundedAt': new Date(),
        }
      );
      break;
  }

  // Always return 200 to Razorpay
  res.status(200).json({ success: true });
});

exports.getInvoice = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('theater', 'name address')
    .populate('eventType', 'name');

  if (!booking) return next(new AppError('Booking not found', 404));

  if (
    booking.user.toString() !== req.user._id.toString() &&
    !['admin', 'super-admin'].includes(req.user.role)
  ) {
    return next(new AppError('Not authorized', 403));
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${booking.bookingId}.pdf`);

  const doc = new PDFDocument();
  doc.pipe(res);

  doc.fontSize(20).text('CS Cinemas - Invoice', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Booking ID: ${booking.bookingId}`);
  doc.text(`Customer: ${booking.customerDetails.name}`);
  doc.text(`Theater: ${booking.theater.name}`);
  doc.text(`Date: ${new Date(booking.date).toDateString()}`);
  doc.text(`Time: ${booking.timeSlot}`);
  doc.text(`Event: ${booking.eventType.name}`);
  doc.moveDown();
  doc.text(`Subtotal: ₹${booking.pricing.subtotal}`);
  doc.text(`Tax (GST): ₹${booking.pricing.tax}`);
  doc.text(`Discount: ₹${booking.pricing.discount}`);
  doc.text(`Total: ₹${booking.pricing.total}`);
  doc.text(`Payment Status: ${booking.payment.status}`);

  doc.end();
});
