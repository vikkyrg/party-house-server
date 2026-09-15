const express = require('express');
const bannerController = require('../controllers/bannerController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

router.get('/', bannerController.getBanners);
router.get('/:id', bannerController.getBanner);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/', uploadSingle('image'), bannerController.createBanner);
router.put('/:id', uploadSingle('image'), bannerController.updateBanner);
router.delete('/:id', bannerController.deleteBanner);
router.patch('/:id/toggle-status', bannerController.toggleBannerStatus);

module.exports = router;
