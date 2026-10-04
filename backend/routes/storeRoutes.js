const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/storeController');
const { authenticate } = require('../middleware/auth');
const { requireFields } = require('../middleware/errorHandler');

router.use(authenticate);
router.get('/', ctrl.listStores);
router.post('/', requireFields('name'), ctrl.createStore);

module.exports = router;
