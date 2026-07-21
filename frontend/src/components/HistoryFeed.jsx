import React from 'react';

export default function HistoryFeed({ historyLogs }) {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Incident History & Security Audit Logs</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Audit trail of previously triggered emergencies, safety check-ins, and resolved alarms.</p>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {historyLogs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>📖</span>
            <h3>No Security Logs Found</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Your safety history and security audit logs will appear here.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 'bold' }}>
                <th style={{ padding: '16px 24px' }}>Timestamp</th>
                <th style={{ padding: '16px 24px' }}>Alert Type</th>
                <th style={{ padding: '16px 24px' }}>Duration</th>
                <th style={{ padding: '16px 24px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {historyLogs.map(log => (
                <tr key={log.id || log._id} style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '14px', transition: 'var(--transition-fast)' }} className="table-row-hover">
                  <td style={{ padding: '16px 24px' }}>{log.startTime || log.date || 'N/A'}</td>
                  <td style={{ padding: '16px 24px', fontWeight: '600' }}>{log.type || 'Unspecified Threat'}</td>
                  <td style={{ padding: '16px 24px' }}>{log.duration || 'N/A'}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span className="badge badge-safe" style={{ background: 'rgba(0, 230, 118, 0.1)', color: 'var(--color-green)' }}>
                      RESOLVED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
