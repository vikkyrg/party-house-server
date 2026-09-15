const express = require('express');
const locationController = require('../controllers/locationController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

router.get('/', locationController.getLocations);
router.get('/:id', locationController.getLocation);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/', uploadSingle('image'), locationController.createLocation);
router.put('/:id', uploadSingle('image'), locationController.updateLocation);
router.delete('/:id', locationController.deleteLocation);

module.exports = router;
