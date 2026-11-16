const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const handleCastErrorDB = (err) => new AppError(`Invalid ${err.path}: ${err.value}`, 400);

const handleDuplicateFieldsDB = (err) => {
  const keyValue = err.keyValue || {};
  const field = Object.keys(keyValue)[0] || 'field';
  const val = keyValue[field];

  if (field === '_id') {
    return new AppError('A booking with this identifier already exists. Please refresh and try again.', 400);
  }
  if (field === 'bookingId') {
    return new AppError('A booking reference conflict occurred. Please submit again.', 400);
  }
  if (field === 'paymentRecords.transactionReferenceNormalized') {
    return new AppError('This transaction reference / UTR has already been submitted.', 400);
  }
  return new AppError(`Duplicate field value: ${field}${val ? ` (${val})` : ''}. Please use another value.`, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  return new AppError(`Invalid input data. ${errors.join('. ')}`, 400);
};

const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired. Please log in again.', 401);

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    message: err.message,
    error: err,
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  } else {
    logger.error('ERROR', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Something went wrong!',
    });
  }
};

module.exports = (err, req, res, _next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (err.statusCode >= 400 && err.statusCode < 500) {
    logger.warn(`[${req.method}] ${req.originalUrl} - ${err.statusCode}: ${err.message}`);
  } else {
    logger.error(`[${req.method}] ${req.originalUrl} - ${err.statusCode}: ${err.message}`, err);
  }

  if (process.env.NODE_ENV === 'development') {
    let error = { ...err, message: err.message };
    if (err.name === 'CastError') error = handleCastErrorDB(err);
    if (err.code === 11000) error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
    sendErrorDev(error, res);
  } else {
    let error = { ...err, message: err.message };
    if (err.name === 'CastError') error = handleCastErrorDB(err);
    if (err.code === 11000) error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
    sendErrorProd(error, res);
  }
};
