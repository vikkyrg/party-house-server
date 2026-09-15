const express = require('express');
const reviewController = require('../controllers/reviewController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', reviewController.getReviews);
router.get('/:id', reviewController.getReview);

router.use(protect);
router.post('/', reviewController.createReview);
router.put('/:id', reviewController.updateReview);
router.delete('/:id', reviewController.deleteReview);
router.put('/:id/approve', restrictTo('admin', 'super-admin'), reviewController.approveReview);
router.put('/:id/respond', restrictTo('admin', 'super-admin'), reviewController.respondToReview);

module.exports = router;
