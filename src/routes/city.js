const express = require('express');
const cityController = require('../controllers/cityController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

router.get('/', cityController.getCities);
router.get('/:id', cityController.getCity);
router.get('/:id/locations', cityController.getCityLocations);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/', uploadSingle('image'), cityController.createCity);
router.put('/:id', uploadSingle('image'), cityController.updateCity);
router.delete('/:id', cityController.deleteCity);

module.exports = router;
