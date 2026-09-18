const express = require('express');
const {
  getServices,
  addService,
  updateService,
  deleteService,
} = require('../controllers/serviceController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router
  .route('/')
  .get(getServices)
  .post(protect, authorize('admin'), upload.single('image'), addService);

router
  .route('/:id')
  .put(protect, authorize('admin'), upload.single('image'), updateService)
  .delete(protect, authorize('admin'), deleteService);

module.exports = router;
