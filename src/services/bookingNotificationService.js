const inMemoryNotificationService = require('../services/inMemoryNotificationService');
const logger = require('../utils/logger');

/**
 * Increment in-memory new booking notification count without storing anything in MongoDB
 */
async function createBookingNotification({ booking, type } = {}) {
  try {
    // Only increment when a new booking arrives (or as requested)
    if (!type || type === 'new_booking') {
      const newCount = inMemoryNotificationService.increment(1);
      logger.info(`[Notification] In-memory unread booking count incremented to: ${newCount}`);
      return { success: true, unreadCount: newCount };
    }
    return { success: true, unreadCount: inMemoryNotificationService.getCount() };
  } catch (err) {
    logger.error('Error updating in-memory booking notification:', err);
    return null;
  }
}

module.exports = {
  createBookingNotification,
};
