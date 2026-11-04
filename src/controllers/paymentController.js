const { createBookingNotification } = require('../services/bookingNotificationService');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendEmail } = require('../services/emailService');
const { getBookingHoldExpiry } = require('../utils/dateUtils');
const {
  getPaymentSummary,
  verifiedAmountExpression,
  paymentRecordsSummaryUpdate,
} = require('../services/bookingPaymentService');

const expireBookingHold = async (booking, now) => {
  const expiryUpdate = {
    status: 'cancelled',
    cancellationReason: 'Booking reservation expired due to uncompleted advance payment within 10-minute hold window.',
    cancelledAt: now,
  };

  booking.status = expiryUpdate.status;
  booking.cancellationReason = expiryUpdate.cancellationReason;
  booking.cancelledAt = expiryUpdate.cancelledAt;
  await booking.save();

  if (booking.isBulkBooking && booking.bulkBookingId) {
    await Booking.updateMany(
      {
        bulkBookingId: booking.bulkBookingId,
        _id: { $ne: booking._id },
        status: { $in: ['pending', 'pending_payment', 'pending_verification'] },
        'payment.status': { $in: ['pending', 'failed', 'submitted', 'pending_verification'] },
      },
      { $set: expiryUpdate }
    );
  }
};

/**
 * Submit UPI transaction reference by the customer after scanning QR
 * Changes payment status to 'submitted' and booking status to 'pending_verification'
 */
exports.submitUpiPayment = catchAsync(async (req, res, next) => {
  const { bookingId, paymentAmount, transactionReference, upiTransactionId } = req.body;
  const submittedAmount = Number(paymentAmount);
  const rawReference = transactionReference || upiTransactionId;

  if (!bookingId || !rawReference || typeof rawReference !== 'string' || !rawReference.trim()) {
    return next(new AppError('Booking ID, payment amount, and UPI transaction reference are required', 400));
  }
  if (!Number.isFinite(submittedAmount) || submittedAmount < 1 || Math.round(submittedAmount * 100) !== submittedAmount * 100) {
    return next(new AppError('Payment amount must be at least ₹1 and use no more than two decimal places.', 400));
  }

  // Validate format (UPI references are typically 10 to 22 alphanumeric characters/digits)
  const trimmedRef = rawReference.trim();
  if (trimmedRef.length < 6 || trimmedRef.length > 35) {
    return next(new AppError('Please enter a valid UPI transaction reference number (UTR/Ref No)', 400));
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Authorization check: must be owner or admin
  if (
    booking.user.toString() !== req.user._id.toString() &&
    !['admin', 'super-admin'].includes(req.user.role)
  ) {
    return next(new AppError('Not authorized to update this booking', 403));
  }

  if (booking.status === 'cancelled' || booking.payment.status === 'refunded') {
    return next(new AppError('This booking is not eligible for payment.', 409));
  }

  const now = new Date();
  const holdExpiry = getBookingHoldExpiry(booking);
  const isPendingBooking = ['pending', 'pending_payment', 'pending_verification'].includes(booking.status);
  const isHoldExpired = isPendingBooking && holdExpiry && holdExpiry <= now;

  // Check if booking has already been cancelled or expired
  if (isHoldExpired) {
    if (booking.status !== 'cancelled') await expireBookingHold(booking, now);
    return next(new AppError('This reservation has expired because the 10-minute hold window closed. Please select an available slot and reserve again.', 409));
  }

  const summary = getPaymentSummary(booking);
  if (summary.remainingBalance <= 0) {
    return next(new AppError('This booking is fully paid. No additional payment is due.', 409));
  }
  if (submittedAmount > summary.remainingBalance) {
    return next(new AppError(`Payment amount cannot exceed the remaining balance of ₹${summary.remainingBalance}.`, 400));
  }

  const normalizedReference = trimmedRef.toUpperCase();
  const escapedReference = normalizedReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const duplicateReference = await Booking.exists({
    $or: [
      { 'paymentRecords.transactionReferenceNormalized': normalizedReference },
      { 'payment.upiTransactionId': { $regex: `^${escapedReference}$`, $options: 'i' } },
    ],
  });
  if (duplicateReference) {
    return next(new AppError('This UPI transaction reference has already been submitted.', 409));
  }

  const paymentRecordId = new mongoose.Types.ObjectId();
  const paymentRecord = {
    _id: paymentRecordId,
    bookingId: booking._id,
    paymentAmount: submittedAmount,
    transactionReference: trimmedRef,
    transactionReferenceNormalized: normalizedReference,
    paymentMethod: 'upi',
    paymentStatus: 'pending_verification',
    submittedAt: now,
  };
  const remainingBalanceExpression = {
    $subtract: [
      { $ifNull: ['$pricing.total', 0] },
      verifiedAmountExpression(),
    ],
  };
  let updatedBooking;
  try {
    updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: { $in: ['pending', 'pending_payment', 'pending_verification', 'confirmed', 'completed'] },
        'paymentRecords.transactionReferenceNormalized': { $ne: normalizedReference },
        $expr: {
          $and: [
            { $gt: [remainingBalanceExpression, 0] },
            { $lte: [submittedAmount, remainingBalanceExpression] },
          ],
        },
      },
      [
        {
          $set: {
            paymentRecords: {
              $concatArrays: [{ $ifNull: ['$paymentRecords', []] }, [paymentRecord]],
            },
            'payment.legacyVerifiedAmount': {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $size: { $ifNull: ['$paymentRecords', []] } }, 0] },
                    { $in: ['$payment.status', ['paid', 'partial', 'partially_paid', 'fully_paid']] },
                  ],
                },
                { $ifNull: ['$payment.amountPaid', 0] },
                { $ifNull: ['$payment.legacyVerifiedAmount', 0] },
              ],
            },
            status: {
              $cond: [
                { $in: ['$status', ['pending', 'pending_payment', 'pending_verification']] },
                'pending_verification',
                '$status',
              ],
            },
            'payment.method': 'upi',
            'payment.provider': 'upi_qr',
            'payment.upiTransactionId': trimmedRef,
            'payment.submittedAt': now,
          },
        },
        { $set: paymentRecordsSummaryUpdate() },
      ],
      { new: true, runValidators: true }
    );
  } catch (error) {
    if (error?.code === 11000) {
      return next(new AppError('This UPI transaction reference has already been submitted.', 409));
    }
    throw error;
  }

  if (!updatedBooking) {
    return next(new AppError('Payment exceeds the current remaining balance or the booking is no longer eligible for payment.', 409));
  }

  if (updatedBooking.isBulkBooking && updatedBooking.bulkBookingId) {
    await Booking.updateMany(
      {
        bulkBookingId: updatedBooking.bulkBookingId,
        _id: { $ne: updatedBooking._id },
        status: { $in: ['pending', 'pending_payment', 'pending_verification'] },
      },
      {
        $set: {
          status: 'pending_verification',
          'payment.status': 'pending_verification',
          'payment.upiTransactionId': trimmedRef,
          'payment.submittedAt': now,
        },
      }
    );
  }

  const paymentSummary = getPaymentSummary(updatedBooking);
  res.json({
    success: true,
    message: 'Payment submitted successfully. It is awaiting admin verification.',
    data: {
      bookingId: updatedBooking._id,
      bookingReference: updatedBooking.bookingId,
      status: updatedBooking.status,
      paymentStatus: updatedBooking.payment.status,
      paymentRecords: updatedBooking.paymentRecords,
      paymentSummary,
      expiresAt: updatedBooking.expiresAt,
      holdExpiresAt: updatedBooking.holdExpiresAt,
    },
  });
});

/**
 * Check payment and booking verification status (used by customer modal poller)
 */
exports.checkPaymentStatus = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.bookingId);
  if (!booking) return next(new AppError('Booking not found', 404));

  if (
    booking.user.toString() !== req.user._id.toString() &&
    !['admin', 'super-admin'].includes(req.user.role)
  ) {
    return next(new AppError('Not authorized', 403));
  }

  const now = new Date();
  const effectiveExpiry = getBookingHoldExpiry(booking);
  const isExpired =
    ['pending', 'pending_payment', 'pending_verification'].includes(booking.status) &&
    ['pending', 'failed', 'submitted', 'pending_verification'].includes(booking.payment?.status) &&
    effectiveExpiry &&
    effectiveExpiry <= now;

  if (isExpired) await expireBookingHold(booking, now);

  let bulkEntries = undefined;
  if (booking.isBulkBooking && booking.bulkBookingId) {
    bulkEntries = await Booking.find({ bulkBookingId: booking.bulkBookingId })
      .select('bookingId roomName theaterName date timeSlot status payment.status')
      .lean();
  }

  res.json({
    success: true,
    data: {
      bookingId: booking._id,
      bookingReference: booking.bookingId,
      isBulkBooking: !!booking.isBulkBooking,
      bulkBookingId: booking.bulkBookingId || null,
      bulkEntries,
      status: isExpired ? 'cancelled' : booking.status,
      paymentStatus: booking.payment?.status,
      upiTransactionId: booking.payment?.upiTransactionId,
      amountPaid: booking.payment?.amountPaid || 0,
      paidAt: booking.payment?.paidAt,
      rejectedReason: booking.payment?.rejectedReason,
      expiresAt: effectiveExpiry,
      holdExpiresAt: effectiveExpiry,
      isExpired,
      paymentRecords: booking.paymentRecords,
      paymentSummary: getPaymentSummary(booking),
    },
  });
});

/**
 * Get PDF invoice for booking
 */
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

  doc.fontSize(20).text('CS Cinemas / Rio Party House - Receipt', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Booking Reference: ${booking.bookingId}`);
  doc.text(`Customer Name: ${booking.customerDetails?.name || 'Customer'}`);
  doc.text(`Theater: ${booking.theaterName || booking.theater?.name || 'CS Cinemas'}`);
  doc.text(`Room: ${booking.roomName || 'Private Room'}`);
  doc.text(`Date: ${new Date(booking.date).toDateString()}`);
  doc.text(`Time Slot: ${booking.timeSlot}`);
  doc.text(`Occasion: ${booking.eventTypeName || booking.eventType?.name || 'Celebration'}`);
  doc.moveDown();
  doc.text(`Total Booking Value: ₹${booking.pricing?.total || 0}`);
  doc.text(`Advance Required: ₹${booking.pricing?.advanceAmount || 750}`);
  doc.text(`Advance Paid: ₹${booking.payment?.amountPaid || 0}`);
  doc.text(`Balance Due at Venue: ₹${Math.max(0, (booking.pricing?.total || 0) - (booking.payment?.amountPaid || 0))}`);
  doc.text(`Payment Status: ${(booking.payment?.status || 'pending').toUpperCase()}`);
  if (booking.payment?.upiTransactionId) {
    doc.text(`UPI Reference: ${booking.payment.upiTransactionId}`);
  }

  doc.end();
});
