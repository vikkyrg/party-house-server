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

/**
 * Build MongoDB filter for active bookings that occupy a room/theater on a given date.
 * Excludes cancelled, no-show, failed, and expired unpaid reservations.
 */
const getActiveBookingsFilter = (baseFilter = {}) => {
  const now = new Date();
  return {
    ...baseFilter,
    status: { $in: ['pending', 'pending_payment', 'pending_verification', 'confirmed', 'in-progress', 'completed'] },
    $nor: [
      {
        status: { $in: ['pending', 'pending_payment'] },
        'payment.status': { $in: ['pending', 'failed'] },
        expiresAt: { $lt: now },
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

module.exports = {
  parseTimeToMinutes,
  getSlotInterval,
  doesOverlap,
  normalizeBookingDate,
  formatDateToYMD,
  getActiveBookingsFilter,
};
