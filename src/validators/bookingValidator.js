const Joi = require('joi');

exports.createBookingSchema = Joi.object({
  theaterId: Joi.string().hex().length(24).required(),
  roomId: Joi.string().hex().length(24).required(),
  locationId: Joi.string().hex().length(24).optional(),
  date: Joi.date().iso().required(),
  timeSlot: Joi.string().required(),
  timeSlotId: Joi.string().hex().length(24).optional(),
  eventTypeId: Joi.string().hex().length(24).required(),
  addOns: Joi.array().items(
    Joi.object({
      addOnId: Joi.string().hex().length(24),
      id: Joi.string().hex().length(24),
      quantity: Joi.number().integer().min(1).default(1),
    }).or('addOnId', 'id')
  ),
  cake: Joi.object({
    cakeId: Joi.string().hex().length(24).required(),
    size: Joi.string().required(),
  }).allow(null),
  customerDetails: Joi.object({
    name: Joi.string().required(),
    phone: Joi.string()
      .pattern(/^[6-9]\d{9}$/)
      .required(),
    email: Joi.string().email().required(),
    members: Joi.number().integer().min(1).required(),
    kids: Joi.number().integer().min(0).default(0),
    specialRequests: Joi.string().max(500),
  }).required(),
  discountCode: Joi.string(),
});

exports.cancelBookingSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

exports.checkAvailabilitySchema = Joi.object({
  roomId: Joi.string().hex().length(24).required(),
  date: Joi.date().iso().required(),
});
