const mongoose = require('mongoose');

const BookingNotificationSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    bookingId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['new_booking', 'cancelled', 'payment_submitted', 'payment_verified', 'status_updated'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    customerName: {
      type: String,
    },
    theaterName: {
      type: String,
    },
    roomName: {
      type: String,
    },
    bookingDate: {
      type: Date,
    },
    timeSlot: {
      type: String,
    },
    advanceAmount: {
      type: Number,
      default: 750,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    readBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Compound index for quick unread queries
BookingNotificationSchema.index({ isRead: 1, createdAt: -1 });

module.exports = mongoose.model('BookingNotification', BookingNotificationSchema);

