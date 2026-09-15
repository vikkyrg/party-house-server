const mongoose = require('mongoose');

const FAQSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
      maxlength: 200,
    },
    answer: {
      type: String,
      required: [true, 'Answer is required'],
      maxlength: 1000,
    },
    category: {
      type: String,
      enum: ['Booking', 'Payment', 'Venue', 'Policies', 'General'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FAQ', FAQSchema);
