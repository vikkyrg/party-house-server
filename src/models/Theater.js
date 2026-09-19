const mongoose = require('mongoose');
const { createSlug } = require('../utils/helpers');

const TheaterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Theater name is required'],
      trim: true,
      maxlength: 100,
    },
    slug: { type: String, lowercase: true, unique: true },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: false,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Theater must belong to a location'],
    },
    address: {
      type: String,
      required: [true, 'Theater address is required'],
      maxlength: 500,
    },
    googleMapsLink: {
      type: String,
      match: [/^https?:\/\/.+/, 'Please provide a valid URL for Google Maps'],
    },
    landmark: String,
    capacity: {
      type: Number,
      required: [true, 'Theater capacity is required'],
      min: [5, 'Minimum capacity is 5'],
      max: [50, 'Maximum capacity is 50'],
    },
    pricePerHour: {
      type: Number,
      required: [true, 'Price per hour is required'],
      min: [0, 'Price cannot be negative'],
    },
    additionalGuestPrice: {
      type: Number,
      default: 0,
      min: [0, 'Price cannot be negative'],
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: String,
        alt: String,
      },
    ],
    theatreVideoUrl: {
      type: String,
      match: [/^https?:\/\/.+/, 'Please provide a valid video URL'],
    },
    branchVideoUrl: {
      type: String,
      match: [/^https?:\/\/.+/, 'Please provide a valid video URL'],
    },
    amenities: [
      {
        type: String,
        enum: [
          'AC',
          'Projector',
          'Sound System',
          'Recliner Seats',
          'Parking',
          'WiFi',
          'Wheelchair Access',
          'Food Court',
        ],
      },
    ],
    eventTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EventType' }],
    slots: [
      {
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
      },
    ],
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    totalBookings: { type: Number, default: 0 },
    metaTitle: String,
    metaDescription: String,
  },
  { timestamps: true }
);

TheaterSchema.index({ city: 1, location: 1 });
TheaterSchema.index({ isActive: 1, isFeatured: 1 });

TheaterSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = createSlug(this.name);
  }
  next();
});

module.exports = mongoose.model('Theater', TheaterSchema);
