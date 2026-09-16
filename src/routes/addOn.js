const express = require('express');
const addOnController = require('../controllers/addOnController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', addOnController.getAddOns);
router.get('/:id', addOnController.getAddOn);

const { uploadSingle } = require('../middleware/upload');

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/', uploadSingle('image'), addOnController.createAddOn);
router.put('/:id', uploadSingle('image'), addOnController.updateAddOn);
router.delete('/:id', addOnController.deleteAddOn);

module.exports = router;
