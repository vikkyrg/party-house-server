const PDFDocument = require('pdfkit');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendEmail } = require('../services/emailService');

/**
 * Submit UPI transaction reference by the customer after scanning QR
 * Changes payment status to 'submitted' and booking status to 'pending_verification'
 */
exports.submitUpiPayment = catchAsync(async (req, res, next) => {
  const { bookingId, upiTransactionId } = req.body;

  if (!bookingId || !upiTransactionId || !upiTransactionId.trim()) {
    return next(new AppError('Booking ID and UPI transaction reference are required', 400));
  }

  const trimmedRef = upiTransactionId.trim();

  // Validate format (UPI references are typically 10 to 22 alphanumeric characters/digits)
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

  if (booking.status === 'confirmed' || booking.payment.status === 'paid') {
    return next(new AppError('This booking is already confirmed with verified payment', 400));
  }

  const now = new Date();
  // Check if booking has already been cancelled or expired
  if (
    booking.status === 'cancelled' ||
    (booking.expiresAt && booking.expiresAt < now && ['pending', 'pending_payment'].includes(booking.status))
  ) {
    if (booking.status !== 'cancelled') {
      booking.status = 'cancelled';
      booking.cancellationReason = 'Booking reservation expired due to uncompleted advance payment.';
      booking.cancelledAt = now;
      await booking.save();
    }
    return next(new AppError('This reservation has expired because the 15-minute payment window closed. Please select an available slot and reserve again.', 409));
  }

  // Ensure no other active confirmed or submitted booking has claimed this slot in the meantime
  const { doesOverlap, getActiveBookingsFilter } = require('../utils/dateUtils');
  const conflictFilter = getActiveBookingsFilter({
    _id: { $ne: booking._id },
    room: booking.room,
    date: booking.date,
  });
  const conflictingBookings = await Booking.find(conflictFilter);
  const isConflict = conflictingBookings.some((b) => doesOverlap(b.timeSlot, booking.timeSlot));
  if (isConflict) {
    booking.status = 'cancelled';
    booking.cancellationReason = 'Slot was reserved by another booking before payment submission.';
    booking.cancelledAt = now;
    await booking.save();
    return next(new AppError('This time slot is no longer available as another reservation was completed first.', 409));
  }

  // Save UPI transaction details
  booking.payment.status = 'submitted';
  booking.payment.method = 'upi';
  booking.payment.provider = 'upi_qr';
  booking.payment.upiTransactionId = trimmedRef;
  booking.payment.submittedAt = new Date();
  
  // Transition booking to pending_verification
  booking.status = 'pending_verification';

  // Extend the expiration window so the pending reservation is protected while admin verifies
  booking.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours protection for admin review

  await booking.save();

  res.json({
    success: true,
    message: 'Payment details submitted successfully. Awaiting admin verification.',
    data: {
      bookingId: booking._id,
      bookingReference: booking.bookingId,
      status: booking.status,
      paymentStatus: booking.payment.status,
      upiTransactionId: booking.payment.upiTransactionId,
      submittedAt: booking.payment.submittedAt,
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

  res.json({
    success: true,
    data: {
      bookingId: booking._id,
      bookingReference: booking.bookingId,
      status: booking.status,
      paymentStatus: booking.payment?.status,
      upiTransactionId: booking.payment?.upiTransactionId,
      amountPaid: booking.payment?.amountPaid || 0,
      paidAt: booking.payment?.paidAt,
      rejectedReason: booking.payment?.rejectedReason,
      expiresAt: booking.expiresAt,
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
