/* ==========================================================================
   Silent SOS - Emergency Contacts Manager (REST Backend Integration)
   ========================================================================== */

export class ContactsManager {
  constructor(userId) {
    this.userId = userId;
    this.contacts = [];
  }

  // Set auth headers for requests using token stored by AuthManager
  getHeaders() {
    const token = localStorage.getItem('silentsos_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  async loadContacts() {
    try {
      const response = await fetch('/api/contacts', {
        headers: this.getHeaders()
      });
      if (response.ok) {
        this.contacts = await response.json();
        localStorage.setItem(`silentsos_contacts_${this.userId}`, JSON.stringify(this.contacts));
      } else {
        throw new Error('Failed to load contacts');
      }
    } catch (error) {
      console.error('Offline/cached contacts mode:', error);
      const saved = localStorage.getItem(`silentsos_contacts_${this.userId}`);
      if (saved) {
        this.contacts = JSON.parse(saved);
      }
    }
    return this.contacts;
  }

  getContacts() {
    return this.contacts;
  }

  async addContact(contactData) {
    if (this.contacts.length >= 10) {
      throw new Error('Maximum of 10 emergency contacts reached.');
    }

    if (!contactData.name || !contactData.phone || !contactData.email || !contactData.relationship) {
      throw new Error('Please fill in all required contact details.');
    }

    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(contactData)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add contact');
    }

    this.contacts.push(data);
    localStorage.setItem(`silentsos_contacts_${this.userId}`, JSON.stringify(this.contacts));
    return data;
  }

  async deleteContact(contactId) {
    if (this.contacts.length <= 1) {
      throw new Error('Minimum of 1 emergency contact is required. Add a new contact before deleting this one.');
    }

    const response = await fetch(`/api/contacts/${contactId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete contact');
    }

    this.contacts = this.contacts.filter(c => c.id !== contactId);
    localStorage.setItem(`silentsos_contacts_${this.userId}`, JSON.stringify(this.contacts));
  }
}
