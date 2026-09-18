const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    shortDescription: {
      type: String,
    },
    content: {
      type: String, // Kept optional for backward compatibility
    },
    sections: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
        image: { type: String },
      }
    ],
    author: {
      type: String,
      default: 'Admin',
    },
    image: {
      type: String, // raw base64 data URL
      required: true,
    },
    isActive: { type: Boolean, default: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Story', StorySchema);
