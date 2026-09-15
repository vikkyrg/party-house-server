const File = require('../models/File');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

exports.getFile = catchAsync(async (req, res, next) => {
  const file = await File.findById(req.params.id);

  if (!file) {
    return next(new AppError('File not found', 404));
  }

  // Set proper cache headers so browsers can cache the images (e.g. 30 days)
  res.set('Cache-Control', 'public, max-age=2592000');
  res.set('Content-Type', file.contentType);
  res.set('Content-Length', file.size || file.data.length);
  
  // Stream the buffer to the client
  res.send(file.data);
});
