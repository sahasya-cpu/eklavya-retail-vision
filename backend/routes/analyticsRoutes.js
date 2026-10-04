const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');
const { resolveStore } = require('../middleware/store');
const { requireFields } = require('../middleware/errorHandler');

router.use(authenticate, resolveStore);
router.get('/summary', ctrl.getSummary);
router.get('/reports', ctrl.getReports);
router.post('/footfall', requireFields('events'), ctrl.recordFootfall);
router.post('/dwell', requireFields('zone', 'duration_seconds'), ctrl.recordDwell);
router.post('/queue', requireFields('queue_length'), ctrl.recordQueueSample);
router.post('/heatmap', requireFields('cells'), ctrl.recordHeatmapHits);

module.exports = router;
