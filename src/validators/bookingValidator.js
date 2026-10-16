const Joi = require('joi');

exports.createBookingSchema = Joi.object({
  theaterId: Joi.string().hex().length(24).required(),
  roomId: Joi.string().hex().length(24).required(),
  locationId: Joi.string().hex().length(24).optional(),
  date: Joi.date().iso().required(),
  timeSlot: Joi.string().required(),
  timeSlotId: Joi.string().hex().length(24).optional(),
  duration: Joi.number().integer().valid(1, 2, 3).default(3).optional(),
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
    name: Joi.string().trim().min(2).required().messages({
      'string.empty': 'Customer name is required',
    }),
    phone: Joi.string()
      .trim()
      .custom((value, helpers) => {
        // Strip out common formatting characters like spaces, dashes, parentheses, +91, or leading 0
        const cleaned = value.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
        if (/^[6-9]\d{9}$/.test(cleaned)) {
          return cleaned;
        }
        // If international/other valid phone with 10 digits
        if (/^\d{10}$/.test(cleaned)) {
          return cleaned;
        }
        return helpers.message('Please provide a valid 10-digit Indian mobile number (e.g. 9876543210)');
      })
      .required(),
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'string.empty': 'Email address is required',
    }),
    members: Joi.number().integer().min(1).required(),
    kids: Joi.number().integer().min(0).default(0),
    specialRequests: Joi.string().max(500).allow('', null),
  }).required(),
  discountCode: Joi.string(),
});

exports.cancelBookingSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

exports.checkAvailabilitySchema = Joi.object({
  roomId: Joi.string().hex().length(24).required(),
  date: Joi.alternatives().try(
    Joi.string().regex(/^\d{4}-\d{2}-\d{2}/),
    Joi.date()
  ).required(),
});
