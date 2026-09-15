module.exports = {
  ROLES: {
    CUSTOMER: 'customer',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super-admin',
  },
  BOOKING_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    NO_SHOW: 'no-show',
  },
  PAYMENT_STATUS: {
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed',
    REFUNDED: 'refunded',
    PARTIAL: 'partial',
  },
  GST_RATE: 0.18,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCK_TIME_MS: 30 * 60 * 1000,
  OTP_EXPIRY_MS: 5 * 60 * 1000,
};
