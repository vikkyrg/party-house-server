const Joi = require('joi');

const slot = Joi.object({
  _id: Joi.string().hex().length(24).allow(''),
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
  isActive: Joi.boolean().default(true),
});

const validateMemberRange = (value, helpers) => {
  if (value.couple !== undefined && value.maximumMembers !== undefined && value.maximumMembers < value.couple) {
    return helpers.message({ custom: 'Maximum Members must be greater than or equal to Couple.' });
  }
  return value;
};

const schema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(1000).allow(''),
  couple: Joi.number().integer().positive().max(100).required(),
  maximumMembers: Joi.number().integer().min(1).max(100).required(),
  price: Joi.number().min(0).required(),
  googleMapLink: Joi.string().uri().allow(''),
  features: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  amenities: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  slots: Joi.alternatives().try(Joi.string(), Joi.array().items(slot)),
  isActive: Joi.boolean(),
  sortOrder: Joi.number().integer().min(0),
}).custom(validateMemberRange);

exports.createRoomSchema = schema;
exports.updateRoomSchema = schema.fork(['name', 'couple', 'maximumMembers', 'price'], (field) => field.optional());
