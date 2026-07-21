import React, { useState, useEffect } from 'react';

export default function SafeZonesMap({ safeZones, simLat, simLng, onAddZone, onDeleteZone }) {
  const [name, setName] = useState('');
  const [radius, setRadius] = useState(200);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.L) {
      const container = document.getElementById('web-safezones-map-container');
      if (container) {
        if (!window._webMapInstance) {
          const map = window.L.map('web-safezones-map-container').setView([simLat, simLng], 15);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);
          window._webMapInstance = map;
        } else {
          window._webMapInstance.setView([simLat, simLng], 15);
        }

        // Render current location marker
        if (window._userLocationMarker) {
          window._userLocationMarker.setLatLng([simLat, simLng]);
        } else {
          window._userLocationMarker = window.L.circleMarker([simLat, simLng], {
            radius: 8,
            fillColor: '#00F2FE',
            color: '#FFFFFF',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
          }).addTo(window._webMapInstance).bindPopup('Live Coordinates').openPopup();
        }

        // Clear previous zone circles to prevent duplicates
        if (window._zoneCircles) {
          window._zoneCircles.forEach(c => c.remove());
        }
        window._zoneCircles = [];

        // Render safe zone circles
        if (Array.isArray(safeZones)) {
          safeZones.forEach(zone => {
            const circle = window.L.circle([zone.lat, zone.lng], {
              color: '#00E676',
              fillColor: '#00E676',
              fillOpacity: 0.15,
              radius: zone.radius || 200
            }).addTo(window._webMapInstance).bindPopup(`Safe Zone: ${zone.name}`);
            window._zoneCircles.push(circle);
          });
        }
      }
    }
  }, [simLat, simLng, safeZones]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name) return;
    onAddZone({ name, lat: simLat, lng: simLng, radius: Number(radius) });
    setName('');
    setRadius(200);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Campus Safe Zones & Geofencing</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Geofenced areas monitored for automatic safety check-ins and route deviation alerts.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
        {/* Interactive Map Container */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', height: '550px', position: 'relative' }}>
          <div id="web-safezones-map-container" style={{ width: '100%', height: '100%', background: '#090b14' }}></div>
        </div>

        {/* Safe Zones List Panel */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '550px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '18px' }}>Monitored Safe Zones</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
            {safeZones.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No custom safe zones added yet. Default campus perimeter active.</p>
            ) : (
              safeZones.map(zone => (
                <div key={zone.id || zone._id} style={{ background: 'var(--bg-surface-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{zone.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Radius: {zone.radius || 200}m</div>
                  </div>
                  <button 
                    onClick={() => onDeleteZone(zone.id || zone._id)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-red)', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add Safe Zone Form */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
            <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Create Safe Zone at Current Location</h4>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Zone Name (e.g. Science Library)" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '70px' }}>Radius (m):</span>
                <input 
                  type="number" 
                  className="form-input" 
                  min="50" 
                  max="1000" 
                  value={radius} 
                  onChange={e => setRadius(e.target.value)} 
                  required 
                />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '10px' }}>Add Safe Zone</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
