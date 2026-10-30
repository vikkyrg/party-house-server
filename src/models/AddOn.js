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
      enum: ['Special Services'],
      required: [true, 'Category is required'],
    },
    description: { type: String, maxlength: 500 },
    price: {
      type: Number,
      min: [0, 'Price cannot be negative'],
    },
    price1Hour: {
      type: Number,
      min: [0, '1-Hour Price cannot be negative'],
    },
    price2Hours: {
      type: Number,
      min: [0, '2-Hours Price cannot be negative'],
    },
    price3Hours: {
      type: Number,
      min: [0, '3-Hours Price cannot be negative'],
    },
    pricing: {
      oneHour: { type: Number, min: 0 },
      twoHours: { type: Number, min: 0 },
      threeHours: { type: Number, min: 0 },
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
    sortOrder: { type: Number, default: 0, index: true },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AddOnSchema.pre('init', function (data) {
  const fallback = Number(data.price) || 0;
  if (data.price1Hour === undefined) {
    data.price1Hour = data.pricing?.oneHour !== undefined ? Number(data.pricing.oneHour) : fallback;
  }
  if (data.price2Hours === undefined) {
    data.price2Hours = data.pricing?.twoHours !== undefined ? Number(data.pricing.twoHours) : fallback;
  }
  if (data.price3Hours === undefined) {
    data.price3Hours = data.pricing?.threeHours !== undefined ? Number(data.pricing.threeHours) : fallback;
  }
  if (!data.pricing) {
    data.pricing = {
      oneHour: data.price1Hour,
      twoHours: data.price2Hours,
      threeHours: data.price3Hours,
    };
  }

  // Ensure both sortOrder and displayOrder are defined and synced
  const order = data.sortOrder !== undefined && data.sortOrder !== null
    ? data.sortOrder
    : (data.displayOrder !== undefined && data.displayOrder !== null ? data.displayOrder : 0);
  data.sortOrder = order;
  data.displayOrder = order;
});

AddOnSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = createSlug(this.name);
  }
  // Keep sortOrder and displayOrder in sync
  if (this.sortOrder === undefined && this.displayOrder !== undefined) {
    this.sortOrder = this.displayOrder;
  } else if (this.displayOrder === undefined && this.sortOrder !== undefined) {
    this.displayOrder = this.sortOrder;
  }
  next();
});

module.exports = mongoose.model('AddOn', AddOnSchema);
