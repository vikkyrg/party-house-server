/**
 * Date and Time utilities for slot overlap, normalization and time conversions
 */

/**
 * Parse time string like "10:30 AM", "01:00 PM", "6:00 pm" to minutes from start of day (0-1439).
 * Returns -1 if invalid.
 */
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return -1;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let [_, hours, minutes, modifier] = match;
  hours = parseInt(hours, 10);
  minutes = parseInt(minutes, 10);
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return -1;
  if (hours === 12) hours = 0;
  if (modifier.toUpperCase() === 'PM') hours += 12;
  return hours * 60 + minutes;
};

/**
 * Extract [startMinutes, endMinutes] interval from a slot string.
 * Handles "10:30 AM - 12:30 PM", "10:30 AM – 12:30 PM", etc.
 */
const getSlotInterval = (slotStr) => {
  if (!slotStr || typeof slotStr !== 'string') return null;
  const separator = slotStr.includes('–') ? '–' : '-';
  const parts = slotStr.split(separator).map((s) => s.trim());
  if (parts.length >= 2) {
    const start = parseTimeToMinutes(parts[0]);
    let end = parseTimeToMinutes(parts[1]);
    if (start === -1 || end === -1) return null;
    // Handle overnight slot if end < start
    if (end <= start) end += 24 * 60;
    return { start, end };
  }
  return null;
};

/**
 * Returns true if two time slot intervals overlap.
 * Intervals are [start1, end1) and [start2, end2).
 * Adjacent intervals (e.g. 10:30-12:30 and 12:30-2:30) do NOT overlap.
 */
const doesOverlap = (slot1Str, slot2Str) => {
  const s1 = getSlotInterval(slot1Str);
  const s2 = getSlotInterval(slot2Str);
  if (!s1 || !s2) return false;
  return s1.start < s2.end && s1.end > s2.start;
};

/**
 * Normalize any date input (YYYY-MM-DD string, Date object, ISO string)
 * to a standardized UTC midnight Date object: YYYY-MM-DDT00:00:00.000Z.
 * This guarantees consistent querying and indexing across all endpoints.
 */
const normalizeBookingDate = (dateInput) => {
  if (!dateInput) return null;
  let dateStr = '';
  if (typeof dateInput === 'string') {
    dateStr = dateInput.trim().slice(0, 10);
  } else if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    dateStr = dateInput.toISOString().slice(0, 10);
  } else {
    try {
      const d = new Date(dateInput);
      if (!Number.isNaN(d.getTime())) {
        dateStr = d.toISOString().slice(0, 10);
      }
    } catch {
      return null;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return new Date(`${dateStr}T00:00:00.000Z`);
};

const BOOKING_HOLD_DURATION_MINUTES = 10;
const BOOKING_HOLD_DURATION_MS = BOOKING_HOLD_DURATION_MINUTES * 60 * 1000;

const getBookingHoldExpiry = (booking) => {
  const rawExpiry = booking?.holdExpiresAt || booking?.expiresAt;
  const expiry = rawExpiry ? new Date(rawExpiry).getTime() : Number.NaN;
  const createdAt = booking?.createdAt ? new Date(booking.createdAt).getTime() : Number.NaN;
  const createdExpiry = Number.isFinite(createdAt) ? createdAt + BOOKING_HOLD_DURATION_MS : Number.NaN;

  if (Number.isFinite(expiry) && Number.isFinite(createdExpiry)) {
    return new Date(Math.min(expiry, createdExpiry));
  }
  if (Number.isFinite(expiry)) return new Date(expiry);
  if (Number.isFinite(createdExpiry)) return new Date(createdExpiry);
  return null;
};

/**
 * Build a MongoDB filter for bookings that still occupy a room on a given date.
 * Unconfirmed bookings, including submitted payments, stop occupying the slot after 10 minutes.
 */
const getActiveBookingsFilter = (baseFilter = {}) => {
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - BOOKING_HOLD_DURATION_MS);
  const pendingHoldStatuses = ['pending', 'pending_payment', 'pending_verification'];
  const unpaidPaymentStatuses = ['pending', 'failed', 'submitted', 'pending_verification'];

  return {
    ...baseFilter,
    status: { $in: ['pending', 'pending_payment', 'pending_verification', 'confirmed', 'in-progress', 'completed'] },
    $nor: [
      {
        status: { $in: pendingHoldStatuses },
        'payment.status': { $in: unpaidPaymentStatuses },
        holdExpiresAt: { $exists: true, $ne: null, $lte: now },
      },
      {
        status: { $in: pendingHoldStatuses },
        'payment.status': { $in: unpaidPaymentStatuses },
        expiresAt: { $exists: true, $ne: null, $lte: now },
      },
      {
        status: { $in: pendingHoldStatuses },
        'payment.status': { $in: unpaidPaymentStatuses },
        createdAt: { $lte: tenMinutesAgo },
      },
    ],
  };
};

const formatDateToYMD = (dateInput) => {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') return dateInput.trim().slice(0, 10);
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    return dateInput.toISOString().slice(0, 10);
  }
  try {
    const d = new Date(dateInput);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
  return '';
};

/**
 * Get current date string (YYYY-MM-DD) in Asia/Kolkata timezone
 */
const getKolkataDateString = (dateObj = new Date()) => {
  return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

/**
 * Get current time in minutes from midnight (0-1439) in Asia/Kolkata timezone
 */
const getKolkataCurrentMinutes = (dateObj = new Date()) => {
  const timeStr = dateObj.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (h % 24) * 60 + m;
};

/**
 * Check if a slot start time has already passed for a given date in Asia/Kolkata timezone.
 * Returns true if date is in the past, or if date is today and slot start time <= current time.
 */
const isSlotInPast = (bookingDateStr, slotStartTimeStr, now = new Date()) => {
  if (!bookingDateStr || !slotStartTimeStr) return false;
  const targetDate = formatDateToYMD(bookingDateStr);
  const currentDate = getKolkataDateString(now);

  if (targetDate < currentDate) {
    return true; // Past date
  }

  if (targetDate === currentDate) {
    const slotStartMin = parseTimeToMinutes(slotStartTimeStr);
    if (slotStartMin === -1) return false;
    const currentMin = getKolkataCurrentMinutes(now);
    return slotStartMin <= currentMin; // Slot has already started or passed
  }

  return false; // Future date
};

module.exports = {
  BOOKING_HOLD_DURATION_MINUTES,
  BOOKING_HOLD_DURATION_MS,
  parseTimeToMinutes,
  getSlotInterval,
  doesOverlap,
  normalizeBookingDate,
  formatDateToYMD,
  getBookingHoldExpiry,
  getActiveBookingsFilter,
  getKolkataDateString,
  getKolkataCurrentMinutes,
  isSlotInPast,
};
