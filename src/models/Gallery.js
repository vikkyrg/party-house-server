const mongoose = require('mongoose');

const GallerySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
    },
    image: {
      type: String, // raw base64 data URL
      required: true,
    },
    category: {
      type: String,
      enum: ['Home', 'Theater', 'Celebration', 'Other'],
      default: 'Home',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Gallery', GallerySchema);
