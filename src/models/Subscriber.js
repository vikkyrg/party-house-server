const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    status: {
      type: String,
      enum: ['subscribed', 'unsubscribed'],
      default: 'subscribed',
      index: true,
    },
    source: {
      type: String,
      default: 'website_footer',
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    consentGiven: {
      type: Boolean,
      default: true,
    },
    subscribedAt: {
      type: Date,
      default: Date.now,
    },
    unsubscribedAt: {
      type: Date,
    },
    unsubscribeToken: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

SubscriberSchema.pre('save', function (next) {
  if (!this.unsubscribeToken) {
    const crypto = require('crypto');
    this.unsubscribeToken = crypto.randomBytes(24).toString('hex');
  }
  next();
});

module.exports = mongoose.model('Subscriber', SubscriberSchema);
