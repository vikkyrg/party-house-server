const express = require('express');
const addOnController = require('../controllers/addOnController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', addOnController.getAddOns);
router.get('/:id', addOnController.getAddOn);

const { uploadSingle, uploadMultiple } = require('../middleware/upload');

router.use(protect, restrictTo('admin', 'super-admin'));
router.put('/reorder', addOnController.reorderAddOns);
router.post('/', uploadMultiple('images', 3), addOnController.createAddOn);
router.put('/:id', uploadMultiple('images', 3), addOnController.updateAddOn);
router.delete('/:id', addOnController.deleteAddOn);

module.exports = router;
