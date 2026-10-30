const BookingNotification = require('../models/BookingNotification');
const logger = require('../utils/logger');

/**
 * Create a booking notification safely without throwing error or breaking calling workflow
 */
async function createBookingNotification({
  booking,
  type,
  title,
  message,
}) {
  try {
    if (!booking) return null;

    const bId = booking.bookingId || String(booking._id);
    const cName = booking.customerDetails?.name || 'Customer';
    const tName = booking.theaterName || booking.theater?.name || 'Rio Party House';
    const rName = booking.roomName || booking.room?.name || 'Private Theater';
    const bDate = booking.date || booking.bookingDate;
    const tSlot = booking.timeSlot || '';
    const adv = booking.pricing?.advanceAmount || 750;

    let defaultTitle = title;
    let defaultMsg = message;

    if (!defaultTitle) {
      if (type === 'new_booking') defaultTitle = `New Booking #${bId}`;
      else if (type === 'cancelled') defaultTitle = `Booking #${bId} Cancelled`;
      else if (type === 'payment_submitted') defaultTitle = `UPI Payment Submitted #${bId}`;
      else if (type === 'payment_verified') defaultTitle = `Payment Confirmed #${bId}`;
      else defaultTitle = `Booking Update #${bId}`;
    }

    if (!defaultMsg) {
      if (type === 'new_booking') {
        defaultMsg = `${cName} booked ${tName} (${rName}) for ${tSlot}.`;
      } else if (type === 'cancelled') {
        defaultMsg = `Booking #${bId} by ${cName} was cancelled.`;
      } else if (type === 'payment_submitted') {
        defaultMsg = `${cName} submitted UPI Ref for ₹${adv}.`;
      } else if (type === 'payment_verified') {
        defaultMsg = `Advance payment ₹${adv} verified for ${cName}.`;
      } else {
        defaultMsg = `Status changed to ${booking.status} for ${cName}.`;
      }
    }

    // Avoid duplicate notifications of the exact same type within 30 seconds for the same booking
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const existing = await BookingNotification.findOne({
      booking: booking._id,
      type,
      createdAt: { $gte: thirtySecondsAgo },
    });

    if (existing) {
      return existing;
    }

    const notification = await BookingNotification.create({
      booking: booking._id,
      bookingId: bId,
      type,
      title: defaultTitle,
      message: defaultMsg,
      customerName: cName,
      theaterName: tName,
      roomName: rName,
      bookingDate: bDate,
      timeSlot: tSlot,
      advanceAmount: adv,
      isRead: false,
    });

    return notification;
  } catch (err) {
    logger.error('Failed to create booking notification:', err);
    return null;
  }
}

module.exports = {
  createBookingNotification,
};

