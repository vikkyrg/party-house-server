const mongoose = require('mongoose');
const { createSlug } = require('../utils/helpers');

const AddOnSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Add-on name is required'],
      trim: true,
    },
    slug: { type: String, lowercase: true, unique: true },
    category: {
      type: String,
      enum: ['Extra Decoration', 'Choose Gifts', 'Special Services'],
      required: [true, 'Category is required'],
    },
    description: { type: String, maxlength: 500 },
    price: {
      type: Number,
      min: [0, 'Price cannot be negative'],
    },
    variants: [
      {
        name: { type: String, required: true },
        price: { type: Number, required: true },
      },
    ],
    image: {
      url: String,
      publicId: String,
      alt: String,
    },
    images: [
      {
        url: String,
        publicId: String,
        alt: String,
      },
    ],
    isActive: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AddOnSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = createSlug(this.name);
  }
  next();
});

module.exports = mongoose.model('AddOn', AddOnSchema);
