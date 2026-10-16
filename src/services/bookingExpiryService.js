const Booking = require('../models/Booking');
const logger = require('../utils/logger');

/**
 * Release pending bookings that were abandoned and passed their expiration window (15 mins),
 * provided payment has not been initiated or confirmed.
 */
const cleanupExpiredBookings = async () => {
  try {
    const now = new Date();
    // Find bookings that are still pending, not paid/processing, and older than expiresAt
    const result = await Booking.updateMany(
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        expiresAt: { $lte: now },
      },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: 'Booking reservation expired due to uncompleted advance payment.',
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
