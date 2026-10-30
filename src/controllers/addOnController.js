const AddOn = require('../models/AddOn');
const Booking = require('../models/Booking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { createAuditLog } = require('../services/auditService');

exports.getAddOns = catchAsync(async (req, res) => {
  const filter = req.query.includeInactive ? {} : { isActive: true };
  if (req.query.category) filter.category = req.query.category;

  const addOns = await AddOn.find(filter).sort({ displayOrder: 1, createdAt: 1, name: 1 });
  res.json({ success: true, count: addOns.length, data: addOns });
});

exports.getAddOn = catchAsync(async (req, res, next) => {
  const addOn = await AddOn.findById(req.params.id);
  if (!addOn) return next(new AppError('Add-on not found', 404));
  res.json({ success: true, data: addOn });
});

const { uploadToCloudinary, deleteFromCloudinary } = require('../services/fileService');

exports.createAddOn = catchAsync(async (req, res) => {
  const addOnData = { ...req.body };
  const uploadedImages = [];

  // Handle uploaded files (up to 3)
  const files = req.files || (req.file ? [req.file] : []);
  for (const file of files) {
    const uploaded = await uploadToCloudinary(file, 'add-ons');
    uploadedImages.push({ url: uploaded.url, publicId: uploaded.publicId, alt: addOnData.name });
  }

  // Handle base64 / existing URLs passed in body
  if (req.body.existingImages) {
    try {
      const parsed = typeof req.body.existingImages === 'string' ? JSON.parse(req.body.existingImages) : req.body.existingImages;
      if (Array.isArray(parsed)) {
        uploadedImages.push(...parsed);
      }
    } catch (e) {}
  } else if (addOnData.image && typeof addOnData.image === 'string' && addOnData.image.startsWith('data:')) {
    uploadedImages.push({ url: addOnData.image, publicId: 'raw_' + Date.now(), alt: addOnData.name });
  }

  // Limit to at most 3 images
  const finalImages = uploadedImages.slice(0, 3);
  addOnData.images = finalImages;
  if (finalImages.length > 0) {
    addOnData.image = finalImages[0];
  }

  // Handle duration pricing numbers
  if (addOnData.price1Hour !== undefined) addOnData.price1Hour = Number(addOnData.price1Hour);
  if (addOnData.price2Hours !== undefined) addOnData.price2Hours = Number(addOnData.price2Hours);
  if (addOnData.price3Hours !== undefined) addOnData.price3Hours = Number(addOnData.price3Hours);

  // Fallback to price or 2Hours price
  const basePrice = addOnData.price2Hours ?? addOnData.price1Hour ?? Number(addOnData.price) ?? 0;
  addOnData.price = basePrice;
  if (addOnData.price1Hour === undefined) addOnData.price1Hour = basePrice;
  if (addOnData.price2Hours === undefined) addOnData.price2Hours = basePrice;
  if (addOnData.price3Hours === undefined) addOnData.price3Hours = basePrice;

  addOnData.pricing = {
    oneHour: addOnData.price1Hour,
    twoHours: addOnData.price2Hours,
    threeHours: addOnData.price3Hours,
  };

  // Assign next displayOrder by default if not explicitly provided
  if (addOnData.displayOrder === undefined) {
    const highestOrderAddon = await AddOn.findOne().sort({ displayOrder: -1 }).select('displayOrder');
    addOnData.displayOrder = highestOrderAddon && typeof highestOrderAddon.displayOrder === 'number'
      ? highestOrderAddon.displayOrder + 1
      : 0;
  }

  const addOn = await AddOn.create(addOnData);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'AddOn',
    modelId: addOn._id,
    changes: { after: addOn.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: addOn });
});

exports.updateAddOn = catchAsync(async (req, res, next) => {
  const existing = await AddOn.findById(req.params.id);
  if (!existing) return next(new AppError('Add-on not found', 404));

  const updateData = { ...req.body };
  const uploadedImages = [];

  // Keep specified existing images
  if (req.body.existingImages) {
    try {
      const parsed = typeof req.body.existingImages === 'string' ? JSON.parse(req.body.existingImages) : req.body.existingImages;
      if (Array.isArray(parsed)) {
        uploadedImages.push(...parsed);
      }
    } catch (e) {}
  } else if (!req.files?.length && !req.file && existing.images?.length) {
    // If no existingImages specified and no new files uploaded, keep existing images
    uploadedImages.push(...existing.images);
  } else if (!req.files?.length && !req.file && existing.image?.url) {
    uploadedImages.push(existing.image);
  }

  // Upload any newly selected files
  const files = req.files || (req.file ? [req.file] : []);
  for (const file of files) {
    const uploaded = await uploadToCloudinary(file, 'add-ons');
    uploadedImages.push({ url: uploaded.url, publicId: uploaded.publicId, alt: updateData.name || existing.name });
  }

  // Delete removed images from cloudinary if publicId present
  const retainedPublicIds = new Set(uploadedImages.map(img => img.publicId).filter(Boolean));
  const oldImages = [...(existing.images || []), existing.image].filter(Boolean);
  for (const oldImg of oldImages) {
    if (oldImg.publicId && !retainedPublicIds.has(oldImg.publicId)) {
      await deleteFromCloudinary(oldImg.publicId).catch(console.error);
    }
  }

  const finalImages = uploadedImages.slice(0, 3);
  updateData.images = finalImages;
  updateData.image = finalImages.length > 0 ? finalImages[0] : undefined;

  // Handle duration pricing numbers
  if (updateData.price1Hour !== undefined) updateData.price1Hour = Number(updateData.price1Hour);
  if (updateData.price2Hours !== undefined) updateData.price2Hours = Number(updateData.price2Hours);
  if (updateData.price3Hours !== undefined) updateData.price3Hours = Number(updateData.price3Hours);

  const basePrice = updateData.price2Hours ?? updateData.price1Hour ?? Number(updateData.price ?? existing.price) ?? 0;
  updateData.price = basePrice;
  if (updateData.price1Hour === undefined) updateData.price1Hour = existing.price1Hour ?? basePrice;
  if (updateData.price2Hours === undefined) updateData.price2Hours = existing.price2Hours ?? basePrice;
  if (updateData.price3Hours === undefined) updateData.price3Hours = existing.price3Hours ?? basePrice;

  updateData.pricing = {
    oneHour: updateData.price1Hour,
    twoHours: updateData.price2Hours,
    threeHours: updateData.price3Hours,
  };

  const before = existing.toObject();
  const addOn = await AddOn.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'AddOn',
    modelId: addOn._id,
    changes: { before, after: addOn.toObject() },
    req,
  });

  res.json({ success: true, data: addOn });
});

exports.deleteAddOn = catchAsync(async (req, res, next) => {
  const addOn = await AddOn.findById(req.params.id);
  if (!addOn) return next(new AppError('Add-on not found', 404));

  // Preserve addOn name in existing bookings so historical records remain intact
  try {
    await Booking.updateMany(
      { 'addOns.addOn': addOn._id },
      { $set: { 'addOns.$[elem].variantName': addOn.name } },
      { arrayFilters: [{ 'elem.addOn': addOn._id, 'elem.variantName': { $in: [null, '', undefined] } }] }
    );
  } catch (err) {
    // If updateMany arrayFilters not supported on older mongo, fallback to plain update
    await Booking.updateMany(
      { 'addOns.addOn': addOn._id },
      { $set: { 'addOns.$.variantName': addOn.name } }
    );
  }

  if (addOn.image?.publicId) {
    try {
      await deleteFromCloudinary(addOn.image.publicId);
    } catch (e) {
      // ignore cloudinary errors on delete
    }
  }

  await addOn.deleteOne();

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'AddOn',
    modelId: addOn._id,
    changes: { before: addOn.toObject() },
    req,
  });

  res.json({ success: true, message: 'Add-on deleted successfully' });
});

exports.reorderAddOns = catchAsync(async (req, res, next) => {
  const ids = req.body.addOnIds || req.body.orderedIds || req.body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return next(new AppError('addOnIds array is required', 400));
  }

  const bulkOps = ids.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { displayOrder: index, sortOrder: index } },
    },
  }));

  await AddOn.bulkWrite(bulkOps);

  const addOns = await AddOn.find({}).sort({ displayOrder: 1, sortOrder: 1, createdAt: 1, name: 1 });
  res.json({ success: true, message: 'Add-ons reordered successfully', data: addOns });
});
