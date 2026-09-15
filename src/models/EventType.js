const mongoose = require('mongoose');
const { createSlug } = require('../utils/helpers');

const EventTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Event type name is required'],
      unique: true,
      trim: true,
      maxlength: 100,
    },
    slug: { type: String, lowercase: true, unique: true },
    description: { type: String, maxlength: 500 },
    image: {
      url: String,
      publicId: String,
      alt: String,
    },
    basePrice: { type: Number, default: 0, min: 0 },
    duration: { type: Number, default: 2, min: 1 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    metaTitle: String,
    metaDescription: String,
  },
  { timestamps: true }
);

EventTypeSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = createSlug(this.name);
  }
  next();
});

module.exports = mongoose.model('EventType', EventTypeSchema);
