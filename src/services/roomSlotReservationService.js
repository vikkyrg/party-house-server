const mongoose = require('mongoose');
const RoomSlotReservation = require('../models/RoomSlotReservation');
const Booking = require('../models/Booking');
const { getSlotInterval, getBookingHoldExpiry } = require('../utils/dateUtils');
let indexesReady;

const ensureIndexes = () => {
  if (!indexesReady) indexesReady = RoomSlotReservation.init();
  return indexesReady;
};

const activeReservationFilter = (startMinute, endMinute, now) => ({
  reservations: {
    $not: {
      $elemMatch: {
        startMinute: { $lt: endMinute },
        endMinute: { $gt: startMinute },
        $or: [
          { status: 'confirmed' },
          { status: 'pending', expiresAt: { $gt: now } },
        ],
      },
    },
  },
});

const reserveRoomSlot = async ({
  roomId,
  date,
  bookingId,
  customerId,
  timeSlot,
  expiresAt,
}) => {
  await ensureIndexes();
  const interval = getSlotInterval(timeSlot);
  if (!interval || !mongoose.isValidObjectId(bookingId)) {
    throw new Error('A valid booking and time slot are required to reserve a room.');
  }

  const reservationBookingId = new mongoose.Types.ObjectId(bookingId);
  const reservationCustomerId = customerId ? new mongoose.Types.ObjectId(customerId) : null;
  const now = new Date();
  const filter = {
    room: roomId,
    date,
    ...activeReservationFilter(interval.start, interval.end, now),
  };
  filter.reservations.$not.$elemMatch.booking = { $ne: reservationBookingId };
  const reservation = {
    booking: reservationBookingId,
    startMinute: interval.start,
    endMinute: interval.end,
    timeSlot,
    status: 'pending',
    expiresAt,
  };
  if (reservationCustomerId) reservation.customer = reservationCustomerId;
  const update = [
    {
      $set: {
        reservations: {
          $concatArrays: [
            {
              $filter: {
                input: { $ifNull: ['$reservations', []] },
                as: 'reservation',
                cond: { $ne: ['$$reservation.booking', reservationBookingId] },
              },
            },
            [reservation],
          ],
        },
      },
    },
  ];

  try {
    const reservation = await RoomSlotReservation.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });
    return Boolean(reservation);
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const reservation = await RoomSlotReservation.findOneAndUpdate(filter, update, {
      new: true,
      upsert: false,
    });
    return Boolean(reservation);
  }
};

const getOwnedActiveRoomSlotReservation = async ({
  roomId,
  date,
  bookingId,
  customerId,
  timeSlot,
}) => {
  const interval = getSlotInterval(timeSlot);
  if (!interval || !mongoose.isValidObjectId(bookingId)) return null;
  const reservationDay = await RoomSlotReservation.findOne({ room: roomId, date }).lean();
  const now = new Date();
  return (
    reservationDay?.reservations.find(
      (reservation) =>
        reservation.booking.toString() === bookingId.toString() &&
        (!reservation.customer ||
          (customerId && reservation.customer.toString() === customerId.toString())) &&
        reservation.status === 'pending' &&
        reservation.expiresAt > now &&
        reservation.startMinute === interval.start &&
        reservation.endMinute === interval.end
    ) || null
  );
};

const getActiveRoomSlotReservations = async (roomId, date) => {
  const reservationDay = await RoomSlotReservation.findOne({ room: roomId, date }).lean();
  if (!reservationDay) return [];

  const now = new Date();
  const bookingIds = reservationDay.reservations.map((reservation) => reservation.booking);
  const bookings = await Booking.find({ _id: { $in: bookingIds } })
    .select('status holdExpiresAt expiresAt createdAt')
    .lean();
  const bookingsById = new Map(bookings.map((booking) => [booking._id.toString(), booking]));

  return reservationDay.reservations.reduce((active, reservation) => {
    const booking = bookingsById.get(reservation.booking.toString());
    if (booking) {
      if (['confirmed', 'in-progress', 'completed'].includes(booking.status)) {
        active.push({ ...reservation, status: 'confirmed' });
        return active;
      }
      if (!['pending', 'pending_payment', 'pending_verification'].includes(booking.status)) return active;
      const expiry = getBookingHoldExpiry(booking);
      if (expiry && expiry > now) active.push(reservation);
      return active;
    }

    if (
      reservation.status === 'confirmed' ||
      (reservation.status === 'pending' && reservation.expiresAt && reservation.expiresAt > now)
    ) {
      active.push(reservation);
    }
    return active;
  }, []);
};

const updateRoomSlotReservation = async (booking, status) => {
  if (!booking?.room || !booking?.date || !booking?._id) return;
  const update =
    status === 'confirmed'
      ? { $set: { 'reservations.$.status': 'confirmed' }, $unset: { 'reservations.$.expiresAt': 1 } }
      : { $set: { 'reservations.$.status': 'cancelled' } };

  await RoomSlotReservation.updateOne(
    { room: booking.room, date: booking.date, 'reservations.booking': booking._id },
    update
  );
};

const releaseRoomSlotReservation = (booking) => updateRoomSlotReservation(booking, 'cancelled');
const confirmRoomSlotReservation = (booking) => updateRoomSlotReservation(booking, 'confirmed');

const cleanupExpiredRoomSlotReservations = async (now = new Date()) => {
  const result = await RoomSlotReservation.updateMany(
    {},
    {
      $pull: {
        reservations: {
          status: 'pending',
          expiresAt: { $lte: now },
        },
      },
    }
  );
  return result.modifiedCount;
};

const migrateLegacyBookingIndex = async () => {
  await ensureIndexes();

  let indexes = [];
  try {
    indexes = await mongoose.connection.collection('bookings').indexes();
  } catch (error) {
    if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') throw error;
  }

  const obsoleteIndex = indexes.find(
    (index) =>
      index.unique &&
      index.key?.room === 1 &&
      index.key?.date === 1 &&
      index.key?.timeSlot === 1
  );
  if (obsoleteIndex) {
    await mongoose.connection.collection('bookings').dropIndex(obsoleteIndex.name);
  }
};

module.exports = {
  reserveRoomSlot,
  getOwnedActiveRoomSlotReservation,
  getActiveRoomSlotReservations,
  releaseRoomSlotReservation,
  confirmRoomSlotReservation,
  cleanupExpiredRoomSlotReservations,
  migrateLegacyBookingIndex,
};
