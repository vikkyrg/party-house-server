const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: false,
      unique: true,
      sparse: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    customerName: {
      type: String,
      trim: true,
    },
    theater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Theater',
      required: false,
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Minimum rating is 1'],
      max: [5, 'Maximum rating is 5'],
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      minlength: [10, 'Review must be at least 10 characters'],
      maxlength: [1500, 'Review cannot exceed 1500 characters'],
    },
    mediaType: {
      type: String,
      enum: ['none', 'image', 'video', 'link'],
      default: 'none',
    },
    mediaUrl: {
      type: String, // Holds base64 or external link
    },
    images: [
      {
        url: String,
        publicId: String,
        alt: String,
      },
    ],
    isPublished: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    helpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    helpfulCount: { type: Number, default: 0 },
    response: {
      text: String,
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      respondedAt: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', ReviewSchema);
