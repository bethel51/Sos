const { dbQuery } = require('../config/db');

const contactsController = {
  // Get contacts
  async getContacts(req, res) {
    try {
      const list = await dbQuery.all('SELECT * FROM contacts WHERE user_id = ?', [req.userId]);
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
      const userContacts = await dbQuery.all('SELECT id FROM contacts WHERE user_id = ?', [req.userId]);
      if (userContacts.length >= 10) {
        return res.status(400).json({ error: 'Maximum of 10 emergency contacts reached.' });
      }

      const contactId = 'contact_' + Date.now();
      await dbQuery.run(
        `INSERT INTO contacts (id, user_id, name, phone, email, relationship) VALUES (?, ?, ?, ?, ?, ?)`,
        [contactId, req.userId, name, phone, email, relationship]
      );

      res.status(201).json({ id: contactId, name, phone, email, relationship });
    } catch (err) {
      console.error('Add contact error:', err);
      res.status(500).json({ error: 'Internal server error adding contact.' });
    }
  },

  // Delete contact
  async deleteContact(req, res) {
    const contactId = req.params.id;
    try {
      const userContacts = await dbQuery.all('SELECT id FROM contacts WHERE user_id = ?', [req.userId]);
      if (userContacts.length <= 1) {
        return res.status(400).json({ error: 'Minimum of 1 emergency contact is required.' });
      }

      const contact = await dbQuery.get('SELECT id FROM contacts WHERE id = ? AND user_id = ?', [contactId, req.userId]);
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found.' });
      }

      await dbQuery.run('DELETE FROM contacts WHERE id = ?', [contactId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Delete contact error:', err);
      res.status(500).json({ error: 'Internal server error deleting contact.' });
    }
  }
};

module.exports = contactsController;
