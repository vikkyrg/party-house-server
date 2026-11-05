const Booking = require('../models/Booking');
const logger = require('../utils/logger');
const { BOOKING_HOLD_DURATION_MS } = require('../utils/dateUtils');
const {
  cleanupExpiredRoomSlotReservations,
  releaseRoomSlotReservation,
} = require('./roomSlotReservationService');

/**
 * Release unconfirmed bookings after their 10-minute hold expires, including submitted
 * payments that have not yet been verified.
 */
const cleanupExpiredBookings = async () => {
  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - BOOKING_HOLD_DURATION_MS);

    const expiredFilter = {
        status: { $in: ['pending', 'pending_payment', 'pending_verification'] },
        $or: [
          { holdExpiresAt: { $exists: true, $ne: null, $lte: now } },
          { expiresAt: { $exists: true, $ne: null, $lte: now } },
          { createdAt: { $lte: tenMinutesAgo } },
        ],
      };
    const expiredBookings = await Booking.find(expiredFilter).select('_id room date');
    const result = await Booking.updateMany(
      expiredFilter,
      {
        $set: {
          status: 'cancelled',
          cancellationReason: 'Booking reservation expired due to uncompleted advance payment within 10-minute hold window.',
          cancelledAt: now,
        },
      }
    );

    await Promise.all(expiredBookings.map((booking) => releaseRoomSlotReservation(booking)));
    await cleanupExpiredRoomSlotReservations(now);
    if (result.modifiedCount > 0) {
      logger.info(`Expired booking cleanup: Released ${result.modifiedCount} abandoned slot(s).`);
    }
    return result.modifiedCount;
  } catch (error) {
    logger.error('Error during expired booking cleanup:', error);
    return 0;
  }
};

let cleanupInterval = null;

const startBookingExpiryCron = (intervalMs = 60 * 1000) => {
  if (cleanupInterval) return;
  // Run once immediately on start
  cleanupExpiredBookings();
  cleanupInterval = setInterval(cleanupExpiredBookings, intervalMs);
  logger.info('Booking expiry cleaner scheduled to run every 60 seconds.');
};

const stopBookingExpiryCron = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

module.exports = {
  cleanupExpiredBookings,
  startBookingExpiryCron,
  stopBookingExpiryCron,
};
