const File = require('../models/File');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const uploadToCloudinary = async (file, folder = 'cs-cinemas') => {
  if (!file || !file.buffer) {
    throw new AppError('File buffer is missing', 400);
  }

  try {
    const newFile = await File.create({
      data: file.buffer,
      contentType: file.mimetype,
      filename: file.originalname || 'upload',
      size: file.size || file.buffer.length,
      folder: folder
    });

    const baseUrl = process.env.API_BASE_URL || '/api/v1';

    return {
      url: `${baseUrl}/files/${newFile._id}`,
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
