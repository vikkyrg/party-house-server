const mongoose = require('mongoose');

const GallerySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
    },
    image: {
      url: { type: String, required: true },
      publicId: String,
      alt: String,
    },
    category: {
      type: String,
      enum: ['Home', 'Theater', 'Celebration', 'Other'],
      default: 'Home',
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Gallery', GallerySchema);
