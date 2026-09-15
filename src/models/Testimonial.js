const mongoose = require('mongoose');

const TestimonialSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    customerImage: {
      url: String,
      publicId: String,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: [true, 'Testimonial is required'],
      trim: true,
      maxlength: 500,
    },
    eventType: {
      type: String,
      enum: ['Birthday', 'Anniversary', 'Date Night', 'Party', 'Other'],
    },
    theater: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater' },
    videoUrl: String,
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    source: {
      type: String,
      enum: ['google', 'instagram', 'website', 'manual'],
      default: 'manual',
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Testimonial', TestimonialSchema);
