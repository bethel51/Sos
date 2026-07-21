import React, { useState } from 'react';

export default function Dashboard({ 
  currentUser, 
  activeIncident, 
  onTriggerSOS, 
  onDeactivateSOS, 
  setScreenState,
  simLat,
  simLng,
  batteryLevel
}) {
  const [pinInput, setPinInput] = useState('');
  const [showDisarmModal, setShowDisarmModal] = useState(false);

  const handleDisarm = (e) => {
    e.preventDefault();
    if (currentUser && pinInput === currentUser.pin) {
      onDeactivateSOS();
      setShowDisarmModal(false);
      setPinInput('');
    } else {
      alert('Incorrect security PIN');
    }
  };

  return (
    <div className="dashboard-grid">
      {/* Main SOS Control Hero Panel */}
      <div className="glass-card sos-hero-card">
        {activeIncident ? (
          <span className="badge badge-live" style={{ marginBottom: '16px' }}>🚨 DISTRESS SIGNAL STREAMING LIVE</span>
        ) : (
          <span className="badge badge-safe" style={{ marginBottom: '16px' }}>🛡️ SYSTEM ARMED & MONITORED</span>
        )}

        <h1 style={{ fontSize: '36px', marginBottom: '12px' }}>
          {activeIncident ? 'EMERGENCY DISTRESS ACTIVE' : 'Personal Emergency Response'}
        </h1>
        
        <p style={{ color: 'var(--text-secondary)', maxWidth: '540px', fontSize: '15px' }}>
          {activeIncident 
            ? 'Live GPS telemetry, continuous audio recording, and automated evidence capture are actively dispatching to your emergency contacts.'
            : 'Tap the emergency trigger button below to immediately broadcast your real-time coordinates, live security stream, and distress SMS to your responders.'}
        </p>

        {/* SOS Emergency Trigger Button */}
        <div className="sos-trigger-outer">
          {!activeIncident && <div className="sos-trigger-pulse"></div>}
          <button 
            className={`sos-trigger-btn ${activeIncident ? 'active-sos' : ''}`}
            onClick={() => {
              if (activeIncident) {
                setShowDisarmModal(true);
              } else {
                onTriggerSOS('Manual Distress Trigger');
              }
            }}
          >
            <span>{activeIncident ? 'DISARM' : 'SOS'}</span>
            <span style={{ fontSize: '10px', letterSpacing: '1px', opacity: 0.8 }}>
              {activeIncident ? 'ENTER PIN' : 'PRESS TO DISTRESS'}
            </span>
          </button>
        </div>

        {/* Telemetry Status Bar */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '16px', background: 'var(--bg-surface-elevated)', padding: '12px 24px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            📡 GPS: <strong style={{ color: 'var(--text-primary)' }}>{simLat.toFixed(4)}, {simLng.toFixed(4)}</strong>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            🔋 Battery: <strong style={{ color: 'var(--text-primary)' }}>{batteryLevel}%</strong>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            ⚡ Response: <strong style={{ color: 'var(--color-green)' }}>&lt; 2s Dispatch</strong>
          </div>
        </div>
      </div>

      {/* Side Quick Actions & Info Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Safety Timer Card */}
        <div className="glass-card" onClick={() => setScreenState('timers')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '24px' }}>⏱️</span>
            <span className="badge badge-safe">CONFIGURABLE</span>
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Safety Check-in Timer</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Set a countdown before walking home or entering an unfamiliar environment.</p>
        </div>

        {/* Emergency Responders Card */}
        <div className="glass-card" onClick={() => setScreenState('contacts')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '24px' }}>👥</span>
            <span className="badge badge-safe">ACTIVE DISPATCH</span>
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Emergency Responders</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Manage SMS/Email emergency contacts who receive automatic distress alerts.</p>
        </div>

        {/* Safe Zones Geofencing Card */}
        <div className="glass-card" onClick={() => setScreenState('zones')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '24px' }}>📍</span>
            <span className="badge badge-safe">GEOFENCE PROTECTED</span>
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '6px' }}>Campus Safe Zones</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Monitor designated campus safe zones and automated route deviation alerts.</p>
        </div>
      </div>

      {/* Disarm PIN Modal */}
      {showDisarmModal && (
        <div className="modal-overlay" onClick={() => setShowDisarmModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '12px', fontSize: '22px' }}>Disarm SOS Distress Alert</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Enter your 4-digit security PIN to deactivate distress mode and disarm emergency responders.</p>

            <form onSubmit={handleDisarm}>
              <div className="form-group">
                <input 
                  type="password" 
                  maxLength="4" 
                  className="form-input" 
                  style={{ fontSize: '24px', letterSpacing: '8px', textAlign: 'center' }} 
                  value={pinInput} 
                  onChange={e => setPinInput(e.target.value)} 
                  placeholder="••••" 
                  autoFocus 
                  required 
                />
              </div>
              <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--color-green), #1b5e20)' }}>Confirm Disarm PIN</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
