const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, sosController.getHistory);
router.post('/', authMiddleware, sosController.createMockHistoryItem);
router.delete('/:id', authMiddleware, sosController.deleteHistoryItem);

module.exports = router;
