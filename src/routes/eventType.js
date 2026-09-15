const express = require('express');
const eventTypeController = require('../controllers/eventTypeController');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const router = express.Router();

router.get('/', eventTypeController.getEventTypes);
router.get('/:id', eventTypeController.getEventType);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/', uploadSingle('image'), eventTypeController.createEventType);
router.put('/:id', uploadSingle('image'), eventTypeController.updateEventType);
router.delete('/:id', eventTypeController.deleteEventType);

module.exports = router;
