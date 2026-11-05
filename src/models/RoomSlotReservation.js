const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startMinute: { type: Number, required: true },
    endMinute: { type: Number, required: true },
    timeSlot: { type: String, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
    expiresAt: { type: Date },
  },
  { _id: false }
);

const roomSlotReservationSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  date: { type: Date, required: true },
  reservations: { type: [reservationSchema], default: [] },
});

roomSlotReservationSchema.index({ room: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('RoomSlotReservation', roomSlotReservationSchema);
