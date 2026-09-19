const express = require('express');
const roomController = require('../controllers/roomController');
const { protect, restrictTo } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { uploadMultiple } = require('../middleware/upload');
const { createRoomSchema, updateRoomSchema } = require('../validators/roomValidator');

const router = express.Router();

router.get('/theater/:theaterId', roomController.getRooms);
router.get('/:roomId/availability', roomController.getAvailability);
router.get('/:id', roomController.getRoom);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/theater/:theaterId', uploadMultiple('images', 10), validateRequest(createRoomSchema), roomController.createRoom);
router.put('/:id', uploadMultiple('images', 10), validateRequest(updateRoomSchema), roomController.updateRoom);
router.delete('/:id', roomController.deleteRoom);
router.post('/:id/slots', roomController.createSlot);
router.put('/:id/slots/:slotId', roomController.updateSlot);
router.delete('/:id/slots/:slotId', roomController.deleteSlot);

module.exports = router;
