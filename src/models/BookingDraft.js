const mongoose = require('mongoose');

const bookingDraftSchema = new mongoose.Schema(
  {
    draftId: { type: String, required: true, unique: true },
    bookingSessionId: { type: String, required: true, index: true, select: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
    selection: {
      theaterId: { type: String, required: true },
      roomId: { type: String, required: true },
      date: { type: String, required: true },
      timeSlot: { type: String, required: true },
      timeSlotId: { type: String, default: '' },
      duration: { type: Number, required: true },
    },
    currentStep: { type: Number, min: 1, max: 5, default: 1 },
    customerDetails: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      members: { type: Number, default: 1 },
      kids: { type: Number, default: 0 },
      specialRequest: { type: String, default: '' },
    },
    selectedEventType: { type: String, default: '' },
    selectedCake: { type: mongoose.Schema.Types.Mixed, default: null },
    selectedAddons: { type: mongoose.Schema.Types.Mixed, default: {} },
    termsAccepted: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

bookingDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BookingDraft', bookingDraftSchema);
