const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/zoneController');
const { authenticate } = require('../middleware/auth');
const { resolveStore } = require('../middleware/store');
const { requireFields } = require('../middleware/errorHandler');

router.use(authenticate, resolveStore);
router.get('/', ctrl.listZones);
router.post('/', requireFields('name', 'zone_type', 'geometry'), ctrl.createZone);
router.delete('/:id', ctrl.deleteZone);

module.exports = router;
