const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const invoiceService = require('../services/invoiceService');
const logger = require('../utils/logger');
const Theater = require('../models/Theater');
const Room = require('../models/Room');
const Cake = require('../models/Cake');
const AddOn = require('../models/AddOn');
const User = require('../models/User');
const EventType = require('../models/EventType');
const Location = require('../models/Location');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { sendEmail } = require('../services/emailService');
const { sendSMS } = require('../services/smsService');
const appConfig = require('../config/app');
const { GST_RATE } = require('../utils/constants');

const {
  parseTimeToMinutes,
  getSlotInterval,
  doesOverlap,
  normalizeBookingDate,
  formatDateToYMD,
  getActiveBookingsFilter,
} = require('../utils/dateUtils');

exports.createBooking = catchAsync(async (req, res, next) => {
  const { theaterId, roomId, locationId, date, bookingDate, timeSlot, timeSlotId, eventTypeId, addOns, customerDetails, discountCode } =
    req.body;

  let duration = parseInt(req.body.duration, 10);
  if (!duration || ![1, 2, 3].includes(duration)) {
    // If not explicitly provided, calculate duration from timeSlot (e.g. "10:30 AM - 12:30 PM" = 2 hours)
    if (timeSlot && timeSlot.includes('-')) {
      const parts = timeSlot.split('-').map(s => s.trim());
      const s = parseTimeToMinutes(parts[0]);
      const e = parseTimeToMinutes(parts[1]);
      if (s !== undefined && e !== undefined && e > s) {
        const diffHrs = Math.round((e - s) / 60);
        if ([1, 2, 3].includes(diffHrs)) {
          duration = diffHrs;
        }
      }
    }
    if (!duration || ![1, 2, 3].includes(duration)) {
      duration = 2; // Default standard slot duration
    }
  }

  const theater = await Theater.findById(theaterId).populate('city');
  if (!theater || !theater.isActive) {
    return next(new AppError('Theater not found or inactive', 404));
  }

  const room = await Room.findOne({ _id: roomId, theater: theaterId });
  if (!room || !room.isActive) return next(new AppError('Room not found or inactive', 404));

  const members = parseInt(customerDetails.members || 1, 10);
  const kids = parseInt(customerDetails.kids || 0, 10);
  if (members > room.maximumMembers) {
    return next(new AppError(`Maximum ${room.maximumMembers} members allowed for this room.`, 400));
  }

  const normalizedBookingDate = normalizeBookingDate(bookingDate || date);
  const today = normalizeBookingDate(new Date());
  if (!normalizedBookingDate || normalizedBookingDate < today) {
    return next(new AppError('Booking date must be today or a future date.', 400));
  }

  const configuredSlots = (room.slots || []).filter((slot) => slot.isActive !== false).map(
    (slot) => `${slot.startTime} - ${slot.endTime}`
  );
  if (!configuredSlots.includes(timeSlot)) {
    return next(new AppError('The selected time slot is not available for this theater.', 400));
  }
  if (timeSlotId && !room.slots.id(timeSlotId)) {
    return next(new AppError('The selected time slot is not available for this room.', 400));
  }

  let selectedCake = null;
  if (req.body.cake) {
    selectedCake = await Cake.findOne({ _id: req.body.cake.cakeId, isActive: true });
    if (!selectedCake) return next(new AppError('The selected cake is no longer available.', 400));
    const selectedSize = selectedCake.sizes.find((size) => size.name === req.body.cake.size);
    if (!selectedSize) return next(new AppError('The selected cake size is no longer available.', 400));
    selectedCake = { document: selectedCake, size: selectedSize };
  }

  let booking = null;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Prevent Double Booking with Overlap Logic and Concurrency Protection
    const activeFilter = getActiveBookingsFilter({
      room: roomId,
      date: normalizedBookingDate,
    });

    const activeBookings = await Booking.find(activeFilter).session(session);

    const isOverlap = activeBookings.some((b) => doesOverlap(b.timeSlot, timeSlot));

    if (isOverlap) {
      await session.abortTransaction();
      session.endSession();
      return next(new AppError('This time slot has just been booked. Please select another available slot.', 409));
    }

  let theaterPrice = 0;
  if (duration === 1) theaterPrice = room.price1Hour;
  else if (duration === 2) theaterPrice = room.price2Hours;
  else if (duration === 3) theaterPrice = room.price3Hours;

  if (!theaterPrice || theaterPrice <= 0) {
    theaterPrice = room.price2Hours || room.weekdayPrice || room.price1Hour || room.price3Hours || 1299;
  }
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

  const eventTypeDoc = await EventType.findById(eventTypeId);
  if (!eventTypeDoc || !eventTypeDoc.isActive) {
    return next(new AppError('Selected occasion/event type is not valid.', 400));
  }

  let locationDoc = null;
  if (locationId || theater.location) {
    locationDoc = await Location.findById(locationId || theater.location);
  }

  // Parse start and end time from timeSlot string (e.g. "10:00 AM - 01:00 PM")
  let startTime = '';
  let endTime = '';
  if (timeSlot && timeSlot.includes('-')) {
    const slotParts = timeSlot.split('-').map(s => s.trim());
    startTime = slotParts[0] || '';
    endTime = slotParts[1] || '';
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
          name: addOnDoc.name,
          variantName: addon.variantName || '',
          quantity,
          price,
        });
      }
    }
  }

  const subtotal = theaterPrice + cakePrice + addOnsTotal;
  const tax = 0; // Using zero tax as per requirement summary
  let discount = 0;
  if (discountCode) discount = subtotal * 0.1;

  const total = subtotal + tax - discount;
  const advanceAmount = 750;
  const balanceAmount = total > advanceAmount ? total - advanceAmount : 0;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute unpaid payment window

  try {
    const createdBookings = await Booking.create([{
      user: req.user._id,
      theater: theaterId,
      theaterName: theater.name,
      location: locationDoc ? locationDoc._id : undefined,
      locationName: locationDoc ? locationDoc.name : '',
      room: roomId,
      roomName: room.name,
      city: theater.city?._id,
      cityName: theater.city?.name || '',
      date: normalizedBookingDate,
      timeSlot,
      timeSlotId: timeSlotId || undefined,
      startTime,
      endTime,
      duration,
      eventType: eventTypeId,
      eventTypeName: eventTypeDoc.name,
      cake: processedCake,
      addOns: processedAddOns,
      pricing: { theaterPrice, roomBasePrice: theaterPrice, addOnsTotal, cakePrice, subtotal, tax, discount, discountCode, total, advanceAmount, balanceAmount },
      customerDetails: {
        ...customerDetails,
        members,
        kids
      },
      payment: {
        status: 'pending',
        provider: 'upi_qr',
        method: 'upi',
        amountPaid: 0,
        currency: 'INR',
      },
      status: 'pending_payment',
      expiresAt,
    }], { session });

    booking = createdBookings[0];

    await User.findByIdAndUpdate(req.user._id, { $push: { bookings: booking._id } }, { session });
    await Theater.findByIdAndUpdate(theaterId, { $inc: { totalBookings: 1 } }, { session });

    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    if (error?.code === 11000) {
      return next(new AppError('This time slot has just been booked. Please select another available slot.', 409));
    }
    throw error;
  }

  await booking.populate([
    { path: 'theater', select: 'name images address' },
    { path: 'eventType', select: 'name' },
    { path: 'addOns.addOn', select: 'name price category' },
  ]);

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

  } catch (error) {
    // Already handled abortion in inner try-catch, but catch any outer errors just in case
    if (session.inTransaction()) {
      await session.abortTransaction();
      session.endSession();
    }
    return next(error);
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
  const { roomId, date } = req.query;
  const bookingDate = normalizeBookingDate(date);
  if (!bookingDate) return next(new AppError('A valid date is required (YYYY-MM-DD)', 400));

  const room = await Room.findById(roomId);
  const theater = room ? await Theater.findById(room.theater) : null;
  if (!room || !room.isActive || !theater || !theater.isActive) return next(new AppError('Room not found or inactive', 404));

  const filter = getActiveBookingsFilter({
    room: roomId,
    date: bookingDate,
  });

  const bookedBookings = await Booking.find(filter).select('timeSlot status payment duration expiresAt');

  const configuredSlots = (room.slots || [])
    .filter((slot) => slot.isActive !== false)
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

  const slots = configuredSlots.map((s) => {
    const slotStr = `${s.startTime} - ${s.endTime}`;
    const conflicting = bookedBookings.find((b) => doesOverlap(b.timeSlot, slotStr));
    const available = !conflicting;

    const interval = getSlotInterval(slotStr);
    const durationHours = interval ? Math.round((interval.end - interval.start) / 60) : 2;

    let reason = null;
    if (!available && conflicting) {
      if (conflicting.status === 'confirmed') {
        reason = 'Booked and confirmed';
      } else if (conflicting.status === 'pending_verification') {
        reason = 'Payment submitted & under verification';
      } else {
        reason = 'Temporarily reserved';
      }
    }

    return {
      id: s._id,
      _id: s._id,
      time: slotStr,
      startTime: s.startTime,
      endTime: s.endTime,
      duration: durationHours,
      available,
      status: available ? 'available' : 'booked',
      reason,
    };
  });

  const availableSlots = slots.filter((s) => s.available);
  const bookedSlots = slots.filter((s) => !s.available);

  res.json({
    success: true,
    data: {
      room: room.name,
      roomId: room._id,
      date: formatDateToYMD(date),
      slots,
      availableSlots: availableSlots.map((s) => s.time),
      bookedSlots: bookedSlots.map((s) => s.time),
      detailedSlots: slots,
    },
  });
});

exports.rescheduleBooking = catchAsync(async (req, res, next) => {
  const { date, timeSlot } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) return next(new AppError('Booking not found', 404));

  const bookingDate = normalizeBookingDate(date);
  if (!bookingDate) return next(new AppError('A valid date is required (YYYY-MM-DD)', 400));

  const filter = getActiveBookingsFilter({
    _id: { $ne: booking._id },
    theater: booking.theater,
    room: booking.room,
    date: bookingDate,
  });

  const activeBookings = await Booking.find(filter);

  const conflict = activeBookings.some((b) => doesOverlap(b.timeSlot, timeSlot));

  if (conflict) return next(new AppError('Selected slot is not available due to overlap.', 409));

  booking.date = bookingDate;
  booking.timeSlot = timeSlot;
  await booking.save();

  res.json({ success: true, message: 'Booking rescheduled successfully', data: booking });
});

// Add new endpoint to download invoice
exports.downloadInvoice = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const isObjectId = mongoose.isValidObjectId(id);
  const query = isObjectId ? { $or: [{ _id: id }, { bookingId: id }] } : { bookingId: id };

  const booking = await Booking.findOne(query)
    .populate('theater', 'name address city')
    .populate('room', 'name')
    .populate('cake', 'name')
    .populate('eventType', 'name')
    .populate('addOns.addOn', 'name');

  if (!booking) {
    return next(new AppError('Booking not found', 404));
  }

  // Check authorization (allow booking owner, admin, or super-admin)
  const isOwner = booking.user && booking.user.toString() === req.user?._id?.toString();
  const isAdminUser = ['admin', 'super-admin'].includes(req.user?.role);
  if (!isOwner && !isAdminUser) {
    return next(new AppError('Not authorized to access this invoice', 403));
  }

  // Generate invoice
  const invoicePath = await invoiceService.generateInvoice(booking);

  // Send file
  res.download(invoicePath, `${booking.bookingId || 'booking'}-invoice.pdf`, (err) => {
    if (err) {
      logger.error('Error sending invoice:', err);
    }
  });
});
