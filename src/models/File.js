const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    data: {
      type: Buffer,
      required: true,
    },
    contentType: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    folder: {
      type: String,
      default: 'general',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster lookups if needed
fileSchema.index({ createdAt: -1 });

module.exports = mongoose.model('File', fileSchema);
