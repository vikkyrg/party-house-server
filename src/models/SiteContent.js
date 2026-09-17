const mongoose = require('mongoose');

const SiteContentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      unique: true,
      enum: ['home', 'about', 'contact', 'refundPolicy', 'global'],
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteContent', SiteContentSchema);
