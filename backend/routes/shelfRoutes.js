const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/shelfController');
const { authenticate } = require('../middleware/auth');
const { resolveStore } = require('../middleware/store');
const { requireFields } = require('../middleware/errorHandler');

router.use(authenticate, resolveStore);
router.get('/', ctrl.listShelfZones);
router.post('/', requireFields('zone_id', 'baseline_profile'), ctrl.createShelfZone);
router.post('/:id/check', requireFields('filled_ratio'), ctrl.checkShelfZone);

module.exports = router;
