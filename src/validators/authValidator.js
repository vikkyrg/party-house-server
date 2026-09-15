const Joi = require('joi');

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

exports.registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),
  password: Joi.string().min(8).pattern(passwordPattern).required().messages({
    'string.pattern.base':
      'Password must contain uppercase, lowercase, number, and special character',
  }),
});

exports.loginSchema = Joi.object({
  email: Joi.string().email(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/),
  password: Joi.string().required(),
}).or('email', 'phone');

exports.verifyOtpSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),
  otp: Joi.string().length(6).required(),
});

exports.forgotPasswordSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),
});

exports.resetPasswordSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),
  otp: Joi.string().length(6).required(),
  password: Joi.string().min(8).pattern(passwordPattern).required(),
});

exports.changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).pattern(passwordPattern).required(),
});

exports.updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50),
  email: Joi.string().email(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/),
}).min(1);
