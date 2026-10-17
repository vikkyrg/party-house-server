const Booking = require('../models/Booking');
const logger = require('../utils/logger');
const { BOOKING_HOLD_DURATION_MS } = require('../utils/dateUtils');

/**
 * Release pending bookings that were abandoned and passed their 10-minute hold expiration window,
 * provided payment has not been initiated/submitted or confirmed.
 * Handles holdExpiresAt, expiresAt, and legacy bookings without expiry timestamps (older than 10 minutes).
 */
const cleanupExpiredBookings = async () => {
  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - (BOOKING_HOLD_DURATION_MS || 10 * 60 * 1000));

    // Match unpaid pending bookings that have expired
    const result = await Booking.updateMany(
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        $or: [
          { holdExpiresAt: { $exists: true, $ne: null, $lte: now } },
          { expiresAt: { $exists: true, $ne: null, $lte: now } },
          {
            $and: [
              { $or: [{ holdExpiresAt: { $exists: false } }, { holdExpiresAt: null }] },
              { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }] },
              { createdAt: { $lte: tenMinutesAgo } },
            ],
          },
        ],
      },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: 'Booking reservation expired due to uncompleted advance payment within 10-minute hold window.',
          cancelledAt: now,
        },
      }
    );

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
