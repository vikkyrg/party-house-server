const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, unique: true, required: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Booking must belong to a user'],
    },
    theater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Theater',
      required: [true, 'Booking must belong to a theater'],
    },
    theaterName: String,
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    locationName: String,
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
    },
    roomName: String,
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: false,
    },
    cityName: String,
    date: { type: Date, required: [true, 'Booking date is required'] },
    bookingDate: { type: Date },
    duration: { type: Number, required: [true, 'Duration is required'] },
    timeSlot: { type: String, required: [true, 'Time slot is required'] },
    timeSlotId: { type: mongoose.Schema.Types.ObjectId },
    startTime: String,
    endTime: String,
    eventType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventType',
      required: [true, 'Event type is required'],
    },
    eventTypeName: String,
    cake: {
      cakeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cake'
      },
      name: String,
      size: String,
      sizeLabel: String,
      flavor: String,
      price: { type: Number, default: 0 }
    },
    addOns: [
      {
        addOn: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AddOn',
          required: true,
        },
        name: String,
        variantName: String,
        quantity: { type: Number, default: 1, min: 1 },
        price: { type: Number, required: true },
      },
    ],
    pricing: {
      theaterPrice: { type: Number, required: true },
      roomBasePrice: { type: Number, default: 0 },
      extraGuestPrice: Number,
      extraGuestCount: Number,
      extraGuestTotal: Number,
      addOnsTotal: { type: Number, default: 0 },
      cakePrice: { type: Number, default: 0 },
      subtotal: { type: Number, required: true },
      tax: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      discountCode: String,
      total: { type: Number, required: true },
      advanceAmount: { type: Number, default: 750 },
      balanceAmount: { type: Number, required: true },
    },
    customerDetails: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      members: { type: Number, required: true, min: 1 },
      kids: { type: Number, default: 0, min: 0 },
      specialRequests: { type: String, maxlength: 500 },
    },
    payment: {
      status: {
        type: String,
        enum: ['pending', 'processing', 'submitted', 'paid', 'failed', 'rejected', 'refunded', 'partial'],
        default: 'pending',
      },
      method: { type: String, enum: ['upi', 'cash', 'card', 'bank_transfer', 'qr_code'], default: 'upi' },
      provider: { type: String, default: 'upi_qr' },
      amountPaid: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
      upiTransactionId: { type: String, trim: true },
      submittedAt: Date,
      verifiedAt: Date,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      rejectedReason: String,
      initiatedAt: Date,
      paidAt: Date,
      refundId: String,
      refundedAt: Date,
      refundAmount: Number,
      failureReason: String,
    },
    status: {
      type: String,
      enum: ['pending', 'pending_payment', 'pending_verification', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show'],
      default: 'pending_payment',
      index: true,
    },
    expiresAt: { type: Date, index: true },
    holdExpiresAt: { type: Date, index: true },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: String,
    cancelledAt: Date,
    completedAt: Date,
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
    notes: { type: String, maxlength: 1000 },
    // Bulk Booking Group Support
    isBulkBooking: { type: Boolean, default: false, index: true },
    bulkBookingId: { type: String, index: true }, // Shared reference across the bulk group e.g. CS-BULK-20261017-001
    bulkBookingTotal: { type: Number },
    bulkBookingAdvance: { type: Number },
  },
  { timestamps: true }
);

BookingSchema.index({ theater: 1, date: 1 });
BookingSchema.index(
  { room: 1, date: 1, timeSlot: 1 },
  {
    unique: true,
    partialFilterExpression: {
      room: { $exists: true },
      status: { $in: ['pending', 'pending_payment', 'pending_verification', 'confirmed', 'in-progress', 'completed'] },
    },
  }
);
BookingSchema.index({ user: 1, createdAt: -1 });
BookingSchema.index({ status: 1, date: 1 });
BookingSchema.index({ 'payment.status': 1, createdAt: -1 });

BookingSchema.pre('validate', async function (next) {
  if (!this.bookingId) {
    const prefix = process.env.BOOKING_ID_PREFIX || 'CS';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.constructor.countDocuments();
    this.bookingId = `${prefix}-${date}-${String(count + 1).padStart(3, '0')}`;
  }
  if (this.expiresAt && !this.holdExpiresAt) {
    this.holdExpiresAt = this.expiresAt;
  } else if (this.holdExpiresAt && !this.expiresAt) {
    this.expiresAt = this.holdExpiresAt;
  }
  next();
});

module.exports = mongoose.model('Booking', BookingSchema);
