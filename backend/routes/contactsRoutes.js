const express = require('express');
const router = express.Router();
const contactsController = require('../controllers/contactsController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', contactsController.getContacts);
router.post('/', contactsController.addContact);
router.delete('/:id', contactsController.deleteContact);

module.exports = router;
