const mongoose = require('mongoose');

const sizeSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "0.5kg"
  label: { type: String, required: true }, // e.g. "Half Kg"
  price: { type: Number, required: true, min: 0 }
});

const cakeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Cake name is required'],
    trim: true,
  },
  description: {
    type: String,
    maxlength: 500,
  },
  image: {
    url: String, // fallback for any existing pattern
    data: String,       // base64 raw data
    contentType: String // e.g., 'image/jpeg'
  },
  sizes: {
    type: [sizeSchema],
    validate: [
      {
        validator: function(val) {
          return val && val.length > 0;
        },
        message: 'At least one cake size must be provided'
      }
    ]
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Add index for sorting
cakeSchema.index({ sortOrder: 1, createdAt: -1 });

module.exports = mongoose.model('Cake', cakeSchema);
