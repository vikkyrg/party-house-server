const express = require('express');
const faqController = require('../controllers/faqController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', faqController.getFAQs);
router.get('/:id', faqController.getFAQ);

router.use(protect, restrictTo('admin', 'super-admin'));
router.post('/', faqController.createFAQ);
router.put('/:id', faqController.updateFAQ);
router.delete('/:id', faqController.deleteFAQ);

module.exports = router;
