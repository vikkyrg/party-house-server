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
      enum: ['Food', 'Decoration', 'Experience', 'Gift', 'Entertainment'],
      required: [true, 'Category is required'],
    },
    description: { type: String, maxlength: 500 },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
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
