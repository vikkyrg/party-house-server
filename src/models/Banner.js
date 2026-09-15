const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Banner title is required'],
      trim: true,
      maxlength: 100,
    },
    subtitle: { type: String, maxlength: 200 },
    image: {
      url: { type: String, required: true },
      publicId: String,
      alt: String,
    },
    mobileImage: {
      url: String,
      publicId: String,
      alt: String,
    },
    link: { type: String, maxlength: 500 },
    linkText: { type: String, maxlength: 50 },
    position: {
      type: String,
      enum: ['homepage-hero', 'homepage-mid', 'city-page', 'footer'],
      required: [true, 'Banner position is required'],
      index: true,
    },
    isActive: { type: Boolean, default: true },
    startDate: Date,
    endDate: Date,
    priority: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

BannerSchema.index({ position: 1, isActive: 1, priority: -1 });

module.exports = mongoose.model('Banner', BannerSchema);
