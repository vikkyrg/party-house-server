const Joi = require('joi');

exports.createBookingSchema = Joi.object({
  theaterId: Joi.string().hex().length(24).required(),
  date: Joi.date().iso().required(),
  timeSlot: Joi.string().required(),
  eventTypeId: Joi.string().hex().length(24).required(),
  addOns: Joi.array().items(
    Joi.object({
      addOnId: Joi.string().hex().length(24).required(),
      quantity: Joi.number().integer().min(1).default(1),
    })
  ),
  customerDetails: Joi.object({
    name: Joi.string().required(),
    phone: Joi.string()
      .pattern(/^[6-9]\d{9}$/)
      .required(),
    email: Joi.string().email().required(),
    specialRequests: Joi.string().max(500),
  }).required(),
  discountCode: Joi.string(),
});

exports.cancelBookingSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

exports.checkAvailabilitySchema = Joi.object({
  theaterId: Joi.string().hex().length(24).required(),
  date: Joi.date().iso().required(),
});
