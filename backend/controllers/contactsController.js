const Contact = require('../models/contact');

const contactsController = {
  // Get contacts
  async getContacts(req, res) {
    try {
      const list = await Contact.find({ userId: req.userId });
      res.json(list);
    } catch (err) {
      console.error('Get contacts error:', err);
      res.status(500).json({ error: 'Internal server error fetching contacts.' });
    }
  },

  // Add contact
  async addContact(req, res) {
    const { name, phone, email, relationship } = req.body;
    if (!name || !phone || !email || !relationship) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
      const userContactsCount = await Contact.countDocuments({ userId: req.userId });
      if (userContactsCount >= 10) {
        return res.status(400).json({ error: 'Maximum of 10 emergency contacts reached.' });
      }

      const contactId = 'contact_' + Date.now();
      const newContact = await Contact.create({
        _id: contactId,
        userId: req.userId,
        name,
        phone,
        email,
        relationship
      });

      res.status(201).json(newContact);
    } catch (err) {
      console.error('Add contact error:', err);
      res.status(500).json({ error: 'Internal server error adding contact.' });
    }
  },

  // Delete contact
  async deleteContact(req, res) {
    const contactId = req.params.id;
    try {
      const userContactsCount = await Contact.countDocuments({ userId: req.userId });
      if (userContactsCount <= 1) {
        return res.status(400).json({ error: 'Minimum of 1 emergency contact is required.' });
      }

      const contact = await Contact.findOne({ _id: contactId, userId: req.userId });
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found.' });
      }

      await Contact.deleteOne({ _id: contactId });
      res.json({ success: true });
    } catch (err) {
      console.error('Delete contact error:', err);
      res.status(500).json({ error: 'Internal server error deleting contact.' });
    }
  }
};

module.exports = contactsController;
