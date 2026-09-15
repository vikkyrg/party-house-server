const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const invoiceService = require('../services/invoiceService');
const logger = require('../utils/logger');
const Theater = require('../models/Theater');
const AddOn = require('../models/AddOn');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendEmail } = require('../services/emailService');
const { sendSMS } = require('../services/smsService');
const appConfig = require('../config/app');
const { GST_RATE } = require('../utils/constants');

exports.createBooking = catchAsync(async (req, res, next) => {
  const { theaterId, date, timeSlot, eventTypeId, addOns, customerDetails, discountCode } =
    req.body;

  const theater = await Theater.findById(theaterId).populate('city');
  if (!theater || !theater.isActive) {
    return next(new AppError('Theater not found or inactive', 404));
  }

  const bookingDate = new Date(date);
  bookingDate.setHours(0, 0, 0, 0);

  const existingBooking = await Booking.findOne({
    theater: theaterId,
    date: bookingDate,
    timeSlot,
    status: { $nin: ['cancelled', 'no-show'] },
  });

  if (existingBooking) {
    return next(new AppError('This time slot is already booked', 400));
  }

  const theaterPrice = theater.pricePerHour;
  let addOnsTotal = 0;
  const processedAddOns = [];

  if (addOns?.length) {
    for (const addon of addOns) {
      const addOnDoc = await AddOn.findById(addon.addOnId);
      if (addOnDoc?.isActive) {
        const quantity = addon.quantity || 1;
        addOnsTotal += addOnDoc.price * quantity;
        processedAddOns.push({
          addOn: addOnDoc._id,
          quantity,
          price: addOnDoc.price,
        });
      }
    }
  }

  const subtotal = theaterPrice + addOnsTotal;
  const tax = subtotal * GST_RATE;
  let discount = 0;
  if (discountCode) discount = subtotal * 0.1;

  const total = subtotal + tax - discount;

  const booking = await Booking.create({
    user: req.user._id,
    theater: theaterId,
    city: theater.city._id,
    date: bookingDate,
    timeSlot,
    eventType: eventTypeId,
    addOns: processedAddOns,
    pricing: { theaterPrice, addOnsTotal, subtotal, tax, discount, discountCode, total },
    customerDetails,
    status: 'pending',
  });

  await booking.populate([
    { path: 'theater', select: 'name images address' },
    { path: 'eventType', select: 'name' },
    { path: 'addOns.addOn', select: 'name price' },
  ]);

  await User.findByIdAndUpdate(req.user._id, { $push: { bookings: booking._id } });
  await Theater.findByIdAndUpdate(theaterId, { $inc: { totalBookings: 1 } });

  await sendEmail({
    to: customerDetails.email,
    subject: `Booking Confirmation - ${booking.bookingId}`,
    template: 'booking-confirmation',
    data: { booking, customerName: customerDetails.name },
  });

  await sendSMS(
    customerDetails.phone,
    `[${appConfig.brandName}] Booking confirmed! ID: ${booking.bookingId}. Theater: ${theater.name}. Date: ${bookingDate.toLocaleDateString()}`
  );

  res.status(201).json({
    success: true,
    message: 'Booking created successfully',
    data: booking,
  });
});

exports.getUserBookings = catchAsync(async (req, res) => {
  const query =
    req.user.role === 'admin' || req.user.role === 'super-admin' ? {} : { user: req.user._id };

  const bookings = await Booking.find(query)
    .sort({ createdAt: -1 })
    .populate('theater', 'name images city')
    .populate('eventType', 'name')
    .populate('addOns.addOn', 'name price');

  res.json({ success: true, count: bookings.length, data: bookings });
});

exports.getMyBookings = catchAsync(async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate('theater', 'name images')
    .populate('eventType', 'name');

  res.json({ success: true, count: bookings.length, data: bookings });
});

exports.getBooking = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('theater', 'name images address city location')
    .populate('eventType', 'name')
    .populate('addOns.addOn', 'name price')
    .populate('user', 'name email phone');

  if (!booking) return next(new AppError('Booking not found', 404));

  if (
    booking.user._id.toString() !== req.user._id.toString() &&
    !['admin', 'super-admin'].includes(req.user.role)
  ) {
    return next(new AppError('Not authorized to view this booking', 403));
  }

  res.json({ success: true, data: booking });
});

exports.cancelBooking = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) return next(new AppError('Booking not found', 404));

  if (
    booking.user.toString() !== req.user._id.toString() &&
    !['admin', 'super-admin'].includes(req.user.role)
  ) {
    return next(new AppError('Not authorized to cancel this booking', 403));
  }

  if (booking.status === 'cancelled') {
    return next(new AppError('Booking is already cancelled', 400));
  }

  booking.status = 'cancelled';
  booking.cancelledBy = req.user._id;
  booking.cancellationReason = reason;
  booking.cancelledAt = new Date();

  if (booking.payment.status === 'paid') {
    booking.payment.status = 'refunded';
    booking.payment.refundedAt = new Date();
  }

  await booking.save();

  await sendEmail({
    to: booking.customerDetails.email,
    subject: `Booking Cancelled - ${booking.bookingId}`,
    template: 'booking-cancelled',
    data: { booking },
  });

  res.json({ success: true, message: 'Booking cancelled successfully', data: booking });
});

exports.checkAvailability = catchAsync(async (req, res) => {
  const { theaterId, date } = req.query;
  const bookingDate = new Date(date);
  bookingDate.setHours(0, 0, 0, 0);

  const bookedSlots = await Booking.find({
    theater: theaterId,
    date: bookingDate,
    status: { $nin: ['cancelled', 'no-show'] },
  }).select('timeSlot');

  const allSlots = [
    '10:00 AM - 1:00 PM',
    '2:00 PM - 5:00 PM',
    '6:00 PM - 9:00 PM',
    '9:30 PM - 12:30 AM',
  ];

  const booked = bookedSlots.map((b) => b.timeSlot);
  const available = allSlots.filter((slot) => !booked.includes(slot));

  res.json({
    success: true,
    data: { date: bookingDate, availableSlots: available, bookedSlots: booked },
  });
});

exports.rescheduleBooking = catchAsync(async (req, res, next) => {
  const { date, timeSlot } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) return next(new AppError('Booking not found', 404));

  const bookingDate = new Date(date);
  bookingDate.setHours(0, 0, 0, 0);

  const conflict = await Booking.findOne({
    _id: { $ne: booking._id },
    theater: booking.theater,
    date: bookingDate,
    timeSlot,
    status: { $nin: ['cancelled', 'no-show'] },
  });

  if (conflict) return next(new AppError('Selected slot is not available', 400));

  booking.date = bookingDate;
  booking.timeSlot = timeSlot;
  await booking.save();

  res.json({ success: true, message: 'Booking rescheduled successfully', data: booking });
});

// Add new endpoint to download invoice
exports.downloadInvoice = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const booking = await Booking.findById(id)
    .populate('theater', 'name address')
    .populate('eventType', 'name')
    .populate('addOns.addOn', 'name');

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Check authorization
  if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('Not authorized to access this invoice', 403));
  }

  // Generate invoice
  const invoicePath = await invoiceService.generateInvoice(booking);

  // Send file
  res.download(invoicePath, `${booking.bookingId}-invoice.pdf`, (err) => {
    if (err) {
      logger.error('Error sending invoice:', err);
    }
  });
});
