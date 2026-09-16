const File = require('../models/File');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const uploadToCloudinary = async (file, folder = 'cs-cinemas') => {
  if (!file || (!file.buffer && typeof file !== 'string' && !file.url)) {
    throw new AppError('File buffer or image data is missing', 400);
  }

  // If already a base64 string or object with base64 url
  if (typeof file === 'string' && file.startsWith('data:')) {
    return {
      url: file,
      publicId: 'raw_' + Date.now(),
    };
  }

  if (file.url && file.url.startsWith('data:')) {
    return {
      url: file.url,
      publicId: file.publicId || 'raw_' + Date.now(),
    };
  }

  try {
    const mimetype = file.mimetype || 'image/png';

    const newFile = await File.create({
      data: file.buffer,
      contentType: mimetype,
      filename: file.originalname || 'upload',
      size: file.size || file.buffer.length,
      folder: folder
    });

    const apiUrl = process.env.API_BASE_URL || '/api/v1';

    return {
      url: `${apiUrl}/files/${newFile._id.toString()}`,
      publicId: newFile._id.toString(),
    };
  } catch (error) {
    logger.error('File save to MongoDB failed', error);
    throw new AppError('File upload failed', 500);
  }
};

const deleteFromCloudinary = async (publicId) => {
  if (!publicId || publicId.startsWith('mock_')) return;
  
  try {
    await File.findByIdAndDelete(publicId);
  } catch (error) {
    logger.error('File delete from MongoDB failed', error);
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };
