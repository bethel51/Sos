import React from 'react';

export default function Navbar({ 
  currentUser, 
  screenState, 
  setScreenState, 
  onOpenAuth, 
  onLogout, 
  activeIncident, 
  onTriggerSOS 
}) {
  return (
    <header className="web-navbar">
      <div className="nav-brand" onClick={() => setScreenState('home')}>
        <div className="brand-icon-shield">🛡️</div>
        <span className="brand-title">SILENT SOS</span>
      </div>

      <nav className="nav-menu">
        <button 
          className={`nav-link ${screenState === 'home' ? 'active' : ''}`}
          onClick={() => setScreenState('home')}
        >
          Dashboard
        </button>
        <button 
          className={`nav-link ${screenState === 'contacts' ? 'active' : ''}`}
          onClick={() => setScreenState('contacts')}
        >
          Responders & Contacts
        </button>
        <button 
          className={`nav-link ${screenState === 'zones' ? 'active' : ''}`}
          onClick={() => setScreenState('zones')}
        >
          Safe Zones
        </button>
        <button 
          className={`nav-link ${screenState === 'history' ? 'active' : ''}`}
          onClick={() => setScreenState('history')}
        >
          Incident History
        </button>
        <button 
          className={`nav-link ${screenState === 'settings' ? 'active' : ''}`}
          onClick={() => setScreenState('settings')}
        >
          Settings
        </button>
      </nav>

      <div className="nav-actions">
        {activeIncident ? (
          <span className="badge badge-live">🔴 SOS ACTIVE</span>
        ) : (
          <button className="btn-sos-quick" onClick={() => onTriggerSOS('Quick Header Alert')}>
            🚨 QUICK SOS
          </button>
        )}

        {currentUser ? (
          <div className="user-profile-badge" onClick={() => setScreenState('medical-profile')}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>{currentUser.name}</span>
            <button 
              onClick={(e) => { e.stopPropagation(); onLogout(); }} 
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', marginLeft: '4px' }}
              title="Sign Out"
            >
              🚪
            </button>
          </div>
        ) : (
          <button className="nav-link active" onClick={onOpenAuth}>
            Sign In / Register
          </button>
        )}
      </div>
    </header>
  );
}
