const mongoose = require('mongoose');
const Room = require('../models/Room');
const Theater = require('../models/Theater');
const Booking = require('../models/Booking');
const File = require('../models/File');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { deleteFromCloudinary } = require('../services/fileService');
const {
  uploadToGridFS,
  getGridFSFileById,
  deleteFromGridFS,
  streamGridFSFile,
} = require('../services/gridfsService');

const parseJsonField = (value, fallback = []) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const normalizeRoomData = (data) => {
  const normalized = { ...data };
  if (normalized.maximumMembers === undefined && normalized.capacity !== undefined) normalized.maximumMembers = normalized.capacity;
  if (normalized.price1Hour !== undefined) normalized.price1Hour = Number(normalized.price1Hour);
  if (normalized.price2Hours !== undefined) normalized.price2Hours = Number(normalized.price2Hours);
  if (normalized.price3Hours !== undefined) normalized.price3Hours = Number(normalized.price3Hours);
  // Handle optional couple: empty string means "not provided"
  if (normalized.couple === '' || normalized.couple === null || normalized.couple === 'null') {
    delete normalized.couple;
  }
  delete normalized.capacity;
  delete normalized.basePrice;
  delete normalized.additionalGuestPrice;
  delete normalized.extraGuestPrice;
  return normalized;
};

const streamBufferWithRange = (buffer, contentType, rangeHeader, res) => {
  const fileSize = buffer.length;
  res.set('Accept-Ranges', 'bytes');
  res.set('Cache-Control', 'public, max-age=86400');
  res.set('Content-Type', contentType || 'application/octet-stream');

  if (!rangeHeader) {
    res.status(200);
    res.set('Content-Length', fileSize);
    return res.send(buffer);
  }

  const matches = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!matches) {
    return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
  }

  let start = matches[1] ? parseInt(matches[1], 10) : 0;
  let end = matches[2] ? parseInt(matches[2], 10) : fileSize - 1;

  if (isNaN(start) || start >= fileSize || start < 0) {
    return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
  }
  if (isNaN(end) || end >= fileSize) end = fileSize - 1;
  if (start > end) {
    return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
  }

  const chunkSize = end - start + 1;
  res.status(206);
  res.set({
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Content-Length': chunkSize,
  });

  return res.send(buffer.subarray(start, end + 1));
};

const applyUploadedMedia = async (req, room) => {
  if (!req.files || req.files.length === 0) return;

  const currentMedia = room.media || [];
  let nextOrder = currentMedia.length > 0 
    ? Math.max(...currentMedia.map((m) => m.order ?? 0)) + 1 
    : 0;

  for (const file of req.files) {
    const isVideo = file.mimetype.startsWith('video/');
    const mediaType = isVideo ? 'video' : 'image';

    const uploaded = await uploadToGridFS(file, {
      roomId: room._id,
      mediaType,
      originalName: file.originalname,
    });

    const mediaId = uploaded.fileId.toString();
    const mediaItem = {
      mediaId,
      fileId: uploaded.fileId,
      mediaType,
      contentType: uploaded.contentType,
      originalName: file.originalname || uploaded.filename,
      url: `/api/v1/rooms/${room._id}/media/${mediaId}`,
      order: nextOrder++,
      duration: isVideo ? 0 : 4,
      size: uploaded.size,
    };

    currentMedia.push(mediaItem);
  }

  currentMedia.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  room.media = currentMedia;
  room.markModified('media');
};

exports.getRooms = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.theaterId).select('_id name location isActive');
  if (!theater) return next(new AppError('Theater not found', 404));
  const filter = { theater: theater._id };
  if (!req.query.includeInactive) filter.isActive = true;
  const rooms = await Room.find(filter).sort({ displayOrder: 1, createdAt: 1, name: 1 });
  res.json({ success: true, count: rooms.length, data: rooms });
});

exports.getAllRooms = catchAsync(async (req, res, next) => {
  const filter = {};
  if (!req.query.includeInactive) filter.isActive = true;
  const rooms = await Room.find(filter).populate('theater', 'name').sort({ displayOrder: 1, createdAt: 1, name: 1 });
  res.json({ success: true, count: rooms.length, data: rooms });
});

exports.getRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id).populate({
    path: 'theater',
    select: 'name location address googleMapsLink city isActive',
    populate: { path: 'location', select: 'name displayName address area cityName stateName countryName pincode googleMapLink isActive' },
  });
  if (!room) return next(new AppError('Room not found', 404));
  if (!room.isActive && req.query.includeInactive !== 'true') return next(new AppError('Room not found', 404));
  res.json({ success: true, data: room });
});

const {
  doesOverlap,
  normalizeBookingDate,
  getActiveBookingsFilter,
} = require('../utils/dateUtils');

exports.getAvailability = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.roomId).populate('theater', 'name location isActive');
  if (!room || !room.isActive || !room.theater?.isActive) return next(new AppError('Room not found or inactive', 404));

  const { date } = req.query;
  const bookingDate = normalizeBookingDate(date);
  if (!bookingDate) return next(new AppError('A valid date is required (YYYY-MM-DD)', 400));

  const filter = getActiveBookingsFilter({
    room: room._id,
    date: bookingDate,
  });

  const booked = await Booking.find(filter).select('timeSlot status payment duration expiresAt');

  const slots = (room.slots || [])
    .filter((slot) => slot.isActive !== false)
    .map((slot) => {
      const time = `${slot.startTime} - ${slot.endTime}`;
      const conflictingBooking = booked.find((b) => doesOverlap(b.timeSlot, time));

      return {
        _id: slot._id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        time,
        available: !conflictingBooking,
        isTemporarilyHeld: conflictingBooking?.status === 'pending',
        slotState: conflictingBooking ? (conflictingBooking.status === 'pending' ? 'held' : 'booked') : 'available',
      };
    });

  const availableSlots = slots.filter((slot) => slot.available).map((slot) => slot.time);
  const bookedSlots = slots.filter((slot) => !slot.available).map((slot) => slot.time);

  res.json({
    success: true,
    data: {
      theater: room.theater._id,
      room: room._id,
      date: bookingDate,
      slots,
      availableSlots,
      bookedSlots,
    },
  });
});

exports.createRoom = catchAsync(async (req, res, next) => {
  let theaterId = req.params.theaterId;
  if (!theaterId) {
    const defaultTheater = await Theater.findOne();
    if (!defaultTheater) return next(new AppError('No theaters exist to assign this room to', 404));
    theaterId = defaultTheater._id;
  }
  const theater = await Theater.findById(theaterId);
  if (!theater) return next(new AppError('Theater not found', 404));
  
  const roomData = normalizeRoomData({ ...req.body, theater: theater._id });
  roomData.features = parseJsonField(roomData.features);
  roomData.amenities = parseJsonField(roomData.amenities);
  roomData.slots = parseJsonField(roomData.slots);

  // Assign next displayOrder by default if not explicitly provided
  if (roomData.displayOrder === undefined) {
    const highestOrderRoom = await Room.findOne().sort({ displayOrder: -1 }).select('displayOrder');
    roomData.displayOrder = highestOrderRoom && typeof highestOrderRoom.displayOrder === 'number' 
      ? highestOrderRoom.displayOrder + 1 
      : 0;
  }

  const room = await Room.create(roomData);

  // Upload any initial media files attached
  if (req.files && req.files.length > 0) {
    await applyUploadedMedia(req, room);
    await room.save();
  }

  res.status(201).json({ success: true, data: room });
});

exports.updateRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  const roomData = normalizeRoomData({ ...req.body });
  ['features', 'amenities', 'slots'].forEach((field) => { roomData[field] = parseJsonField(roomData[field], room[field]); });
  
  // Validate couple vs maximumMembers
  if (roomData.couple !== undefined) {
    const couple = Number(roomData.couple);
    const maximumMembers = Number(roomData.maximumMembers ?? room.maximumMembers);
    if (maximumMembers < couple) return next(new AppError('Maximum Members must be greater than or equal to Couple.', 400));
    room.couple = couple;
  } else if (Object.prototype.hasOwnProperty.call(req.body, 'couple') && (req.body.couple === '' || req.body.couple === 'null' || req.body.couple === null)) {
    room.couple = undefined;
    room.markModified('couple');
  }

  // Handle media deletions if specified
  if (req.body.removeMediaIds) {
    const idsToRemove = parseJsonField(req.body.removeMediaIds);
    if (Array.isArray(idsToRemove) && idsToRemove.length > 0) {
      for (const id of idsToRemove) {
        const item = (room.media || []).find((m) => m.mediaId === id || m._id?.toString() === id || m.fileId?.toString() === id);
        if (item?.fileId) {
          await deleteFromGridFS(item.fileId).catch(() => {});
        }
        await deleteFromCloudinary(id).catch(() => {});
      }
      room.media = (room.media || []).filter(
        (m) => !idsToRemove.includes(m.mediaId) && !idsToRemove.includes(m._id?.toString()) && !idsToRemove.includes(m.fileId?.toString())
      );
      room.markModified('media');
    }
  }

  // Legacy removeGalleryImages support
  if (req.body.removeGalleryImages) {
    const idsToRemove = parseJsonField(req.body.removeGalleryImages);
    if (Array.isArray(idsToRemove) && idsToRemove.length > 0) {
      for (const id of idsToRemove) {
        const item = (room.media || []).find((m) => m.mediaId === id || m._id?.toString() === id || m.fileId?.toString() === id);
        if (item?.fileId) await deleteFromGridFS(item.fileId).catch(() => {});
        await deleteFromCloudinary(id).catch(() => {});
      }
      room.media = (room.media || []).filter(
        (m) => !idsToRemove.includes(m.mediaId) && !idsToRemove.includes(m._id?.toString()) && !idsToRemove.includes(m.fileId?.toString())
      );
      room.galleryImages = (room.galleryImages || []).filter(
        (img) => !idsToRemove.includes(img.publicId) && !idsToRemove.includes(img.url)
      );
      room.markModified('media');
      room.markModified('galleryImages');
    }
  }

  // Handle media reordering if provided
  if (req.body.mediaOrder) {
    const ordered = parseJsonField(req.body.mediaOrder);
    if (Array.isArray(ordered)) {
      const mediaMap = new Map((room.media || []).map((m) => [m.mediaId || m._id?.toString(), m]));
      const newMedia = [];
      ordered.forEach((entry, idx) => {
        const id = typeof entry === 'string' ? entry : (entry.mediaId || entry.id);
        const item = mediaMap.get(id);
        if (item) {
          item.order = typeof entry === 'object' && entry.order !== undefined ? entry.order : idx;
          if (typeof entry === 'object' && entry.duration !== undefined) {
            item.duration = entry.duration;
          }
          newMedia.push(item);
          mediaMap.delete(id);
        }
      });
      for (const remaining of mediaMap.values()) {
        remaining.order = newMedia.length;
        newMedia.push(remaining);
      }
      newMedia.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      room.media = newMedia;
      room.markModified('media');
    }
  }

  // Upload any new media files (images and/or videos) to MongoDB GridFS
  await applyUploadedMedia(req, room);

  // Set remaining fields
  delete roomData.media;
  delete roomData.galleryImages;
  delete roomData.image;
  room.set(roomData);

  await room.save();
  res.json({ success: true, data: room });
});

exports.deleteRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  const activeBooking = await Booking.exists({ room: room._id, status: { $in: ['pending', 'confirmed', 'in-progress'] } });
  if (activeBooking) return next(new AppError('Cannot delete a room with active bookings. Deactivate it instead.', 400));
  
  // Clean up all GridFS files belonging to this room
  for (const item of room.media || []) {
    if (item.fileId) await deleteFromGridFS(item.fileId).catch(() => {});
    if (item.mediaId) await deleteFromCloudinary(item.mediaId).catch(() => {});
  }
  for (const image of [room.image, ...(room.galleryImages || [])]) {
    if (image?.publicId) await deleteFromCloudinary(image.publicId).catch(() => {});
  }

  await room.deleteOne();
  res.json({ success: true, message: 'Room deleted successfully' });
});

exports.createSlot = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  const duplicate = room.slots.some((slot) => slot.startTime === req.body.startTime && slot.endTime === req.body.endTime);
  if (duplicate) return next(new AppError('This time slot already exists for the room', 400));
  room.slots.push({ startTime: req.body.startTime, endTime: req.body.endTime, isActive: req.body.isActive !== false });
  await room.save();
  res.status(201).json({ success: true, data: room.slots[room.slots.length - 1] });
});

exports.updateSlot = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  const slot = room.slots.id(req.params.slotId);
  if (!slot) return next(new AppError('Time slot not found', 404));
  if (req.body.startTime !== undefined) slot.startTime = req.body.startTime;
  if (req.body.endTime !== undefined) slot.endTime = req.body.endTime;
  if (req.body.isActive !== undefined) slot.isActive = req.body.isActive;
  await room.save();
  res.json({ success: true, data: slot });
});

exports.deleteSlot = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  const slot = room.slots.id(req.params.slotId);
  if (!slot) return next(new AppError('Time slot not found', 404));
  slot.deleteOne();
  await room.save();
  res.json({ success: true, message: 'Time slot deleted successfully' });
});

exports.reorderRooms = catchAsync(async (req, res, next) => {
  const { roomIds } = req.body;
  if (!Array.isArray(roomIds) || roomIds.length === 0) {
    return next(new AppError('roomIds array is required', 400));
  }

  const bulkOps = roomIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { displayOrder: index } },
    },
  }));

  await Room.bulkWrite(bulkOps);

  const rooms = await Room.find({}).populate('theater', 'name').sort({ displayOrder: 1, createdAt: 1, name: 1 });
  res.json({ success: true, message: 'Rooms reordered successfully', data: rooms });
});

// MEDIA MANAGEMENT ENDPOINTS

// GET /api/v1/rooms/:roomId/media
exports.getRoomMediaList = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.roomId || req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  const sorted = [...(room.media || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  res.json({ success: true, count: sorted.length, data: sorted });
});

// GET /api/v1/rooms/:roomId/media/:mediaId (Supports HTTP Range video streaming & image serving)
exports.streamRoomMedia = catchAsync(async (req, res, next) => {
  const { roomId, mediaId } = req.params;
  const range = req.headers.range;

  let mediaItem = null;
  if (roomId && mongoose.Types.ObjectId.isValid(roomId)) {
    const room = await Room.findById(roomId);
    if (room && room.media) {
      mediaItem = room.media.find(
        (m) => m.mediaId === mediaId || m._id?.toString() === mediaId || m.fileId?.toString() === mediaId
      );
    }
  }

  // If not found yet, lookup across all rooms
  if (!mediaItem) {
    const roomWithMedia = await Room.findOne({
      $or: [
        { 'media.mediaId': mediaId },
        { 'media._id': mongoose.Types.ObjectId.isValid(mediaId) ? mediaId : null },
        { 'media.fileId': mongoose.Types.ObjectId.isValid(mediaId) ? mediaId : null },
      ],
    });
    if (roomWithMedia) {
      mediaItem = roomWithMedia.media.find(
        (m) => m.mediaId === mediaId || m._id?.toString() === mediaId || m.fileId?.toString() === mediaId
      );
    }
  }

  // 1. Stream from GridFS
  const targetFileId = mediaItem?.fileId || (mongoose.Types.ObjectId.isValid(mediaId) ? mediaId : null);
  if (targetFileId) {
    const gridFile = await getGridFSFileById(targetFileId);
    if (gridFile) {
      return streamGridFSFile(gridFile._id, range, res);
    }
  }

  // 2. Stream from File collection (legacy buffer)
  if (mongoose.Types.ObjectId.isValid(mediaId)) {
    const legacyFile = await File.findById(mediaId);
    if (legacyFile && legacyFile.data) {
      return streamBufferWithRange(legacyFile.data, legacyFile.contentType, range, res);
    }
  }

  // 3. If base64 url
  if (mediaItem?.url && mediaItem.url.startsWith('data:')) {
    const [header, base64Data] = mediaItem.url.split(',');
    const contentType = header.replace('data:', '').replace(';base64', '');
    const buffer = Buffer.from(base64Data, 'base64');
    return streamBufferWithRange(buffer, contentType, range, res);
  }

  return next(new AppError('Media not found', 404));
});

// POST /api/v1/rooms/:roomId/media
exports.uploadRoomMedia = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.roomId || req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  if (!req.files || req.files.length === 0) {
    return next(new AppError('No media files provided for upload', 400));
  }

  await applyUploadedMedia(req, room);
  await room.save();

  res.status(201).json({
    success: true,
    message: 'Media uploaded successfully',
    data: room.media,
  });
});

// PUT /api/v1/rooms/:roomId/media/reorder
exports.reorderRoomMedia = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.roomId || req.params.id);
  if (!room) return next(new AppError('Room not found', 404));

  const { mediaIds, mediaOrder } = req.body;
  const orderedList = mediaOrder || mediaIds;

  if (!Array.isArray(orderedList)) {
    return next(new AppError('mediaIds or mediaOrder array is required', 400));
  }

  const mediaMap = new Map((room.media || []).map((m) => [m.mediaId || m._id?.toString(), m]));
  const reordered = [];

  orderedList.forEach((entry, idx) => {
    const id = typeof entry === 'string' ? entry : (entry.mediaId || entry.id);
    const item = mediaMap.get(id);
    if (item) {
      item.order = typeof entry === 'object' && entry.order !== undefined ? entry.order : idx;
      if (typeof entry === 'object' && entry.duration !== undefined) {
        item.duration = entry.duration;
      }
      reordered.push(item);
      mediaMap.delete(id);
    }
  });

  for (const remaining of mediaMap.values()) {
    remaining.order = reordered.length;
    reordered.push(remaining);
  }

  reordered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  room.media = reordered;
  room.markModified('media');
  await room.save();

  res.json({
    success: true,
    message: 'Media reordered successfully',
    data: room.media,
  });
});

// DELETE /api/v1/rooms/:roomId/media/:mediaId
exports.deleteRoomMedia = catchAsync(async (req, res, next) => {
  const { roomId, mediaId } = req.params;
  const room = await Room.findById(roomId || req.params.id);
  if (!room) return next(new AppError('Room not found', 404));

  const itemIndex = (room.media || []).findIndex(
    (m) => m.mediaId === mediaId || m._id?.toString() === mediaId || m.fileId?.toString() === mediaId
  );

  if (itemIndex === -1) {
    return next(new AppError('Media item not found in room', 404));
  }

  const [removed] = room.media.splice(itemIndex, 1);
  if (removed?.fileId) {
    await deleteFromGridFS(removed.fileId).catch(() => {});
  }
  await deleteFromCloudinary(mediaId).catch(() => {});

  room.media.forEach((m, idx) => { m.order = idx; });
  room.markModified('media');
  await room.save();

  res.json({
    success: true,
    message: 'Media item deleted successfully',
    data: room.media,
  });
});
