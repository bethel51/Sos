import React, { useState, useEffect } from 'react';

export default function AdminPanel({ showToast }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('admin@leadcitysos.com');
  const [password, setPassword] = useState('admin123');
  const [adminToken, setAdminToken] = useState('');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ totalUsers: 0, activeEmergencies: 0, totalHistory: 0 });

  const handleLogin = (e) => {
    e.preventDefault();
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Admin credentials invalid.');
      })
      .then(data => {
        setAdminToken(data.token);
        setAuthenticated(true);
        showToast('Admin Authenticated', 'Control room interface loaded.', 'success');
      })
      .catch(err => showToast('Authentication Failed', err.message, 'error'));
  };

  useEffect(() => {
    if (!authenticated) return;

    // Fetch Stats
    fetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${adminToken}` } })
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error);

    // Fetch Users
    fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${adminToken}` } })
      .then(res => res.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [authenticated, adminToken]);

  const handleToggleSuspend = (userId, currentStatus) => {
    const action = currentStatus === 'suspended' ? 'activate' : 'suspend';
    fetch(`/api/admin/users/${userId}/${action}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    })
      .then(res => {
        if (res.ok) {
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: action === 'suspend' ? 'suspended' : 'active' } : u));
          showToast('User Status Updated', `User account successfully ${action === 'suspend' ? 'suspended' : 'activated'}.`, 'success');
        }
      })
      .catch(err => showToast('Action Failed', err.message, 'error'));
  };

  if (!authenticated) {
    return (
      <div style={{ maxWidth: '400px', margin: '60px auto' }} className="glass-card">
        <h2 style={{ marginBottom: '12px' }}>Command Control Login</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>Administrative and monitoring console. Authorization required.</p>
        
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Admin Email</label>
            <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary">Authenticate Console</button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '28px', marginBottom: '24px' }}>Command & Control Monitoring Console</h1>

      {/* Admin Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div className="glass-card">
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Guarded Users</div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--accent-cyan)' }}>{stats.totalUsers}</div>
        </div>
        <div className="glass-card">
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Active Distress Calls</div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--primary-red)' }}>{stats.activeEmergencies}</div>
        </div>
        <div className="glass-card">
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Historical Incidents</div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.totalHistory}</div>
        </div>
      </div>

      {/* Managed Users List */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: '18px' }}>Guarded User Accounts</h3>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 'bold' }}>
              <th style={{ padding: '16px 24px' }}>Name</th>
              <th style={{ padding: '16px 24px' }}>Email</th>
              <th style={{ padding: '16px 24px' }}>Phone</th>
              <th style={{ padding: '16px 24px' }}>Account Status</th>
              <th style={{ padding: '16px 24px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id || u._id} style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '14px' }}>
                <td style={{ padding: '16px 24px', fontWeight: '600' }}>{u.name}</td>
                <td style={{ padding: '16px 24px' }}>{u.email}</td>
                <td style={{ padding: '16px 24px' }}>{u.phone}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span className={`badge ${u.status === 'suspended' ? 'badge-live' : 'badge-safe'}`}>
                    {u.status || 'active'}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <button 
                    onClick={() => handleToggleSuspend(u.id, u.status)} 
                    style={{ background: 'none', border: 'none', color: u.status === 'suspended' ? 'var(--color-green)' : 'var(--primary-red)', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {u.status === 'suspended' ? 'Activate Account' : 'Suspend Account'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
