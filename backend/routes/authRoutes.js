const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { requireFields } = require('../middleware/errorHandler');

router.post('/register', requireFields('name', 'email', 'password'), ctrl.register);
router.post('/login', requireFields('email', 'password'), ctrl.login);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
