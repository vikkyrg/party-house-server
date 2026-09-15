const express = require('express');
const testimonialController = require('../controllers/testimonialController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', testimonialController.getTestimonials);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/', testimonialController.createTestimonial);
router.put('/:id', testimonialController.updateTestimonial);
router.delete('/:id', testimonialController.deleteTestimonial);

module.exports = router;
