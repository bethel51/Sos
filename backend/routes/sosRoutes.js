const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');
const authMiddleware = require('../middleware/auth');

// Publicly check if there is any active SOS (broad lookup for dashboard/admin metrics)
router.get('/active', sosController.checkActiveIncident);

// Protected SOS routes
router.post('/active', authMiddleware, sosController.triggerSOS);
router.post('/location', authMiddleware, sosController.updateLocation);
router.post('/evidence', authMiddleware, sosController.uploadEvidence);
router.post('/deactivate', authMiddleware, sosController.deactivateSOS);

module.exports = router;
