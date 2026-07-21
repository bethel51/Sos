import React, { useState } from 'react';

export default function ContactsPanel({ contacts, onAddContact, onDeleteContact, token }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('Parent / Guardian');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !phone || !email) return;

    onAddContact({ name, phone, email, relationship });
    setShowAddModal(false);
    setName('');
    setPhone('');
    setEmail('');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Emergency Responders & Contacts</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>People who will receive immediate SMS, Email, and live telemetry when you trigger SOS.</p>
        </div>

        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => setShowAddModal(true)}>
          + Add Emergency Contact
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {contacts.length === 0 ? (
          <div className="glass-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>👥</span>
            <h3>No Emergency Contacts Configured</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '20px' }}>Add at least one emergency contact to enable automatic distress dispatching.</p>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => setShowAddModal(true)}>+ Add First Contact</button>
          </div>
        ) : (
          contacts.map(c => (
            <div key={c.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span className="badge badge-safe">{c.relationship || 'Emergency Contact'}</span>
                  <button 
                    onClick={() => onDeleteContact(c.id)} 
                    style={{ background: 'none', border: 'none', color: 'var(--primary-red)', cursor: 'pointer', fontSize: '14px' }}
                    title="Remove Contact"
                  >
                    🗑️ Delete
                  </button>
                </div>

                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{c.name}</h3>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>📞 {c.phone}</div>
                  <div>✉️ {c.email}</div>
                </div>
              </div>

              <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--color-green)', fontWeight: '600' }}>
                ✓ Ready for Instant Emergency Dispatch
              </div>
            </div>
          ))
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '16px', fontSize: '22px' }}>Add Emergency Contact</h2>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Contact Name</label>
                <input type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah Smith" required />
              </div>

              <div className="form-group">
                <label>Phone Number (SMS Dispatch)</label>
                <input type="tel" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 123 4567" required />
              </div>

              <div className="form-group">
                <label>Email Address (Alert Email Dispatch)</label>
                <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="sarah@example.com" required />
              </div>

              <div className="form-group">
                <label>Relationship</label>
                <select className="form-input" value={relationship} onChange={e => setRelationship(e.target.value)}>
                  <option>Parent / Guardian</option>
                  <option>Spouse / Partner</option>
                  <option>Campus Security</option>
                  <option>Friend / Colleague</option>
                  <option>Relative</option>
                </select>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '12px' }}>Save Emergency Contact</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
