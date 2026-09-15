const mongoose = require('mongoose');
const { createSlug } = require('../utils/helpers');

const CitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'City name is required'],
      unique: true,
      trim: true,
    },
    slug: { type: String, lowercase: true },
    code: { type: String, unique: true },
    image: {
      url: String,
      publicId: String,
    },
    isActive: { type: Boolean, default: true },
    totalBranches: { type: Number, default: 0 },
    metaTitle: String,
    metaDescription: String,
  },
  { timestamps: true }
);

CitySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = createSlug(this.name);
  }
  next();
});

module.exports = mongoose.model('City', CitySchema);
