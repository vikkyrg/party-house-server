const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const invoiceService = require('../services/invoiceService');
const logger = require('../utils/logger');
const Theater = require('../models/Theater');
const Room = require('../models/Room');
const Cake = require('../models/Cake');
const AddOn = require('../models/AddOn');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendEmail } = require('../services/emailService');
const { sendSMS } = require('../services/smsService');
const appConfig = require('../config/app');
const { GST_RATE } = require('../utils/constants');

exports.createBooking = catchAsync(async (req, res, next) => {
  const { theaterId, roomId, date, timeSlot, eventTypeId, addOns, customerDetails, discountCode } =
    req.body;

  const theater = await Theater.findById(theaterId).populate('city');
  if (!theater || !theater.isActive) {
    return next(new AppError('Theater not found or inactive', 404));
  }

  const room = await Room.findOne({ _id: roomId, theater: theaterId });
  if (!room || !room.isActive) return next(new AppError('Room not found or inactive', 404));

  // Validate Capacity
  const members = parseInt(customerDetails.members || 1, 10);
  const kids = parseInt(customerDetails.kids || 0, 10);
  const extraGuestCount = Math.max(0, members - room.capacity);
  const extraGuestTotal = extraGuestCount * (room.extraGuestPrice || 0);

  const bookingDate = new Date(date);
  bookingDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(bookingDate.getTime()) || bookingDate < today) {
    return next(new AppError('Booking date must be today or a future date.', 400));
  }

  const configuredSlots = (room.slots || []).filter((slot) => slot.isActive !== false).map(
    (slot) => `${slot.startTime} - ${slot.endTime}`
  );
  if (!configuredSlots.includes(timeSlot)) {
    return next(new AppError('The selected time slot is not available for this theater.', 400));
  }

  let selectedCake = null;
  if (req.body.cake) {
    selectedCake = await Cake.findOne({ _id: req.body.cake.cakeId, isActive: true });
    if (!selectedCake) return next(new AppError('The selected cake is no longer available.', 400));
    const selectedSize = selectedCake.sizes.find((size) => size.name === req.body.cake.size);
    if (!selectedSize) return next(new AppError('The selected cake size is no longer available.', 400));
    selectedCake = { document: selectedCake, size: selectedSize };
  }

  // Prevent Double Booking
  const existingBooking = await Booking.findOne({
    room: roomId,
    date: bookingDate,
    timeSlot,
    status: { $nin: ['cancelled', 'no-show', 'failed'] },
  });

  if (existingBooking) {
    return next(new AppError('Sorry, this slot is no longer available. Please select another time.', 400));
  }

  const theaterPrice = room.basePrice;
  let addOnsTotal = 0;
  let cakePrice = 0;
  let processedCake = undefined;
  const processedAddOns = [];

  // Process Cake Selection
  if (selectedCake) {
    cakePrice = selectedCake.size.price;
    processedCake = {
      cakeId: selectedCake.document._id,
      name: selectedCake.document.name,
      size: selectedCake.size.name,
      sizeLabel: selectedCake.size.label,
      price: cakePrice
    };
  }

  if (addOns?.length) {
    for (const addon of addOns) {
      const addOnDoc = await AddOn.findById(addon.id || addon.addOnId);
      if (addOnDoc?.isActive) {
        let price = addOnDoc.price || 0;
        
        const quantity = addon.quantity || 1;
        addOnsTotal += price * quantity;
        processedAddOns.push({
          addOn: addOnDoc._id,
          quantity,
          price,
        });
      }
    }
  }

  const subtotal = theaterPrice + extraGuestTotal + cakePrice + addOnsTotal;
  const tax = 0; // Using zero tax as per requirement summary
  let discount = 0;
  if (discountCode) discount = subtotal * 0.1;

  const total = subtotal + tax - discount;
  const advanceAmount = 750;
  const balanceAmount = total > advanceAmount ? total - advanceAmount : 0;

  let booking;
  try {
    booking = await Booking.create({
      user: req.user._id,
      theater: theaterId,
      room: roomId,
      city: theater.city?._id,
      date: bookingDate,
      timeSlot,
      eventType: eventTypeId,
      cake: processedCake,
      addOns: processedAddOns,
      pricing: { theaterPrice, roomBasePrice: theaterPrice, extraGuestPrice: room.extraGuestPrice || 0, extraGuestCount, extraGuestTotal, addOnsTotal, cakePrice, subtotal, tax, discount, discountCode, total, advanceAmount, balanceAmount },
      customerDetails: {
        ...customerDetails,
        members,
        kids
      },
      status: 'pending',
    });
  } catch (error) {
    if (error?.code === 11000) {
      return next(new AppError('Sorry, this slot is no longer available. Please select another time.', 400));
    }
    throw error;
  }

  await booking.populate([
    { path: 'theater', select: 'name images address' },
    { path: 'eventType', select: 'name' },
    { path: 'addOns.addOn', select: 'name price category' },
  ]);

  await User.findByIdAndUpdate(req.user._id, { $push: { bookings: booking._id } });
  await Theater.findByIdAndUpdate(theaterId, { $inc: { totalBookings: 1 } });

  // Do not send SMS/Email until payment is complete (handled elsewhere), but left here to preserve existing flow
  try {
    await sendEmail({
      to: customerDetails.email,
      subject: `Booking Request Initiated - ${booking.bookingId}`,
      template: 'booking-confirmation',
      data: { booking, customerName: customerDetails.name },
    });
  } catch(err) {
     logger.error('Failed to send email:', err);
  }

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
    .populate('addOns.addOn', 'name price category');

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
    .populate('addOns.addOn', 'name price category')
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

  try {
    await sendEmail({
      to: booking.customerDetails.email,
      subject: `Booking Cancelled - ${booking.bookingId}`,
      template: 'booking-cancelled',
      data: { booking },
    });
  } catch (err) {
    logger.error('Failed to send cancellation email', err);
  }

  res.json({ success: true, message: 'Booking cancelled successfully', data: booking });
});

exports.checkAvailability = catchAsync(async (req, res, next) => {
  const { theaterId, roomId, date } = req.query;
  const bookingDate = new Date(date);
  bookingDate.setHours(0, 0, 0, 0);

  const room = roomId ? await Room.findById(roomId) : null;
  const theater = roomId ? await Theater.findById(room?.theater) : await Theater.findById(theaterId);
  if (!theater) {
    return next(new AppError('Theater not found', 404));
  }

  const bookedSlots = await Booking.find({
    ...(roomId ? { room: roomId } : { theater: theaterId }),
    date: bookingDate,
    status: { $nin: ['cancelled', 'no-show', 'failed'] },
  }).select('timeSlot');

  let allSlots = [];
  const configuredSlots = roomId ? room?.slots : theater.slots;
  if (configuredSlots && configuredSlots.length > 0) {
    const parseTime = (timeStr) => {
      if (!timeStr) return 0;
      const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!match) return 0;
      let [_, hours, minutes, modifier] = match;
      hours = parseInt(hours, 10);
      if (hours === 12) hours = 0;
      if (modifier.toUpperCase() === 'PM') hours += 12;
      return hours * 60 + parseInt(minutes, 10);
    };

    const sortedSlots = [...configuredSlots].filter((slot) => slot.isActive !== false).sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
    allSlots = sortedSlots.map(s => `${s.startTime} - ${s.endTime}`);
  }

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
