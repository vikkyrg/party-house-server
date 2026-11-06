const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MAX_LOGIN_ATTEMPTS } = require('../utils/constants');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      unique: true,
      match: [/^[6-9]\d{9}$/, 'Please provide valid Indian phone number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
      validate: {
        validator(v) {
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(v);
        },
        message: 'Password must contain uppercase, lowercase, number, and special character',
      },
    },
    role: {
      type: String,
      enum: ['customer', 'admin', 'super-admin'],
      default: 'customer',
      select: false,
    },
    isVerified: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    profileImage: {
      url: String,
      publicId: String,
    },
    lastLogin: Date,
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    bookings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

UserSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.failedLoginAttempts = 1;
    this.lockUntil = undefined;
  } else {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      this.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
  }
  await this.save({ validateBeforeSave: false });
};

module.exports = mongoose.model('User', UserSchema);
