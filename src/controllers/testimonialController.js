const Testimonial = require('../models/Testimonial');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { createAuditLog } = require('../services/auditService');

exports.getTestimonials = catchAsync(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.featured === 'true') filter.isFeatured = true;

  const testimonials = await Testimonial.find(filter).populate('theater', 'name').sort('sortOrder');

  res.json({ success: true, count: testimonials.length, data: testimonials });
});

exports.createTestimonial = catchAsync(async (req, res) => {
  const testimonial = await Testimonial.create(req.body);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'Testimonial',
    modelId: testimonial._id,
    changes: { after: testimonial.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: testimonial });
});

exports.updateTestimonial = catchAsync(async (req, res, next) => {
  const existing = await Testimonial.findById(req.params.id);
  if (!existing) return next(new AppError('Testimonial not found', 404));

  const before = existing.toObject();
  const testimonial = await Testimonial.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'Testimonial',
    modelId: testimonial._id,
    changes: { before, after: testimonial.toObject() },
    req,
  });

  res.json({ success: true, data: testimonial });
});

exports.deleteTestimonial = catchAsync(async (req, res, next) => {
  const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
  if (!testimonial) return next(new AppError('Testimonial not found', 404));

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'Testimonial',
    modelId: testimonial._id,
    changes: { before: testimonial.toObject() },
    req,
  });

  res.json({ success: true, message: 'Testimonial deleted successfully' });
});
