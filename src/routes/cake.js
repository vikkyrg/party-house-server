const express = require('express');
const cakeController = require('../controllers/cakeController');
const { protect, restrictTo } = require('../controllers/authController');
const { uploadMemory } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Public routes
router.get('/', cakeController.getCakes);
router.get('/:id', cakeController.getCake);

// Protected admin routes
router.use(protect);
router.use(restrictTo('admin', 'super-admin'));

router.post('/', uploadMemory.single('image'), cakeController.createCake);
router.put('/:id', uploadMemory.single('image'), cakeController.updateCake);
router.delete('/:id', cakeController.deleteCake);

module.exports = router;
