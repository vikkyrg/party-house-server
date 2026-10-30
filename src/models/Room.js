const mongoose = require('mongoose');
const { createSlug } = require('../utils/helpers');

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    alt: String,
  },
  { _id: false }
);

const roomMediaSchema = new mongoose.Schema(
  {
    mediaId: { type: String, required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    contentType: { type: String, required: true },
    originalName: { type: String, default: '' },
    url: { type: String, required: true },
    order: { type: Number, default: 0 },
    duration: { type: Number, default: 4 }, // duration in seconds for carousel (4s for images)
    size: { type: Number, default: 0 },
  },
  { _id: true, timestamps: true }
);

const slotSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const RoomSchema = new mongoose.Schema(
  {
    theater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Theater',
      required: [true, 'Room must belong to a theater'],
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, lowercase: true },
    description: { type: String, default: '', maxlength: 1000 },
    couple: { type: Number, required: false, min: 1, max: 100 },
    maximumMembers: { type: Number, required: true, min: 1, max: 100 },
    price1Hour: { type: Number, required: true, min: 0 },
    price2Hours: { type: Number, required: true, min: 0 },
    price3Hours: { type: Number, required: true, min: 0 },
    image: imageSchema,
    galleryImages: [imageSchema],
    media: [roomMediaSchema],
    features: [{ type: String, trim: true }],
    amenities: [{ type: String, trim: true }],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    location: { type: String, trim: true },
    googleMapLink: String,
    screenSize: { type: String, trim: true, default: '' },
    pictureQuality: { type: String, trim: true, default: '' },
    soundQuality: { type: String, trim: true, default: '' },
    slots: [slotSchema],
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

RoomSchema.virtual('theaterId').get(function () {
  return this.theater;
});

// Populate the new fields from legacy documents without rewriting old records.
RoomSchema.pre('init', function (data) {
  if (data.maximumMembers === undefined && data.capacity !== undefined) data.maximumMembers = data.capacity;
  // couple is optional: do NOT assign a default if it was not saved in the DB
  // We intentionally leave data.couple as-is (undefined if not in DB)
  if (data.price2Hours === undefined) {
    data.price2Hours = data.weekdayPrice ?? data.price ?? data.basePrice ?? 0;
  }
  if (data.price1Hour === undefined) data.price1Hour = 0;
  if (data.price3Hours === undefined) data.price3Hours = 0;

  // Backward compatibility: synthesize media array from image and galleryImages if media is empty
  if (!data.media || data.media.length === 0) {
    const rawImages = [data.image, ...(data.galleryImages || [])].filter(Boolean);
    const seen = new Set();
    const uniqueImages = rawImages.filter((img) => {
      const key = img.url || img.publicId;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueImages.length > 0) {
      data.media = uniqueImages.map((img, idx) => ({
        mediaId: img.publicId || `legacy_${idx}_${data._id || Date.now()}`,
        fileId: null,
        mediaType: 'image',
        contentType: 'image/jpeg',
        originalName: `image-${idx + 1}.jpg`,
        url: img.url,
        order: idx,
        duration: 4,
        size: 0,
      }));
    } else {
      data.media = [];
    }
  } else {
    data.media.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // Screen experience backward-compatible defaults based on room name
  const nameLower = (data.name || '').toLowerCase();
  if (!data.screenSize || !data.pictureQuality || !data.soundQuality) {
    if (nameLower.includes('velvet')) {
      if (!data.screenSize) data.screenSize = '85-inch';
      if (!data.pictureQuality) data.pictureQuality = 'Clear picture with rich colors.';
      if (!data.soundQuality) data.soundQuality = 'Clear sound with deep bass.';
    } else if (nameLower.includes('sigma')) {
      if (!data.screenSize) data.screenSize = '100-inch';
      if (!data.pictureQuality) data.pictureQuality = 'Sharp picture with bright colors.';
      if (!data.soundQuality) data.soundQuality = 'Powerful sound with deep bass.';
    } else if (nameLower.includes('paradise')) {
      if (!data.screenSize) data.screenSize = '120-inch';
      if (!data.pictureQuality) data.pictureQuality = 'Big screen with stunning visuals.';
      if (!data.soundQuality) data.soundQuality = 'Surround sound for a cinematic experience.';
    }
  }
});

RoomSchema.index({ theater: 1, name: 1 }, { unique: true });
RoomSchema.index({ theater: 1, isActive: 1, name: 1 });

RoomSchema.pre('validate', function (next) {
  if ((!this.media || this.media.length === 0) && (this.image || (this.galleryImages && this.galleryImages.length > 0))) {
    const rawImages = [this.image, ...(this.galleryImages || [])].filter(Boolean);
    const seen = new Set();
    const uniqueImages = rawImages.filter((img) => {
      const key = img.url || img.publicId;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueImages.length > 0) {
      this.media = uniqueImages.map((img, idx) => ({
        mediaId: img.publicId || `legacy_${idx}_${this._id || Date.now()}`,
        fileId: null,
        mediaType: 'image',
        contentType: 'image/jpeg',
        originalName: `image-${idx + 1}.jpg`,
        url: img.url,
        order: idx,
        duration: 4,
        size: 0,
      }));
    }
  }
  next();
});

RoomSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) this.slug = createSlug(this.name);

  // Synchronize image & galleryImages for legacy consumers
  if (this.media && this.media.length > 0) {
    const sorted = [...this.media].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const imageMedia = sorted.filter((m) => m.mediaType === 'image');
    if (imageMedia.length > 0) {
      this.image = { url: imageMedia[0].url, publicId: imageMedia[0].mediaId };
      this.galleryImages = imageMedia.map((m) => ({ url: m.url, publicId: m.mediaId }));
    }
  }

  next();
});

module.exports = mongoose.model('Room', RoomSchema);
