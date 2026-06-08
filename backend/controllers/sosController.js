const fs = require('fs');
const path = require('path');
const { dbQuery } = require('../config/db');
const { broadcastIncidentUpdate } = require('../config/socket');
const notificationService = require('../services/notificationService');

async function assembleIncident(incidentRow) {
  if (!incidentRow) return null;
  const locations = await dbQuery.all(
    'SELECT lat, lng, timestamp FROM incident_locations WHERE incident_id = ? ORDER BY id ASC',
    [incidentRow.id]
  );
  const photos = await dbQuery.all(
    'SELECT photo_data FROM incident_photos WHERE incident_id = ? ORDER BY id ASC',
    [incidentRow.id]
  );

  const formattedPhotos = photos.map(p => {
    try {
      return JSON.parse(p.photo_data);
    } catch (e) {
      return { src: p.photo_data, source: 'unknown', timestamp: '' };
    }
  });

  const userRow = await dbQuery.get(
    'SELECT email, dob, blood_group, medical_conditions, emergency_notes, home_address FROM users WHERE id = ?',
    [incidentRow.user_id]
  );

  return {
    id: incidentRow.id,
    userId: incidentRow.user_id,
    userName: incidentRow.user_name,
    userPhone: incidentRow.user_phone,
    userEmail: userRow ? userRow.email : '',
    dob: userRow ? userRow.dob : '',
    bloodGroup: userRow ? userRow.blood_group : '',
    medicalConditions: userRow ? userRow.medical_conditions : '',
    emergencyNotes: userRow ? userRow.emergency_notes : '',
    homeAddress: userRow ? userRow.home_address : '',
    startTime: incidentRow.start_time,
    date: incidentRow.date,
    type: incidentRow.type,
    lastLocation: {
      lat: incidentRow.last_location_lat,
      lng: incidentRow.last_location_lng
    },
    locationPath: locations.map(l => ({ lat: l.lat, lng: l.lng, timestamp: l.timestamp })),
    photos: formattedPhotos,
    audioRecordingUrl: incidentRow.audio_recording_url,
    notes: incidentRow.notes,
    endTime: incidentRow.end_time || undefined,
    duration: incidentRow.duration || undefined
  };
}

const sosController = {
  // Check active emergency
  async checkActiveIncident(req, res) {
    try {
      const activeIncidentRow = await dbQuery.get('SELECT * FROM incidents WHERE is_active = 1 LIMIT 1');
      if (!activeIncidentRow) {
        return res.json({ active: false });
      }
      const incident = await assembleIncident(activeIncidentRow);
      res.json({ active: true, incident });
    } catch (err) {
      console.error('Check active incident error:', err);
      res.status(500).json({ error: 'Internal server error checking active SOS status.' });
    }
  },

  // Trigger SOS
  async triggerSOS(req, res) {
    const { type, location } = req.body;
    const dateNow = new Date();
    const incidentId = 'incident_' + Date.now();
    
    const lat = location ? location.lat : 40.7128;
    const lng = location ? location.lng : -74.0060;
    const startTimeText = dateNow.toLocaleTimeString();
    const dateText = dateNow.toISOString().split('T')[0];

    try {
      // Deactivate any existing active incidents for safety first
      await dbQuery.run('UPDATE incidents SET is_active = 0 WHERE user_id = ? AND is_active = 1', [req.userId]);

      // Create new active incident
      await dbQuery.run(
        `INSERT INTO incidents (id, user_id, user_name, user_phone, start_time, date, type, last_location_lat, last_location_lng, is_active, audio_recording_url, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, null, '')`,
        [
          incidentId,
          req.userId,
          req.user.name,
          req.user.phone,
          startTimeText,
          dateText,
          type || 'Unspecified Threat',
          lat,
          lng
        ]
      );

      // Insert initial location path
      await dbQuery.run(
        `INSERT INTO incident_locations (incident_id, lat, lng, timestamp) VALUES (?, ?, ?, ?)`,
        [incidentId, lat, lng, startTimeText]
      );

      const incident = await dbQuery.get('SELECT * FROM incidents WHERE id = ?', [incidentId]);
      const fullIncidentObj = await assembleIncident(incident);

      // WebSockets Broadcast
      broadcastIncidentUpdate(req.userId, 'sos_triggered', fullIncidentObj);

      // Send Alerts to Emergency Contacts
      const contacts = await dbQuery.all('SELECT * FROM contacts WHERE user_id = ?', [req.userId]);
      const locationLink = `https://maps.google.com/?q=${lat},${lng}`;
      const dashboardLink = `${req.headers.origin || 'http://localhost:5173'}/`;

      for (const contact of contacts) {
        // Send email
        notificationService.sendEmail({
          to: contact.email,
          subject: `[EMERGENCY] Silent SOS Alert: ${req.user.name} is in danger!`,
          bodyText: `Hello ${contact.name},\n\n${req.user.name} has triggered a Silent SOS alert (${type}).\nLast known location: ${locationLink}\n\nMonitor live telemetry at the dashboard: ${dashboardLink}`,
          bodyHtml: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ff4d4d; border-radius: 8px;">
              <h2 style="color: #d93838; margin-top: 0;">⚠️ Emergency Silent SOS Triggered</h2>
              <p>Hello <strong>${contact.name}</strong>,</p>
              <p>Your emergency safety contact <strong>${req.user.name}</strong> has triggered an SOS alert.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; width: 120px;">Trigger Type:</td>
                  <td style="padding: 8px 0; color: #d93838; font-weight: bold;">${type || 'Unspecified Threat'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Time:</td>
                  <td style="padding: 8px 0;">${startTimeText} on ${dateText}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold;">Location:</td>
                  <td style="padding: 8px 0;"><a href="${locationLink}" style="color: #0066cc;">View on Google Maps</a></td>
                </tr>
              </table>
              <div style="margin-top: 20px; text-align: center;">
                <a href="${dashboardLink}" style="background-color: #d93838; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                  Open Surveillance Dashboard
                </a>
              </div>
            </div>
          `
        });

        // Send SMS
        notificationService.sendSMS({
          to: contact.phone,
          message: `Silent SOS: ${req.user.name} is in danger (${type || 'Unspecified Threat'}). View live map: ${dashboardLink}`
        });
      }

      res.status(201).json(fullIncidentObj);
    } catch (err) {
      console.error('Trigger SOS error:', err);
      res.status(500).json({ error: 'Internal server error initiating SOS.' });
    }
  },

  // Update location during SOS
  async updateLocation(req, res) {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Coordinates lat and lng are required.' });
    }

    try {
      const activeIncidentRow = await dbQuery.get('SELECT * FROM incidents WHERE user_id = ? AND is_active = 1', [req.userId]);
      if (!activeIncidentRow) {
        return res.status(404).json({ error: 'No active incident found.' });
      }

      const timestamp = new Date().toLocaleTimeString();
      
      // Update last location
      await dbQuery.run(
        'UPDATE incidents SET last_location_lat = ?, last_location_lng = ? WHERE id = ?',
        [lat, lng, activeIncidentRow.id]
      );

      // Add to path
      await dbQuery.run(
        'INSERT INTO incident_locations (incident_id, lat, lng, timestamp) VALUES (?, ?, ?, ?)',
        [activeIncidentRow.id, lat, lng, timestamp]
      );

      const updatedIncident = await dbQuery.get('SELECT * FROM incidents WHERE id = ?', [activeIncidentRow.id]);
      const fullIncidentObj = await assembleIncident(updatedIncident);

      // WebSockets Broadcast
      broadcastIncidentUpdate(req.userId, 'location_update', fullIncidentObj);

      res.json(fullIncidentObj);
    } catch (err) {
      console.error('Update location error:', err);
      res.status(500).json({ error: 'Internal server error updating location path.' });
    }
  },

  // Upload Evidence (Photo base64 saving to file, or audio mock status)
  async uploadEvidence(req, res) {
    const { photo, audio } = req.body;

    try {
      const activeIncidentRow = await dbQuery.get('SELECT * FROM incidents WHERE user_id = ? AND is_active = 1', [req.userId]);
      if (!activeIncidentRow) {
        return res.status(404).json({ error: 'No active incident found.' });
      }

      if (photo) {
        const base64Data = photo.src || photo;
        let fileUrl = '';
        if (base64Data.startsWith('data:')) {
          const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const ext = matches[1].split('/')[1] || 'png';
            const buffer = Buffer.from(matches[2], 'base64');
            
            const filename = `evidence_${activeIncidentRow.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
            const filepath = path.join(__dirname, '..', '..', 'uploads', filename);
            
            fs.writeFileSync(filepath, buffer);
            fileUrl = `/uploads/${filename}`;
          }
        }

        const photoObj = {
          id: photo.id || 'photo_' + Date.now(),
          src: fileUrl || base64Data,
          source: photo.source || 'front',
          timestamp: photo.timestamp || new Date().toLocaleTimeString()
        };

        await dbQuery.run('INSERT INTO incident_photos (incident_id, photo_data) VALUES (?, ?)', [activeIncidentRow.id, JSON.stringify(photoObj)]);
      }
      
      if (audio) {
        let audioUrl = audio;
        if (audio.startsWith('data:')) {
          const matches = audio.match(/^data:([^;]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            let ext = matches[1].split('/')[1] || 'wav';
            ext = ext.split(';')[0];
            const buffer = Buffer.from(matches[2], 'base64');
            const filename = `evidence_audio_${activeIncidentRow.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
            const filepath = path.join(__dirname, '..', '..', 'uploads', filename);
            
            fs.writeFileSync(filepath, buffer);
            audioUrl = `/uploads/${filename}`;
          }
        }
        await dbQuery.run('UPDATE incidents SET audio_recording_url = ? WHERE id = ?', [audioUrl, activeIncidentRow.id]);
      }

      const updatedIncident = await dbQuery.get('SELECT * FROM incidents WHERE id = ?', [activeIncidentRow.id]);
      const fullIncidentObj = await assembleIncident(updatedIncident);

      // WebSockets Broadcast
      broadcastIncidentUpdate(req.userId, 'evidence_update', fullIncidentObj);

      res.json(fullIncidentObj);
    } catch (err) {
      console.error('Upload evidence error:', err);
      res.status(500).json({ error: 'Internal server error saving evidence.' });
    }
  },

  // Deactivate SOS
  async deactivateSOS(req, res) {
    try {
      const activeIncidentRow = await dbQuery.get('SELECT * FROM incidents WHERE user_id = ? AND is_active = 1', [req.userId]);
      if (!activeIncidentRow) {
        return res.status(404).json({ error: 'No active incident found.' });
      }

      const dateNow = new Date();
      const endTimeText = dateNow.toLocaleTimeString();

      const durationText = (() => {
        try {
          const parseTime = (timeStr) => {
            const [h, m, s] = timeStr.split(' ')[0].split(':').map(Number);
            const isPm = timeStr.includes('PM') && h !== 12;
            const isAm = timeStr.includes('AM') && h === 12;
            return (h + (isPm ? 12 : 0) - (isAm ? 12 : 0)) * 3600 + m * 60 + s;
          };
          const diffSecs = Math.abs(parseTime(endTimeText) - parseTime(activeIncidentRow.start_time));
          const mins = Math.floor(diffSecs / 60);
          const secs = diffSecs % 60;
          return `${mins}m ${secs}s`;
        } catch (e) {
          return '1m 20s';
        }
      })();

      await dbQuery.run(
        `UPDATE incidents SET
          end_time = ?, duration = ?, is_active = 0
         WHERE id = ?`,
        [endTimeText, durationText, activeIncidentRow.id]
      );

      const deactivatedIncident = await dbQuery.get('SELECT * FROM incidents WHERE id = ?', [activeIncidentRow.id]);
      const fullIncidentObj = await assembleIncident(deactivatedIncident);

      // WebSockets Broadcast
      broadcastIncidentUpdate(req.userId, 'sos_deactivated', fullIncidentObj);

      res.json({ success: true, incident: fullIncidentObj });
    } catch (err) {
      console.error('Deactivate SOS error:', err);
      res.status(500).json({ error: 'Internal server error deactivating SOS.' });
    }
  },

  // Get user's history
  async getHistory(req, res) {
    try {
      const incidentRows = await dbQuery.all('SELECT * FROM incidents WHERE user_id = ? AND is_active = 0 ORDER BY id DESC', [req.userId]);
      const list = [];
      for (const row of incidentRows) {
        const fullObj = await assembleIncident(row);
        list.push(fullObj);
      }
      res.json(list);
    } catch (err) {
      console.error('Get history error:', err);
      res.status(500).json({ error: 'Internal server error fetching history.' });
    }
  },

  // Delete history item
  async deleteHistoryItem(req, res) {
    try {
      const { id } = req.params;
      const incident = await dbQuery.get('SELECT user_id FROM incidents WHERE id = ?', [id]);
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }
      await dbQuery.run('DELETE FROM incidents WHERE id = ?', [id]);
      await dbQuery.run('DELETE FROM incident_locations WHERE incident_id = ?', [id]);
      await dbQuery.run('DELETE FROM incident_photos WHERE incident_id = ?', [id]);
      res.json({ success: true, message: 'Incident log deleted successfully' });
    } catch (err) {
      console.error('Delete history error:', err);
      res.status(500).json({ error: 'Internal server error deleting incident.' });
    }
  },

  // Create mock history item
  async createMockHistoryItem(req, res) {
    try {
      const { type } = req.body;
      const incidentId = 'inc_' + Math.random().toString(36).substring(2, 9);
      const user = await dbQuery.get('SELECT * FROM users WHERE id = ?', [req.userId]);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const startTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endTime = new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date().toISOString().split('T')[0];
      
      await dbQuery.run(
        `INSERT INTO incidents (id, user_id, user_name, user_phone, type, start_time, end_time, date, duration, is_active, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          incidentId,
          req.userId,
          user.name,
          user.phone,
          type || 'Mock Emergency Alert',
          startTime,
          endTime,
          dateStr,
          '15 mins',
          'Simulated test incident added manually.'
        ]
      );
      
      await dbQuery.run(
        `INSERT INTO incident_locations (incident_id, lat, lng, timestamp) VALUES (?, 40.7128, -74.0060, ?)`,
        [incidentId, startTime]
      );
      await dbQuery.run(
        `INSERT INTO incident_locations (incident_id, lat, lng, timestamp) VALUES (?, 40.7135, -74.0055, ?)`,
        [incidentId, endTime]
      );
      
      const created = await dbQuery.get('SELECT * FROM incidents WHERE id = ?', [incidentId]);
      const fullObj = await assembleIncident(created);
      res.status(201).json(fullObj);
    } catch (err) {
      console.error('Create mock history error:', err);
      res.status(500).json({ error: 'Internal server error creating mock incident.' });
    }
  }
};

module.exports = sosController;
module.exports.assembleIncident = assembleIncident;
