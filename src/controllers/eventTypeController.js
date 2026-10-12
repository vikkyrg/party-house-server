const mongoose = require('mongoose');
const EventType = require('../models/EventType');
const Theater = require('../models/Theater');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');
const { createAuditLog } = require('../services/auditService');

exports.getEventTypes = catchAsync(async (req, res) => {
  const filter = req.query.includeInactive ? {} : { isActive: true };
  const eventTypes = await EventType.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, count: eventTypes.length, data: eventTypes });
});

exports.getEventType = catchAsync(async (req, res, next) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
  const query = isObjectId ? { _id: req.params.id } : { slug: req.params.id };
  const eventType = await EventType.findOne(query);
  if (!eventType) return next(new AppError('Event type not found', 404));
  res.json({ success: true, data: eventType });
});

exports.createEventType = catchAsync(async (req, res) => {
  const eventTypeData = { ...req.body };

  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'event-types');
    eventTypeData.image = { url: uploaded.url, publicId: uploaded.publicId, alt: eventTypeData.name };
  }

  const eventType = await EventType.create(eventTypeData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'EventType',
    modelId: eventType._id,
    changes: { after: eventType.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: eventType });
});

exports.updateEventType = catchAsync(async (req, res, next) => {
  const existing = await EventType.findById(req.params.id);
  if (!existing) return next(new AppError('Event type not found', 404));

  const before = existing.toObject();

  if (req.file) {
    if (existing.image?.publicId) await deleteFromCloudinary(existing.image.publicId);
    const uploaded = await uploadToCloudinary(req.file, 'event-types');
    req.body.image = { url: uploaded.url, publicId: uploaded.publicId, alt: req.body.name || existing.name };
  }

  const eventType = await EventType.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'EventType',
    modelId: eventType._id,
    changes: { before, after: eventType.toObject() },
    req,
  });

  res.json({ success: true, data: eventType });
});

exports.deleteEventType = catchAsync(async (req, res, next) => {
  const eventType = await EventType.findById(req.params.id);
  if (!eventType) return next(new AppError('Event type not found', 404));

  // Remove eventType reference from theaters
  await Theater.updateMany({ eventTypes: eventType._id }, { $pull: { eventTypes: eventType._id } });

  if (eventType.image?.publicId) {
    try {
      await deleteFromCloudinary(eventType.image.publicId);
    } catch (e) {
      // ignore cloudinary errors on delete
    }
  }
  await eventType.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'EventType',
    modelId: eventType._id,
    changes: { before: eventType.toObject() },
    req,
  });

  res.json({ success: true, message: 'Event type deleted successfully' });
});
