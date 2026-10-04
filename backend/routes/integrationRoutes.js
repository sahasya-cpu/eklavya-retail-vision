const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/integrationController');
const { authenticate } = require('../middleware/auth');
const { resolveStore } = require('../middleware/store');
const { requireFields } = require('../middleware/errorHandler');

router.use(authenticate, resolveStore);
router.post('/pos-transaction', requireFields('amount'), ctrl.recordTransaction);

module.exports = router;
