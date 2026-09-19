const Room = require('../models/Room');
const Theater = require('../models/Theater');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToRawData, deleteFromCloudinary } = require('../services/fileService');

const parseJsonField = (value, fallback = []) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const normalizeRoomData = (data) => {
  const normalized = { ...data };
  if (normalized.maximumMembers === undefined && normalized.capacity !== undefined) normalized.maximumMembers = normalized.capacity;
  if (normalized.price === undefined && normalized.basePrice !== undefined) normalized.price = normalized.basePrice;
  delete normalized.capacity;
  delete normalized.basePrice;
  delete normalized.additionalGuestPrice;
  delete normalized.extraGuestPrice;
  return normalized;
};

const applyUploadedImages = async (req, roomData, existingRoom = null) => {
  if (!req.files?.length) return;
  const uploaded = [];
  for (const file of req.files) {
    const stored = await uploadToRawData(file);
    uploaded.push({ url: stored.url, publicId: stored.publicId });
  }
  if (existingRoom?.galleryImages?.length) {
    roomData.galleryImages = [...existingRoom.galleryImages.map((image) => image.toObject?.() || image), ...uploaded];
  } else {
    roomData.galleryImages = uploaded;
  }
  if (!roomData.image && uploaded[0]) roomData.image = uploaded[0];
};

exports.getRooms = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.theaterId).select('_id name location isActive');
  if (!theater) return next(new AppError('Theater not found', 404));
  const filter = { theater: theater._id };
  if (!req.query.includeInactive) filter.isActive = true;
  const rooms = await Room.find(filter).sort({ sortOrder: 1, name: 1 });
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

exports.getAvailability = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.roomId).populate('theater', 'name location isActive');
  if (!room || !room.isActive || !room.theater?.isActive) return next(new AppError('Room not found or inactive', 404));
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return next(new AppError('A valid date is required', 400));
  const bookingDate = new Date(`${date}T00:00:00.000Z`);
  const booked = await Booking.find({ room: room._id, date: bookingDate, status: { $nin: ['cancelled', 'no-show', 'failed'] } }).select('timeSlot');
  const bookedSlots = new Set(booked.map((booking) => booking.timeSlot));
  const slots = (room.slots || []).filter((slot) => slot.isActive !== false).map((slot) => {
    const time = `${slot.startTime} - ${slot.endTime}`;
    const available = !bookedSlots.has(time);
    return { id: slot._id, time, startTime: slot.startTime, endTime: slot.endTime, available, status: available ? 'available' : 'booked' };
  });
  res.json({ success: true, data: { room: room.name, roomId: room._id, date, slots, availableSlots: slots.filter((slot) => slot.available), bookedSlots: slots.filter((slot) => !slot.available) } });
});

exports.createRoom = catchAsync(async (req, res, next) => {
  const theater = await Theater.findById(req.params.theaterId);
  if (!theater) return next(new AppError('Theater not found', 404));
  const roomData = normalizeRoomData({ ...req.body, theater: theater._id });
  roomData.features = parseJsonField(roomData.features);
  roomData.amenities = parseJsonField(roomData.amenities);
  roomData.slots = parseJsonField(roomData.slots);
  await applyUploadedImages(req, roomData);
  const room = await Room.create(roomData);
  res.status(201).json({ success: true, data: room });
});

exports.updateRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  const roomData = normalizeRoomData({ ...req.body });
  ['features', 'amenities', 'slots'].forEach((field) => { roomData[field] = parseJsonField(roomData[field], room[field]); });
  const couple = Number(roomData.couple ?? room.couple);
  const maximumMembers = Number(roomData.maximumMembers ?? room.maximumMembers);
  if (maximumMembers < couple) return next(new AppError('Maximum Members must be greater than or equal to Couple.', 400));
  await applyUploadedImages(req, roomData, room);
  Object.assign(room, roomData);
  await room.save();
  res.json({ success: true, data: room });
});

exports.deleteRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(new AppError('Room not found', 404));
  const activeBooking = await Booking.exists({ room: room._id, status: { $in: ['pending', 'confirmed', 'in-progress'] } });
  if (activeBooking) return next(new AppError('Cannot delete a room with active bookings. Deactivate it instead.', 400));
  for (const image of [room.image, ...(room.galleryImages || [])]) {
    if (image?.publicId) await deleteFromCloudinary(image.publicId);
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
