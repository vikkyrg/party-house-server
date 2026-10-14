const Joi = require('joi');

exports.createContactMessageSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    'string.empty': 'Name is required',
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name cannot exceed 100 characters',
  }),
  email: Joi.string().trim().email().required().messages({
    'string.empty': 'Email is required',
    'string.email': 'Please provide a valid email address',
  }),
  phone: Joi.string().trim().min(7).max(20).required().messages({
    'string.empty': 'Phone number is required',
  }),
  subject: Joi.string().trim().min(2).max(200).required().messages({
    'string.empty': 'Subject is required',
  }),
  message: Joi.string().trim().min(5).max(3000).required().messages({
    'string.empty': 'Message is required',
    'string.min': 'Message must be at least 5 characters',
  }),
});

exports.updateContactMessageStatusSchema = Joi.object({
  status: Joi.string().valid('new', 'read').required().messages({
    'any.only': 'Status must be either "new" or "read"',
    'string.empty': 'Status is required',
  }),
});
