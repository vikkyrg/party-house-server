const express = require('express');
const cakeController = require('../controllers/cakeController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

// Public routes
router.get('/', cakeController.getCakes);
router.get('/:id', cakeController.getCake);

// Protected admin routes
router.use(protect);
router.use(restrictTo('admin', 'super-admin'));

router.post('/', uploadSingle('image'), cakeController.createCake);
router.put('/:id', uploadSingle('image'), cakeController.updateCake);
router.delete('/:id', cakeController.deleteCake);

module.exports = router;
