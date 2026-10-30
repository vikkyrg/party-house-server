const { createBookingNotification } = require('../services/bookingNotificationService');
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
  BOOKING_HOLD_DURATION_MS,
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
  let session = null;
  let useTransaction = false;

  try {
    const topologyType = mongoose.connection?.client?.topology?.description?.type;
    const isReplicaOrMongos = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded' || topologyType === 'LoadBalanced';
    if (isReplicaOrMongos) {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    }
  } catch (sessErr) {
    // If running on a standalone MongoDB or MemoryServer without replica set, proceed without multi-doc transaction
    session = null;
    useTransaction = false;
  }

  // 1. Idempotency & Duplicate Prevention: Check if the exact same reservation was submitted in the last 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const duplicatePending = await Booking.findOne({
    room: roomId,
    date: normalizedBookingDate,
    timeSlot,
    user: req.user._id,
    createdAt: { $gte: twoMinutesAgo },
    status: { $in: ['pending', 'pending_payment', 'pending_verification', 'confirmed'] },
  });
  if (duplicatePending) {
    // Return existing booking directly to prevent accidental duplicate booking from double-clicks or re-renders
    const populated = await Booking.findById(duplicatePending._id)
      .populate('theater', 'name address')
      .populate('room', 'name price1Hour price2Hours price3Hours maximumMembers')
      .populate('eventType', 'name');
    return res.status(200).json({
      success: true,
      message: 'Booking reservation retrieved.',
      data: populated || duplicatePending,
    });
  }

  // 2. Business Rule: Maximum 3 legitimate completed/active bookings per hour
  // Count only completed bookings (or active reservations) made by this customer/phone in the past 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const customerPhone = (customerDetails.phone || '').trim().replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
  const userBookingsInLastHour = await Booking.countDocuments({
    $or: [
      { user: req.user._id },
      { 'customerDetails.phone': { $regex: new RegExp(`${customerPhone}$`) } },
    ],
    createdAt: { $gte: oneHourAgo },
    // Only count completed/confirmed or actively held reservations awaiting payment
    status: { $in: ['confirmed', 'in-progress', 'completed', 'pending_verification'] },
    'payment.status': { $in: ['paid', 'submitted'] },
  });

  if (userBookingsInLastHour >= 3) {
    return next(new AppError('You can only create 3 bookings per hour. Please contact support for bulk bookings.', 429));
  }

  try {
    // Prevent Double Booking with Overlap Logic and Concurrency Protection
    const activeFilter = getActiveBookingsFilter({
      room: roomId,
      date: normalizedBookingDate,
    });

    const activeBookingsQuery = Booking.find(activeFilter);
    if (useTransaction && session) {
      activeBookingsQuery.session(session);
    }
    const activeBookings = await activeBookingsQuery;

    const isOverlap = activeBookings.some((b) => doesOverlap(b.timeSlot, timeSlot));

    if (isOverlap) {
      if (useTransaction && session) {
        await session.abortTransaction();
        session.endSession();
      }
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
        if (duration === 1 && addOnDoc.price1Hour !== undefined) price = addOnDoc.price1Hour;
        else if (duration === 2 && addOnDoc.price2Hours !== undefined) price = addOnDoc.price2Hours;
        else if (duration === 3 && addOnDoc.price3Hours !== undefined) price = addOnDoc.price3Hours;
        else if (addOnDoc.pricing) {
          if (duration === 1 && addOnDoc.pricing.oneHour !== undefined) price = addOnDoc.pricing.oneHour;
          else if (duration === 2 && addOnDoc.pricing.twoHours !== undefined) price = addOnDoc.pricing.twoHours;
          else if (duration === 3 && addOnDoc.pricing.threeHours !== undefined) price = addOnDoc.pricing.threeHours;
        }
        
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
  const holdDuration = BOOKING_HOLD_DURATION_MS || 10 * 60 * 1000;
  const holdExpiresAt = new Date(Date.now() + holdDuration); // Exactly 10-minute hold window
  const expiresAt = holdExpiresAt;

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
      holdExpiresAt,
    }], useTransaction && session ? { session } : {});

    booking = createdBookings[0];

    const updateOptions = useTransaction && session ? { session } : {};
    await User.findByIdAndUpdate(req.user._id, { $push: { bookings: booking._id } }, updateOptions);
    await Theater.findByIdAndUpdate(theaterId, { $inc: { totalBookings: 1 } }, updateOptions);

    if (useTransaction && session) {
      await session.commitTransaction();
      session.endSession();
    }
  } catch (error) {
    if (useTransaction && session) {
      await session.abortTransaction();
      session.endSession();
    }
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
    if (useTransaction && session && session.inTransaction && session.inTransaction()) {
      await session.abortTransaction();
      session.endSession();
    }
    return next(error);
  }

  // Trigger Admin Notification for New Booking
  createBookingNotification({
    booking,
    type: 'new_booking',
  }).catch(() => {});

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

  // Trigger Admin Notification for Cancelled Booking
  createBookingNotification({
    booking,
    type: 'cancelled',
    message: reason ? `Booking #${booking.bookingId} was cancelled: ${reason}` : undefined,
  }).catch(() => {});

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
    let slotState = 'available';
    let isTemporarilyHeld = false;

    if (!available && conflicting) {
      if (conflicting.status === 'confirmed' || conflicting.payment?.status === 'paid') {
        reason = 'Sold Out';
        slotState = 'sold_out';
      } else if (conflicting.status === 'pending_verification' || conflicting.payment?.status === 'submitted') {
        reason = 'Payment submitted & under verification';
        slotState = 'held';
        isTemporarilyHeld = true;
      } else {
        reason = 'Temporarily reserved — try again shortly';
        slotState = 'held';
        isTemporarilyHeld = true;
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
      slotState,
      isTemporarilyHeld,
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

/**
 * createBulkBooking
 * 
 * Supports booking multiple rooms, dates, or time slots in one transactional/atomic request.
 * - Enforces individual and mutual non-overlap checks.
 * - Applies 10-minute hold window across all child bookings.
 * - Generates shared bulkBookingId.
 * - Calculates individual + combined total & advance payable amounts.
 */
exports.createBulkBooking = catchAsync(async (req, res, next) => {
  const { bookings: requestedBookings, customerDetails, discountCode } = req.body;

  if (!requestedBookings || !Array.isArray(requestedBookings) || requestedBookings.length === 0) {
    return next(new AppError('Please provide at least one booking item.', 400));
  }

  if (requestedBookings.length > 10) {
    return next(new AppError('Maximum 10 rooms/slots can be booked together in a single bulk request.', 400));
  }

  // Ensure user profile attached (from token or provisioned guest customer)
  if (!req.user) {
    return next(new AppError('Customer profile could not be resolved. Please verify your contact details.', 400));
  }

  // 1. In-memory check for duplicates within the bulk request itself
  for (let i = 0; i < requestedBookings.length; i++) {
    for (let j = i + 1; j < requestedBookings.length; j++) {
      const b1 = requestedBookings[i];
      const b2 = requestedBookings[j];
      const sameRoom = b1.roomId === b2.roomId;
      const sameDate = formatDateToYMD(b1.date) === formatDateToYMD(b2.date);
      if (sameRoom && sameDate && doesOverlap(b1.timeSlot, b2.timeSlot)) {
        return next(
          new AppError(
            `Duplicate or overlapping slots selected in your bulk request for Room ${b1.roomId} on ${formatDateToYMD(b1.date)} (${b1.timeSlot} and ${b2.timeSlot}).`,
            400
          )
        );
      }
    }
  }

  // 2. Validate availability and build documents for all requested items
  const preparedItems = [];
  let combinedTotal = 0;
  let combinedAdvance = 0;

  const bulkPrefix = 'CS-BULK';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const bulkId = `${bulkPrefix}-${dateStr}-${Date.now().toString().slice(-4)}`;
  const holdDuration = BOOKING_HOLD_DURATION_MS || 10 * 60 * 1000;
  const holdExpiresAt = new Date(Date.now() + holdDuration);

  for (let idx = 0; idx < requestedBookings.length; idx++) {
    const item = requestedBookings[idx];
    const { theaterId, roomId, locationId, date, timeSlot, timeSlotId, eventTypeId, addOns, cake } = item;

    let duration = parseInt(item.duration, 10);
    if (!duration || ![1, 2, 3].includes(duration)) {
      if (timeSlot && timeSlot.includes('-')) {
        const parts = timeSlot.split('-').map(s => s.trim());
        const s = parseTimeToMinutes(parts[0]);
        const e = parseTimeToMinutes(parts[1]);
        if (s !== undefined && e !== undefined && e > s) {
          const diffHrs = Math.round((e - s) / 60);
          if ([1, 2, 3].includes(diffHrs)) duration = diffHrs;
        }
      }
      if (!duration || ![1, 2, 3].includes(duration)) duration = 2;
    }

    const theater = await Theater.findById(theaterId).populate('city');
    if (!theater || !theater.isActive) {
      return next(new AppError(`Theater for slot #${idx + 1} not found or inactive.`, 404));
    }

    const room = await Room.findOne({ _id: roomId, theater: theaterId });
    if (!room || !room.isActive) {
      return next(new AppError(`Room "${room?.name || roomId}" for slot #${idx + 1} not found or inactive.`, 404));
    }

    const members = parseInt(item.members || customerDetails.members || 1, 10);
    const kids = parseInt(item.kids || customerDetails.kids || 0, 10);
    if (members > room.maximumMembers) {
      return next(new AppError(`Slot #${idx + 1} (${room.name}) exceeds maximum capacity of ${room.maximumMembers} members.`, 400));
    }

    const normalizedBookingDate = normalizeBookingDate(date);
    const today = normalizeBookingDate(new Date());
    if (!normalizedBookingDate || normalizedBookingDate < today) {
      return next(new AppError(`Slot #${idx + 1} booking date must be today or a future date.`, 400));
    }

    // Check configured slots
    const configuredSlots = (room.slots || []).filter((s) => s.isActive !== false).map(
      (s) => `${s.startTime} - ${s.endTime}`
    );
    if (!configuredSlots.includes(timeSlot)) {
      return next(new AppError(`Time slot "${timeSlot}" in Slot #${idx + 1} is not available for room ${room.name}.`, 400));
    }

    // Check existing active bookings in database for overlaps
    const activeFilter = getActiveBookingsFilter({
      room: roomId,
      date: normalizedBookingDate,
    });
    const activeBookings = await Booking.find(activeFilter);
    const isConflict = activeBookings.some((b) => doesOverlap(b.timeSlot, timeSlot));
    if (isConflict) {
      return next(
        new AppError(
          `Slot #${idx + 1} (${room.name}, ${formatDateToYMD(date)}, ${timeSlot}) has just been reserved. Please pick another available slot.`,
          409
        )
      );
    }

    // Resolve event type
    const eventTypeDoc = await EventType.findById(eventTypeId);
    if (!eventTypeDoc) {
      return next(new AppError(`Event type for Slot #${idx + 1} is invalid.`, 400));
    }

    // Resolve location
    let locationDoc = null;
    if (locationId) {
      locationDoc = await Location.findById(locationId);
    } else if (theater.location) {
      locationDoc = await Location.findById(theater.location);
    }

    // Cake processing
    let processedCake = undefined;
    let cakePrice = 0;
    if (cake) {
      const selectedCake = await Cake.findOne({ _id: cake.cakeId, isActive: true });
      if (selectedCake) {
        const selectedSize = selectedCake.sizes.find((s) => s.name === cake.size);
        if (selectedSize) {
          cakePrice = selectedSize.price || 0;
          processedCake = {
            cakeId: selectedCake._id,
            name: selectedCake.name,
            size: selectedSize.name,
            sizeLabel: selectedSize.name,
            flavor: selectedCake.flavor,
            price: cakePrice,
          };
        }
      }
    }

    // AddOns processing
    let addOnsTotal = 0;
    const processedAddOns = [];
    if (addOns && Array.isArray(addOns) && addOns.length > 0) {
      const addOnIds = addOns.map((a) => a.addOnId || a.id).filter(Boolean);
      const addOnDocs = await AddOn.find({ _id: { $in: addOnIds } });
      const addOnMap = new Map(addOnDocs.map((doc) => [doc._id.toString(), doc]));

      for (const itemAddOn of addOns) {
        const aid = (itemAddOn.addOnId || itemAddOn.id)?.toString();
        const doc = addOnMap.get(aid);
        if (doc) {
          const quantity = parseInt(itemAddOn.quantity, 10) || 1;
          let price = doc.price || 0;
          if (duration === 1 && doc.price1Hour !== undefined) price = doc.price1Hour;
          else if (duration === 2 && doc.price2Hours !== undefined) price = doc.price2Hours;
          else if (duration === 3 && doc.price3Hours !== undefined) price = doc.price3Hours;
          else if (doc.pricing) {
            if (duration === 1 && doc.pricing.oneHour !== undefined) price = doc.pricing.oneHour;
            else if (duration === 2 && doc.pricing.twoHours !== undefined) price = doc.pricing.twoHours;
            else if (duration === 3 && doc.pricing.threeHours !== undefined) price = doc.pricing.threeHours;
          }
          addOnsTotal += price * quantity;
          processedAddOns.push({ addOn: doc._id, quantity, price });
        }
      }
    }

    let theaterPrice = 0;
    if (duration === 1) theaterPrice = room.price1Hour;
    else if (duration === 2) theaterPrice = room.price2Hours;
    else if (duration === 3) theaterPrice = room.price3Hours;
    if (!theaterPrice || theaterPrice <= 0) {
      theaterPrice = room.price2Hours || room.weekdayPrice || room.price1Hour || 1299;
    }

    const [startTime, endTime] = timeSlot.split('-').map((s) => s.trim());
    const subtotal = theaterPrice + cakePrice + addOnsTotal;
    const tax = 0;
    let discount = 0;
    if (discountCode) discount = subtotal * 0.1;
    const total = subtotal + tax - discount;
    const advanceAmount = 750;
    const balanceAmount = total > advanceAmount ? total - advanceAmount : 0;

    combinedTotal += total;
    combinedAdvance += advanceAmount;

    preparedItems.push({
      theater,
      room,
      locationDoc,
      eventTypeDoc,
      normalizedBookingDate,
      timeSlot,
      timeSlotId: timeSlotId || undefined,
      startTime,
      endTime,
      duration,
      processedCake,
      processedAddOns,
      pricing: { theaterPrice, roomBasePrice: theaterPrice, addOnsTotal, cakePrice, subtotal, tax, discount, discountCode, total, advanceAmount, balanceAmount },
      members,
      kids,
    });
  }

  // 3. Atomically create all child booking entries
  let createdBookings = [];
  let session = null;
  let useTransaction = false;

  try {
    const topologyType = mongoose.connection?.client?.topology?.description?.type;
    const isReplicaOrMongos = topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded' || topologyType === 'LoadBalanced';
    if (isReplicaOrMongos) {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    }
  } catch {
    session = null;
    useTransaction = false;
  }

  try {
    const docsToCreate = preparedItems.map((p, i) => {
      const bDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const uniqueSuffix = `${Date.now().toString().slice(-4)}${i + 1}`;
      return {
        bookingId: `CS-${bDateStr}-${uniqueSuffix}`,
        user: req.user._id,
        theater: p.theater._id,
        theaterName: p.theater.name,
        location: p.locationDoc ? p.locationDoc._id : undefined,
        locationName: p.locationDoc ? p.locationDoc.name : '',
        room: p.room._id,
        roomName: p.room.name,
        city: p.theater.city?._id,
        cityName: p.theater.city?.name || '',
        date: p.normalizedBookingDate,
        timeSlot: p.timeSlot,
        timeSlotId: p.timeSlotId,
        startTime: p.startTime,
        endTime: p.endTime,
        duration: p.duration,
        eventType: p.eventTypeDoc._id,
        eventTypeName: p.eventTypeDoc.name,
        cake: p.processedCake,
        addOns: p.processedAddOns,
        pricing: p.pricing,
        customerDetails: {
          ...customerDetails,
          members: p.members,
          kids: p.kids,
        },
        payment: {
          status: 'pending',
          provider: 'upi_qr',
          method: 'upi',
          amountPaid: 0,
          currency: 'INR',
        },
        status: 'pending_payment',
        expiresAt: holdExpiresAt,
        holdExpiresAt,
        isBulkBooking: true,
        bulkBookingId: bulkId,
        bulkBookingTotal: combinedTotal,
        bulkBookingAdvance: combinedAdvance,
      };
    });

    createdBookings = await Booking.create(docsToCreate, useTransaction && session ? { session } : {});

    const updateOptions = useTransaction && session ? { session } : {};
    const bookingIds = createdBookings.map((b) => b._id);
    await User.findByIdAndUpdate(req.user._id, { $push: { bookings: { $each: bookingIds } } }, updateOptions);

    if (useTransaction && session) {
      await session.commitTransaction();
      session.endSession();
    }
  } catch (error) {
    if (useTransaction && session) {
      await session.abortTransaction();
      session.endSession();
    }
    if (error?.code === 11000) {
      return next(new AppError('One of the selected time slots has just been booked. Please pick another available slot.', 409));
    }
    return next(error);
  }

  // Populate first booking to return primary representation
  const primaryBooking = createdBookings[0];

  res.status(201).json({
    success: true,
    message: `Successfully reserved ${createdBookings.length} room/slot(s) with a 10-minute hold.`,
    data: {
      isBulkBooking: true,
      bulkBookingId: bulkId,
      bookingCount: createdBookings.length,
      primaryBooking,
      bookings: createdBookings,
      combinedPricing: {
        total: combinedTotal,
        advanceAmount: combinedAdvance,
        balanceAmount: Math.max(0, combinedTotal - combinedAdvance),
      },
      holdExpiresAt,
      expiresAt: holdExpiresAt,
    },
  });
});
