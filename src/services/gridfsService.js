const mongoose = require('mongoose');
const { Readable } = require('stream');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

let bucket = null;

const getBucket = () => {
  if (!mongoose.connection?.db) {
    throw new AppError('MongoDB connection not ready for GridFS', 500);
  }
  if (!bucket || bucket.s?.db !== mongoose.connection.db) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'roomMedia',
    });
  }
  return bucket;
};

/**
 * Upload a binary buffer to GridFS
 * @param {Object} file { buffer, originalname, mimetype, size }
 * @param {Object} metadata
 * @returns {Promise<{ fileId: ObjectId, filename: String, contentType: String, size: Number }>}
 */
const uploadToGridFS = async (file, metadata = {}) => {
  if (!file || (!file.buffer && !file.data)) {
    throw new AppError('File buffer is required for GridFS upload', 400);
  }
  const buffer = file.buffer || file.data;
  const filename = file.originalname || file.filename || `media_${Date.now()}`;
  const contentType = file.mimetype || file.contentType || 'application/octet-stream';

  const gridBucket = getBucket();
  const uploadStream = gridBucket.openUploadStream(filename, {
    contentType,
    metadata: {
      ...metadata,
      uploadedAt: new Date(),
    },
  });

  return new Promise((resolve, reject) => {
    uploadStream.on('error', (err) => {
      logger.error('GridFS upload error', err);
      reject(new AppError('Failed to store media in GridFS', 500));
    });

    uploadStream.on('finish', async (uploadedFile) => {
      try {
        // GridFSBucket emits `finish` without a file argument in recent
        // driver versions. The stream id is the authoritative uploaded id.
        const fileId = uploadedFile?._id || uploadStream.id;
        if (!fileId) {
          throw new Error('GridFS upload completed without a file id');
        }

        const file = uploadedFile || (await gridBucket.find({ _id: fileId }).toArray())[0];
        resolve({
          fileId,
          filename: file?.filename || filename,
          contentType: file?.contentType || contentType,
          size: file?.length ?? buffer.length,
        });
      } catch (error) {
        logger.error('Failed to read completed GridFS upload metadata', error);
        reject(new AppError('Failed to finalize media upload', 500));
      }
    });

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Find file metadata in GridFS by ID
 */
const getGridFSFileById = async (fileId) => {
  try {
    const gridBucket = getBucket();
    const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    const files = await gridBucket.find({ _id: objectId }).toArray();
    return files[0] || null;
  } catch (error) {
    logger.warn(`Failed to find GridFS file by ID ${fileId}: ${error.message}`);
    return null;
  }
};

/**
 * Delete a file from GridFS by ID
 */
const deleteFromGridFS = async (fileId) => {
  if (!fileId) return;
  try {
    const gridBucket = getBucket();
    const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    await gridBucket.delete(objectId);
  } catch (error) {
    logger.warn(`GridFS delete error for fileId ${fileId}: ${error.message}`);
  }
};

/**
 * Stream a GridFS file with HTTP Range support (for videos & images)
 */
const streamGridFSFile = async (fileId, rangeHeader, res) => {
  const file = await getGridFSFileById(fileId);
  if (!file) {
    throw new AppError('Media file not found in GridFS', 404);
  }

  const fileSize = file.length;
  const contentType = file.contentType || file.metadata?.contentType || 'application/octet-stream';
  const gridBucket = getBucket();

  res.set('Accept-Ranges', 'bytes');
  res.set('Cache-Control', 'public, max-age=86400');
  res.set('Content-Type', contentType);

  if (!rangeHeader) {
    res.status(200);
    res.set('Content-Length', fileSize);
    const downloadStream = gridBucket.openDownloadStream(file._id);
    downloadStream.on('error', (err) => {
      logger.error('GridFS stream error', err);
      if (!res.headersSent) res.status(500).end();
    });
    return downloadStream.pipe(res);
  }

  // Range: bytes=start-end
  const matches = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!matches) {
    res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  const rawStart = matches[1];
  const rawEnd = matches[2];

  let start = rawStart ? parseInt(rawStart, 10) : 0;
  let end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;

  if (isNaN(start) || start >= fileSize || start < 0) {
    res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  if (isNaN(end) || end >= fileSize) {
    end = fileSize - 1;
  }

  if (start > end) {
    res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  const chunkSize = end - start + 1;

  res.status(206);
  res.set({
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Content-Length': chunkSize,
  });

  const downloadStream = gridBucket.openDownloadStream(file._id, {
    start,
    end: end + 1,
  });

  downloadStream.on('error', (err) => {
    logger.error('GridFS range stream error', err);
    if (!res.headersSent) res.status(500).end();
  });

  downloadStream.pipe(res);
};

module.exports = {
  getBucket,
  uploadToGridFS,
  getGridFSFileById,
  deleteFromGridFS,
  streamGridFSFile,
};
