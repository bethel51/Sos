const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminMiddleware = require('../middleware/admin');

// Admin Auth
router.post('/login', adminController.login);

// Protected Admin Actions
router.use(adminMiddleware);
router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);
router.post('/users/:id/suspend', adminController.toggleSuspend);

module.exports = router;
