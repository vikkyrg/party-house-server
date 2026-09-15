const AppError = require('../utils/AppError');

const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map((detail) => detail.message).join('. ');
      return next(new AppError(message, 400));
    }

    req[property] = value;
    next();
  };
};

module.exports = validateRequest;
