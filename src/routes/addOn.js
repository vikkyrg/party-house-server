const express = require('express');
const addOnController = require('../controllers/addOnController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', addOnController.getAddOns);
router.get('/:id', addOnController.getAddOn);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/', addOnController.createAddOn);
router.put('/:id', addOnController.updateAddOn);
router.delete('/:id', addOnController.deleteAddOn);

module.exports = router;
