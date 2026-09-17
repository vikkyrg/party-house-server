const express = require('express');
const multer = require('multer');
const {
  getGalleryImages,
  addGalleryImage,
  updateGalleryImage,
  deleteGalleryImage
} = require('../controllers/galleryController');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router
  .route('/')
  .get(getGalleryImages)
  .post(protect, authorize('admin', 'superadmin'), upload.single('image'), addGalleryImage);

router
  .route('/:id')
  .put(protect, authorize('admin', 'superadmin'), upload.single('image'), updateGalleryImage)
  .delete(protect, authorize('admin', 'superadmin'), deleteGalleryImage);

module.exports = router;
