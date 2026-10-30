// In-memory notification state (No MongoDB storage)
let unreadBookingCount = 0;
let lastResetTimestamp = Date.now();

const inMemoryNotificationService = {
  increment: (amount = 1) => {
    unreadBookingCount += amount;
    return unreadBookingCount;
  },

  getCount: () => {
    return unreadBookingCount;
  },

  resetCount: () => {
    unreadBookingCount = 0;
    lastResetTimestamp = Date.now();
    return 0;
  },

  getLastReset: () => {
    return lastResetTimestamp;
  },
};

module.exports = inMemoryNotificationService;

