const express = require('express');
const roomController = require('../controllers/roomController');
const { protect, restrictTo } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { uploadRoomMediaFiles } = require('../middleware/upload');
const { createRoomSchema, updateRoomSchema } = require('../validators/roomValidator');

const router = express.Router();

// Public routes
router.get('/theater/:theaterId', roomController.getRooms);
router.get('/', roomController.getAllRooms);
router.get('/:roomId/availability', roomController.getAvailability);
router.get('/media/:mediaId', roomController.streamRoomMedia);
router.get('/:roomId/media/:mediaId', roomController.streamRoomMedia);
router.get('/:roomId/media', roomController.getRoomMediaList);
router.get('/:id', roomController.getRoom);

// Protected routes (Admin / Super-Admin only)
router.use(protect, restrictTo('admin', 'super-admin'));

router.put('/reorder', roomController.reorderRooms);
router.post('/theater/:theaterId', uploadRoomMediaFiles, validateRequest(createRoomSchema), roomController.createRoom);
router.post('/', uploadRoomMediaFiles, validateRequest(createRoomSchema), roomController.createRoom);
router.put('/:id', uploadRoomMediaFiles, validateRequest(updateRoomSchema), roomController.updateRoom);
router.delete('/:id', roomController.deleteRoom);

// Dedicated Room Media routes
router.post('/:roomId/media', uploadRoomMediaFiles, roomController.uploadRoomMedia);
router.put('/:roomId/media/reorder', roomController.reorderRoomMedia);
router.delete('/:roomId/media/:mediaId', roomController.deleteRoomMedia);

// Room slot routes
router.post('/:id/slots', roomController.createSlot);
router.put('/:id/slots/:slotId', roomController.updateSlot);
router.delete('/:id/slots/:slotId', roomController.deleteSlot);

module.exports = router;
