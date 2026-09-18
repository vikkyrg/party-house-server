const express = require('express');
const {
  getStories,
  addStory,
  updateStory,
  deleteStory,
} = require('../controllers/storyController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

router
  .route('/')
  .get(getStories)
  .post(protect, authorize('admin'), upload.single('image'), addStory);

router
  .route('/:id')
  .put(protect, authorize('admin'), upload.single('image'), updateStory)
  .delete(protect, authorize('admin'), deleteStory);

module.exports = router;
