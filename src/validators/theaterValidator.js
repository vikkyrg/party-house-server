const Joi = require('joi');

exports.createTheaterSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().allow(''),
  city: Joi.string().hex().length(24).required(),
  location: Joi.string().hex().length(24).required(),
  address: Joi.string().max(500).required(),
  landmark: Joi.string().allow(''),
  googleMapsLink: Joi.string().uri().allow(''),
  capacity: Joi.number().integer().min(5).max(50).required(),
  pricePerHour: Joi.number().min(0).required(),
  additionalGuestPrice: Joi.number().min(0).default(0),
  theatreVideoUrl: Joi.string().uri().allow(''),
  branchVideoUrl: Joi.string().uri().allow(''),
  amenities: Joi.array().items(Joi.string()),
  eventTypes: Joi.array().items(Joi.string().hex().length(24)),
  slots: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(
      Joi.object({
        _id: Joi.string().allow(''),
        startTime: Joi.string().required(),
        endTime: Joi.string().required(),
      })
    )
  ),
  isActive: Joi.boolean(),
  isFeatured: Joi.boolean(),
  metaTitle: Joi.string(),
  metaDescription: Joi.string(),
});

exports.updateTheaterSchema = exports.createTheaterSchema.fork(
  ['name', 'city', 'location', 'address', 'capacity', 'pricePerHour'],
  (schema) => schema.optional()
);
