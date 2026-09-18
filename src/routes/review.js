const express = require('express');
const multer = require('multer');
const reviewController = require('../controllers/reviewController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public endpoints
router.get('/public', reviewController.getPublicReviews);
// NOTE: getReviews is technically public, but it's used for fetching approved reviews. We now use getPublicReviews for the website.

// Keep existing public endpoints
router.get('/:id', reviewController.getReview);

router.use(protect);

// Customer endpoints
router.post('/', reviewController.createReview);
router.put('/:id', reviewController.updateReview);
router.delete('/:id', reviewController.deleteReview);

// Admin endpoints
router.get('/admin/list', restrictTo('admin', 'super-admin'), reviewController.getAdminReviews);
router.post('/admin/create', restrictTo('admin', 'super-admin'), upload.single('media'), reviewController.createAdminReview);
router.put('/admin/:id', restrictTo('admin', 'super-admin'), upload.single('media'), reviewController.updateAdminReview);

router.put('/:id/approve', restrictTo('admin', 'super-admin'), reviewController.approveReview);
router.put('/:id/respond', restrictTo('admin', 'super-admin'), reviewController.respondToReview);

module.exports = router;
