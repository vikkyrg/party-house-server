const multer = require('multer');
const AppError = require('../utils/AppError');

const storage = multer.memoryStorage();

const allowedMimeTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
];

const fileFilter = (_req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Supported formats: JPG, JPEG, PNG, WebP for images; MP4, WebM for videos.', 400), false);
  }
};

exports.upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter,
});

exports.uploadSingle = (fieldName) =>
  multer({ storage, limits: { fileSize: 150 * 1024 * 1024 }, fileFilter }).single(fieldName);

exports.uploadMultiple = (fieldName, maxCount = 20) =>
  multer({ storage, limits: { fileSize: 150 * 1024 * 1024 }, fileFilter }).array(
    fieldName,
    maxCount
  );

exports.uploadRoomMediaFiles = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter,
}).any();
