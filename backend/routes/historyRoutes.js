const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, sosController.getHistory);

module.exports = router;
