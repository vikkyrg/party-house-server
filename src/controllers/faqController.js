const FAQ = require('../models/FAQ');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { createAuditLog } = require('../services/auditService');

exports.getFAQs = catchAsync(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.category) filter.category = req.query.category;

  const faqs = await FAQ.find(filter).sort('sortOrder');
  res.json({ success: true, count: faqs.length, data: faqs });
});

exports.getFAQ = catchAsync(async (req, res, next) => {
  const faq = await FAQ.findById(req.params.id);
  if (!faq) return next(new AppError('FAQ not found', 404));

  faq.views += 1;
  await faq.save({ validateBeforeSave: false });

  res.json({ success: true, data: faq });
});

exports.createFAQ = catchAsync(async (req, res) => {
  const faq = await FAQ.create(req.body);

  await createAuditLog({
    user: req.user._id,
    action: 'create',
    model: 'FAQ',
    modelId: faq._id,
    changes: { after: faq.toObject() },
    req,
  });

  res.status(201).json({ success: true, data: faq });
});

exports.updateFAQ = catchAsync(async (req, res, next) => {
  const existing = await FAQ.findById(req.params.id);
  if (!existing) return next(new AppError('FAQ not found', 404));

  const before = existing.toObject();
  const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  await createAuditLog({
    user: req.user._id,
    action: 'update',
    model: 'FAQ',
    modelId: faq._id,
    changes: { before, after: faq.toObject() },
    req,
  });

  res.json({ success: true, data: faq });
});

exports.deleteFAQ = catchAsync(async (req, res, next) => {
  const faq = await FAQ.findByIdAndDelete(req.params.id);
  if (!faq) return next(new AppError('FAQ not found', 404));

  await createAuditLog({
    user: req.user._id,
    action: 'delete',
    model: 'FAQ',
    modelId: faq._id,
    changes: { before: faq.toObject() },
    req,
  });

  res.json({ success: true, message: 'FAQ deleted successfully' });
});
