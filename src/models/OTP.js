const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    email: { type: String, lowercase: true },
    otp: { type: String, required: true },
    purpose: {
      type: String,
      enum: ['verification', 'password-reset'],
      default: 'verification',
    },
    expiresAt: { type: Date, required: true },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTP', OTPSchema);
