const Joi = require('joi');

const slot = Joi.object({
  _id: Joi.string().hex().length(24).allow(''),
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
  isActive: Joi.boolean().default(true),
});

const schema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(1000).allow(''),
  capacity: Joi.number().integer().min(1).max(100).required(),
  basePrice: Joi.number().min(0).required(),
  additionalGuestPrice: Joi.number().min(0).default(0),
  extraGuestPrice: Joi.number().min(0).optional(),
  googleMapLink: Joi.string().uri().allow(''),
  features: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  amenities: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  slots: Joi.alternatives().try(Joi.string(), Joi.array().items(slot)),
  isActive: Joi.boolean(),
  sortOrder: Joi.number().integer().min(0),
});

exports.createRoomSchema = schema;
exports.updateRoomSchema = schema.fork(['name', 'capacity', 'basePrice'], (field) => field.optional());
