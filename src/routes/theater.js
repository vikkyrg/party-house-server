const express = require('express');
const theaterController = require('../controllers/theaterController');
const roomController = require('../controllers/roomController');
const { protect, restrictTo } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { uploadMultiple } = require('../middleware/upload');
const { createTheaterSchema, updateTheaterSchema } = require('../validators/theaterValidator');
const { createRoomSchema } = require('../validators/roomValidator');

const router = express.Router();

router.get('/', theaterController.getTheaters);
router.get('/:theaterId/rooms', roomController.getRooms);
router.get('/:id', theaterController.getTheater);
router.get('/:id/availability', theaterController.getTheaterAvailability);
router.get('/:id/reviews', theaterController.getTheaterReviews);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post(
  '/',
  uploadMultiple('images', 10),
  validateRequest(createTheaterSchema),
  theaterController.createTheater
);
router.post('/:theaterId/rooms', uploadMultiple('images', 10), validateRequest(createRoomSchema), roomController.createRoom);
router.put(
  '/:id',
  uploadMultiple('images', 10),
  validateRequest(updateTheaterSchema),
  theaterController.updateTheater
);
router.delete('/:id', theaterController.deleteTheater);
router.patch('/:id/toggle-status', theaterController.toggleTheaterStatus);

module.exports = router;
