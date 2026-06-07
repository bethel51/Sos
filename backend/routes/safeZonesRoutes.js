const express = require('express');
const router = express.Router();
const safeZonesController = require('../controllers/safeZonesController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', safeZonesController.getZones);
router.post('/', safeZonesController.addZone);
router.delete('/:id', safeZonesController.deleteZone);

module.exports = router;
