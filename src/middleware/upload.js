const multer = require('multer');
const AppError = require('../utils/AppError');

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only images and videos are allowed.', 400), false);
  }
};

exports.upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
});

exports.uploadSingle = (fieldName) =>
  multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter }).single(fieldName);

exports.uploadMultiple = (fieldName, maxCount = 5) =>
  multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter }).array(
    fieldName,
    maxCount
  );
