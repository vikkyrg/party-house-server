const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const galleryController = require('../controllers/galleryController');

const router = express.Router();

router.get('/', galleryController.getGalleryItems);
router.get('/:id', galleryController.getGalleryItem);

// Protected Admin Routes
router.use(protect);
router.use(authorize('admin', 'super-admin'));

router.post('/', upload.single('image'), galleryController.createGalleryItem);
router.put('/:id', upload.single('image'), galleryController.updateGalleryItem);
router.delete('/:id', galleryController.deleteGalleryItem);
router.patch('/:id/toggle-status', galleryController.toggleGalleryStatus);

module.exports = router;
