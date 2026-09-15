const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Theater = require('../models/Theater');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { createAuditLog } = require('../services/auditService');

const updateTheaterRating = async (theaterId) => {
  const stats = await Review.aggregate([
    { $match: { theater: theaterId, isApproved: true } },
    {
      $group: {
        _id: '$theater',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats.length) {
    await Theater.findByIdAndUpdate(theaterId, {
      rating: Math.round(stats[0].avgRating * 10) / 10,
      totalReviews: stats[0].count,
    });
  } else {
    await Theater.findByIdAndUpdate(theaterId, { rating: 0, totalReviews: 0 });
  }
};

exports.getReviews = catchAsync(async (req, res) => {
  const filter = { isApproved: true };
  if (req.query.theater) filter.theater = req.query.theater;

  const reviews = await Review.find(filter)
    .populate('user', 'name profileImage')
    .populate('theater', 'name')
    .sort('-createdAt');

  res.json({ success: true, count: reviews.length, data: reviews });
});

exports.getReview = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id)
    .populate('user', 'name')
    .populate('theater', 'name');

  if (!review) return next(new AppError('Review not found', 404));
  res.json({ success: true, data: review });
});

exports.createReview = catchAsync(async (req, res, next) => {
  const { bookingId, rating, comment } = req.body;

  const booking = await Booking.findById(bookingId);
  if (!booking) return next(new AppError('Booking not found', 404));
  if (booking.user.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized', 403));
  }
  if (booking.status !== 'completed') {
    return next(new AppError('You can only review completed bookings', 400));
  }

  const existing = await Review.findOne({ booking: bookingId });
  if (existing) return next(new AppError('Review already submitted for this booking', 400));

  const review = await Review.create({
    booking: bookingId,
    user: req.user._id,
    theater: booking.theater,
    rating,
    comment,
  });

  booking.review = review._id;
  await booking.save();

  res.status(201).json({ success: true, data: review });
});

exports.updateReview = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(new AppError('Review not found', 404));
  if (review.user.toString() !== req.user._id.toString()) {
    return next(new AppError('Not authorized', 403));
  }

  review.rating = req.body.rating ?? review.rating;
  review.comment = req.body.comment ?? review.comment;
  review.isApproved = false;
  await review.save();

  res.json({ success: true, data: review });
});

exports.deleteReview = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(new AppError('Review not found', 404));

  if (
    review.user.toString() !== req.user._id.toString() &&
    !['admin', 'super-admin'].includes(req.user.role)
  ) {
    return next(new AppError('Not authorized', 403));
  }

  const theaterId = review.theater;
  await review.deleteOne();
  await updateTheaterRating(theaterId);

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'Review',
    modelId: review._id,
    changes: { before: review.toObject() },
    req,
  });

  res.json({ success: true, message: 'Review deleted successfully' });
});

exports.approveReview = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(new AppError('Review not found', 404));

  const before = { isApproved: review.isApproved };
  review.isApproved = req.body.isApproved !== undefined ? req.body.isApproved : true;
  review.approvedBy = req.user._id;
  review.approvedAt = new Date();
  await review.save();

  await updateTheaterRating(review.theater);

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Review',
    modelId: review._id,
    changes: { before, after: { isApproved: review.isApproved } },
    req,
  });

  res.json({ success: true, data: review });
});

exports.respondToReview = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  if (!review) return next(new AppError('Review not found', 404));

  review.response = {
    text: req.body.text,
    respondedBy: req.user._id,
    respondedAt: new Date(),
  };
  await review.save();

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Review',
    modelId: review._id,
    changes: { after: { response: review.response.text } },
    req,
  });

  res.json({ success: true, data: review });
});
