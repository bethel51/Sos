const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/profile', authMiddleware, authController.getProfile);
router.post('/profile/update', authMiddleware, authController.updateProfile);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
