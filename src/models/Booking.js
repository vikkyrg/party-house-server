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
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
    },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: false,
    },
    date: { type: Date, required: [true, 'Booking date is required'] },
    timeSlot: { type: String, required: [true, 'Time slot is required'] },
    eventType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventType',
      required: [true, 'Event type is required'],
    },
    cake: {
      cakeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cake'
      },
      name: String,
      size: String,
      sizeLabel: String,
      price: { type: Number, default: 0 }
    },
    addOns: [
      {
        addOn: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AddOn',
          required: true,
        },
        variantName: String,
        quantity: { type: Number, default: 1, min: 1 },
        price: { type: Number, required: true },
      },
    ],
    pricing: {
      theaterPrice: { type: Number, required: true },
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
        enum: ['pending', 'paid', 'failed', 'refunded', 'partial'],
        default: 'pending',
      },
      method: { type: String, enum: ['razorpay', 'cash', 'card', 'upi'] },
      razorpayOrderId: String,
      razorpayPaymentId: String,
      razorpaySignature: String,
      paidAt: Date,
      refundId: String,
      refundedAt: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show'],
      default: 'pending',
      index: true,
    },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: String,
    cancelledAt: Date,
    completedAt: Date,
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
    notes: { type: String, maxlength: 1000 },
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
      status: { $in: ['pending', 'confirmed', 'in-progress', 'completed'] },
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
  next();
});

module.exports = mongoose.model('Booking', BookingSchema);
