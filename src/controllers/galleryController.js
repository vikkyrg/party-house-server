const Gallery = require('../models/Gallery');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const { cloudinaryUpload, cloudinaryDestroy } = require('../utils/cloudinary');

// @desc    Get all gallery images
// @route   GET /api/v1/gallery
// @access  Public
exports.getGalleryImages = asyncHandler(async (req, res, next) => {
  const reqQuery = { ...req.query };
  const removeFields = ['select', 'sort', 'page', 'limit'];
  removeFields.forEach((param) => delete reqQuery[param]);

  let queryStr = JSON.stringify(reqQuery);
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (match) => `$${match}`);
  
  let query = Gallery.find(JSON.parse(queryStr));

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('sortOrder -createdAt');
  }

  const images = await query;

  res.status(200).json({
    success: true,
    count: images.length,
    data: images,
  });
});

// @desc    Add gallery image
// @route   POST /api/v1/gallery
// @access  Private/Admin
exports.addGalleryImage = asyncHandler(async (req, res, next) => {
  if (!req.file && !req.body.image) {
    return next(new ErrorResponse(`Please upload a file`, 400));
  }

  const data = { ...req.body };

  if (req.file) {
    const result = await cloudinaryUpload(req.file.buffer, 'gallery');
    data.image = {
      url: result.secure_url,
      publicId: result.public_id,
      alt: data.title || 'Gallery image',
    };
  }

  const image = await Gallery.create(data);

  res.status(201).json({
    success: true,
    data: image,
  });
});

// @desc    Update gallery image
// @route   PUT /api/v1/gallery/:id
// @access  Private/Admin
exports.updateGalleryImage = asyncHandler(async (req, res, next) => {
  let image = await Gallery.findById(req.params.id);

  if (!image) {
    return next(new ErrorResponse(`Image not found with id of ${req.params.id}`, 404));
  }

  const data = { ...req.body };

  if (req.file) {
    if (image.image && image.image.publicId) {
      await cloudinaryDestroy(image.image.publicId);
    }
    const result = await cloudinaryUpload(req.file.buffer, 'gallery');
    data.image = {
      url: result.secure_url,
      publicId: result.public_id,
      alt: data.title || image.title || 'Gallery image',
    };
  }

  image = await Gallery.findByIdAndUpdate(req.params.id, data, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: image,
  });
});

// @desc    Delete gallery image
// @route   DELETE /api/v1/gallery/:id
// @access  Private/Admin
exports.deleteGalleryImage = asyncHandler(async (req, res, next) => {
  const image = await Gallery.findById(req.params.id);

  if (!image) {
    return next(new ErrorResponse(`Image not found with id of ${req.params.id}`, 404));
  }

  if (image.image && image.image.publicId) {
    await cloudinaryDestroy(image.image.publicId);
  }

  await image.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});
