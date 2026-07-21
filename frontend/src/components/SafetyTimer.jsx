import React from 'react';

export default function SafetyTimer({ 
  safetyTimerActive, 
  safetyTimerSecondsLeft, 
  safetyTimerDuration, 
  setSafetyTimerDuration, 
  onStartTimer, 
  onCancelTimer 
}) {
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Safety Countdown Check-in</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px' }}>
          Set a safety countdown timer. If you do not check in before the timer expires, an automated SOS distress signal will be dispatched to your emergency contacts.
        </p>

        {/* Circular Countdown Wheel Display */}
        <div style={{ width: '220px', height: '220px', borderRadius: '50%', border: '6px solid var(--accent-cyan)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px auto', boxShadow: 'var(--shadow-glow-cyan)', background: 'var(--bg-surface-elevated)' }}>
          <div style={{ fontSize: '48px', fontWeight: '900', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
            {safetyTimerActive ? formatTime(safetyTimerSecondsLeft) : formatTime(safetyTimerDuration)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {safetyTimerActive ? 'COUNTDOWN RUNNING' : 'TIMER READY'}
          </div>
        </div>

        {!safetyTimerActive ? (
          <div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '24px' }}>
              {[60, 120, 300, 600].map(dur => (
                <button
                  key={dur}
                  className={`nav-link ${safetyTimerDuration === dur ? 'active' : ''}`}
                  onClick={() => setSafetyTimerDuration(dur)}
                  style={{ border: '1px solid var(--border-subtle)', padding: '8px 16px' }}
                >
                  {dur / 60} Min
                </button>
              ))}
            </div>

            <button className="btn-primary" onClick={onStartTimer} style={{ width: 'auto', padding: '14px 40px', fontSize: '18px' }}>
              ▶ Start Safety Timer
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={onCancelTimer} style={{ background: 'linear-gradient(135deg, var(--primary-red), #B71C1C)', width: 'auto', padding: '14px 40px', fontSize: '18px' }}>
            ✕ Check In & Disarm Timer
          </button>
        )}
      </div>
    </div>
  );
}
