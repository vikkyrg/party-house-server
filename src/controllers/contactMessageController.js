const ContactMessage = require('../models/ContactMessage');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { createAuditLog } = require('../services/auditService');

// @desc    Submit a new contact message (Public)
// @route   POST /api/v1/contact or /api/contact
// @access  Public
exports.submitContactMessage = catchAsync(async (req, res, next) => {
  const { name, email, phone, subject, message } = req.body;

  const contactMessage = await ContactMessage.create({
    name,
    email,
    phone,
    subject,
    message,
    status: 'new',
  });

  res.status(201).json({
    success: true,
    message: 'Your message has been sent successfully. We will get back to you soon!',
    data: contactMessage,
  });
});

// @desc    Get all contact messages (Admin)
// @route   GET /api/v1/admin/contact-messages
// @access  Private (Admin / Super-Admin)
exports.getAdminContactMessages = catchAsync(async (req, res, next) => {
  const { search, status, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
  const query = {};

  if (status && status !== 'all') {
    query.status = status;
  }

  if (search && search.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    query.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { subject: searchRegex },
      { phone: searchRegex },
    ];
  }

  const messages = await ContactMessage.find(query)
    .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
    .limit(safeLimit)
    .skip((page - 1) * safeLimit);

  const total = await ContactMessage.countDocuments(query);
  const unreadCount = await ContactMessage.countDocuments({ status: 'new' });

  res.status(200).json({
    success: true,
    data: messages,
    unreadCount,
    pagination: {
      page: parseInt(page, 10),
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    },
  });
});

// @desc    Get single contact message (Admin)
// @route   GET /api/v1/admin/contact-messages/:id
// @access  Private (Admin / Super-Admin)
exports.getContactMessageById = catchAsync(async (req, res, next) => {
  const contactMessage = await ContactMessage.findById(req.params.id);

  if (!contactMessage) {
    return next(new AppError('Contact message not found', 404));
  }

  res.status(200).json({
    success: true,
    data: contactMessage,
  });
});

// @desc    Update contact message status (Admin)
// @route   PATCH /api/v1/admin/contact-messages/:id/status
// @access  Private (Admin / Super-Admin)
exports.updateContactMessageStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;

  const contactMessage = await ContactMessage.findById(req.params.id);
  if (!contactMessage) {
    return next(new AppError('Contact message not found', 404));
  }

  const before = contactMessage.toObject();
  contactMessage.status = status;
  await contactMessage.save();

  if (req.user) {
    await createAuditLog({
      user: req.user._id,
      action: 'update',
      model: 'ContactMessage',
      modelId: contactMessage._id,
      changes: { before: { status: before.status }, after: { status: contactMessage.status } },
      req,
    });
  }

  res.status(200).json({
    success: true,
    message: `Message status updated to ${status}`,
    data: contactMessage,
  });
});

// @desc    Delete contact message (Admin)
// @route   DELETE /api/v1/admin/contact-messages/:id
// @access  Private (Admin / Super-Admin)
exports.deleteContactMessage = catchAsync(async (req, res, next) => {
  const contactMessage = await ContactMessage.findByIdAndDelete(req.params.id);

  if (!contactMessage) {
    return next(new AppError('Contact message not found', 404));
  }

  if (req.user) {
    await createAuditLog({
      user: req.user._id,
      action: 'delete',
      model: 'ContactMessage',
      modelId: contactMessage._id,
      changes: { before: contactMessage.toObject() },
      req,
    });
  }

  res.status(200).json({
    success: true,
    message: 'Contact message deleted successfully',
  });
});

// @desc    Get unread contact messages count (Admin)
// @route   GET /api/v1/admin/contact-messages/unread-count
// @access  Private (Admin / Super-Admin)
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const unreadCount = await ContactMessage.countDocuments({ status: 'new' });

  res.status(200).json({
    success: true,
    data: {
      unreadCount,
    },
  });
});

// @desc    Mark all unread contact messages as read (Admin)
// @route   PATCH /api/v1/admin/contact-messages/mark-all-read
// @access  Private (Admin / Super-Admin)
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  const result = await ContactMessage.updateMany({ status: 'new' }, { $set: { status: 'read' } });

  res.status(200).json({
    success: true,
    message: 'All unread messages marked as read',
    modifiedCount: result.modifiedCount,
  });
});

