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
  location: Joi.string().max(200).allow(''),
  couple: Joi.number().integer().positive().max(100).optional().allow(null, ''),
  maximumMembers: Joi.number().integer().min(1).max(100).required(),
  price: Joi.number().min(0).optional(),
  price1Hour: Joi.number().min(0).required(),
  price2Hours: Joi.number().min(0).required(),
  price3Hours: Joi.number().min(0).required(),
  googleMapLink: Joi.string().uri().allow(''),
  screenSize: Joi.string().max(100).allow('', null).optional(),
  pictureQuality: Joi.string().max(255).allow('', null).optional(),
  soundQuality: Joi.string().max(255).allow('', null).optional(),
  features: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  amenities: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  slots: Joi.alternatives().try(Joi.string(), Joi.array().items(slot)),
  media: Joi.any().optional(),
  mediaOrder: Joi.any().optional(),
  removeMediaIds: Joi.any().optional(),
  removeGalleryImages: Joi.any().optional(),
  removeImage: Joi.any().optional(),
  isActive: Joi.boolean(),
}).custom(validateMemberRange).unknown(true);

exports.createRoomSchema = schema;
exports.updateRoomSchema = schema.fork(['name', 'maximumMembers', 'price'], (field) => field.optional());
