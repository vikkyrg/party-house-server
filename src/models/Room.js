const mongoose = require('mongoose');
const { createSlug } = require('../utils/helpers');

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    alt: String,
  },
  { _id: false }
);

const slotSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const RoomSchema = new mongoose.Schema(
  {
    theater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Theater',
      required: [true, 'Room must belong to a theater'],
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, lowercase: true },
    description: { type: String, default: '', maxlength: 1000 },
    capacity: { type: Number, required: true, min: 1, max: 100 },
    basePrice: { type: Number, required: true, min: 0 },
    additionalGuestPrice: { type: Number, default: 0, min: 0 },
    image: imageSchema,
    galleryImages: [imageSchema],
    features: [{ type: String, trim: true }],
    amenities: [{ type: String, trim: true }],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    googleMapLink: String,
    slots: [slotSchema],
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

RoomSchema.virtual('theaterId').get(function () {
  return this.theater;
});

RoomSchema.virtual('extraGuestPrice').get(function () {
  return this.additionalGuestPrice;
});

RoomSchema.index({ theater: 1, name: 1 }, { unique: true });
RoomSchema.index({ theater: 1, isActive: 1, sortOrder: 1 });

RoomSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) this.slug = createSlug(this.name);
  next();
});

module.exports = mongoose.model('Room', RoomSchema);
