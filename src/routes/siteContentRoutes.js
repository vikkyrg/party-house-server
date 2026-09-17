const express = require('express');
const {
  getAllSiteContent,
  getSiteContentByType,
  upsertSiteContent
} = require('../controllers/siteContentController');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router
  .route('/')
  .get(getAllSiteContent);

router
  .route('/:type')
  .get(getSiteContentByType)
  .put(protect, authorize('admin', 'superadmin'), upsertSiteContent);

module.exports = router;
