const Story = require('../models/Story');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
// Removed cloudinary

// @desc    Get all stories
// @route   GET /api/v1/stories
// @access  Public
exports.getStories = catchAsync(async (req, res, next) => {
  const reqQuery = { ...req.query };
  const removeFields = ['select', 'sort', 'page', 'limit'];
  removeFields.forEach((param) => delete reqQuery[param]);

  let queryStr = JSON.stringify(reqQuery);
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (match) => `$${match}`);
  
  let query = Story.find(JSON.parse(queryStr));

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-publishedAt');
  }

  const stories = await query;

  res.status(200).json({
    success: true,
    count: stories.length,
    data: stories,
  });
});

// @desc    Add story
// @route   POST /api/v1/stories
// @access  Private/Admin
exports.addStory = catchAsync(async (req, res, next) => {
  if (!req.file && !req.body.image) {
    return next(new AppError(`Please upload a file`, 400));
  }

  const data = { ...req.body };

  if (req.file) {
    const base64Data = req.file.buffer.toString('base64');
    data.image = `data:${req.file.mimetype};base64,${base64Data}`;
  }

  const story = await Story.create(data);

  res.status(201).json({
    success: true,
    data: story,
  });
});

// @desc    Update story
// @route   PUT /api/v1/stories/:id
// @access  Private/Admin
exports.updateStory = catchAsync(async (req, res, next) => {
  let story = await Story.findById(req.params.id);

  if (!story) {
    return next(new AppError(`Story not found with id of ${req.params.id}`, 404));
  }

  const data = { ...req.body };

  if (req.file) {
    const base64Data = req.file.buffer.toString('base64');
    data.image = `data:${req.file.mimetype};base64,${base64Data}`;
  }

  story = await Story.findByIdAndUpdate(req.params.id, data, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: story,
  });
});

// @desc    Delete story
// @route   DELETE /api/v1/stories/:id
// @access  Private/Admin
exports.deleteStory = catchAsync(async (req, res, next) => {
  const story = await Story.findById(req.params.id);

  if (!story) {
    return next(new AppError(`Story not found with id of ${req.params.id}`, 404));
  }



  await story.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});
