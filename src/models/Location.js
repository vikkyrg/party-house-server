const mongoose = require('mongoose');
const { createSlug } = require('../utils/helpers');

const LocationSchema = new mongoose.Schema(
  {
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: [true, 'Location must belong to a city'],
    },
    name: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true,
    },
    slug: { type: String, lowercase: true },
    pincode: String,
    image: {
      url: String,
      publicId: String,
    },
    theaters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Theater' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

LocationSchema.index({ city: 1, name: 1 });

LocationSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = createSlug(this.name);
  }
  next();
});

module.exports = mongoose.model('Location', LocationSchema);
