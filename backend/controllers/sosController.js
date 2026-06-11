const fs = require('fs');
const path = require('path');
const User = require('../models/user');
const Contact = require('../models/contact');
const Incident = require('../models/incident');
const { broadcastIncidentUpdate } = require('../config/socket');
const notificationService = require('../services/notificationService');

async function assembleIncident(incident) {
  if (!incident) return null;

  const user = await User.findById(incident.userId);

  return {
    id: incident.id,
    userId: incident.userId,
    userName: incident.userName,
    userPhone: incident.userPhone,
    userEmail: user ? user.email : '',
    dob: user ? user.dob : '',
    bloodGroup: user ? user.bloodGroup : '',
    medicalConditions: user ? user.medicalConditions : '',
    emergencyNotes: user ? user.emergencyNotes : '',
    homeAddress: user ? user.homeAddress : '',
    startTime: incident.startTime,
    date: incident.date,
    type: incident.type,
    lastLocation: {
      lat: incident.lastLocationLat,
      lng: incident.lastLocationLng
    },
    locationPath: incident.locationPath.map(l => ({ lat: l.lat, lng: l.lng, timestamp: l.timestamp })),
    photos: incident.photos,
    audioRecordingUrl: incident.audioRecordingUrl,
    notes: incident.notes,
    endTime: incident.endTime || undefined,
    duration: incident.duration || undefined
  };
}

const sosController = {
  // Check active emergency
  async checkActiveIncident(req, res) {
    try {
      const activeIncident = await Incident.findOne({ isActive: true });
      if (!activeIncident) {
        return res.json({ active: false });
      }
      const incident = await assembleIncident(activeIncident);
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
    
    const lat = location ? location.lat : 4.8156;
    const lng = location ? location.lng : 7.0498;
    const startTimeText = dateNow.toLocaleTimeString();
    const dateText = dateNow.toISOString().split('T')[0];

    try {
      // Deactivate any existing active incidents for safety first
      await Incident.updateMany({ userId: req.userId, isActive: true }, { isActive: false });

      // Create new active incident
      const newIncident = await Incident.create({
        _id: incidentId,
        userId: req.userId,
        userName: req.user.name,
        userPhone: req.user.phone,
        startTime: startTimeText,
        date: dateText,
        type: type || 'Unspecified Threat',
        lastLocationLat: lat,
        lastLocationLng: lng,
        isActive: true,
        locationPath: [{ lat, lng, timestamp: startTimeText }],
        photos: []
      });

      const fullIncidentObj = await assembleIncident(newIncident);

      // WebSockets Broadcast
      broadcastIncidentUpdate(req.userId, 'sos_triggered', fullIncidentObj);

      // Send Alerts to Emergency Contacts
      const contacts = await Contact.find({ userId: req.userId });
      const locationLink = `https://maps.google.com/?q=${lat},${lng}`;
      const dashboardLink = `${req.headers.origin || 'http://localhost:5173'}/`;

      for (const contact of contacts) {
        // Send email
        notificationService.sendEmail({
          to: contact.email,
          subject: `[EMERGENCY] Lead City SOS Alert: ${req.user.name} is in danger!`,
          bodyText: `Hello ${contact.name},\n\n${req.user.name} has triggered a Lead City SOS alert (${type}).\nLast known location: ${locationLink}\n\nMonitor live telemetry at the dashboard: ${dashboardLink}`,
          bodyHtml: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ff4d4d; border-radius: 8px;">
              <h2 style="color: #d93838; margin-top: 0;">⚠️ Emergency Lead City SOS Triggered</h2>
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
          message: `Lead City SOS: ${req.user.name} is in danger (${type || 'Unspecified Threat'}). View live map: ${dashboardLink}`
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
      const activeIncident = await Incident.findOne({ userId: req.userId, isActive: true });
      if (!activeIncident) {
        return res.status(404).json({ error: 'No active incident found.' });
      }

      const timestamp = new Date().toLocaleTimeString();
      
      // Update last location and path
      activeIncident.lastLocationLat = lat;
      activeIncident.lastLocationLng = lng;
      activeIncident.locationPath.push({ lat, lng, timestamp });
      await activeIncident.save();

      const fullIncidentObj = await assembleIncident(activeIncident);

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
      const activeIncident = await Incident.findOne({ userId: req.userId, isActive: true });
      if (!activeIncident) {
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
            
            const filename = `evidence_${activeIncident.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
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

        activeIncident.photos.push(photoObj);
      }
      
      if (audio) {
        let audioUrl = audio;
        if (audio.startsWith('data:')) {
          const matches = audio.match(/^data:([^;]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            let ext = matches[1].split('/')[1] || 'wav';
            ext = ext.split(';')[0];
            const buffer = Buffer.from(matches[2], 'base64');
            const filename = `evidence_audio_${activeIncident.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
            const filepath = path.join(__dirname, '..', '..', 'uploads', filename);
            
            fs.writeFileSync(filepath, buffer);
            audioUrl = `/uploads/${filename}`;
          }
        }
        activeIncident.audioRecordingUrl = audioUrl;
      }

      await activeIncident.save();
      const fullIncidentObj = await assembleIncident(activeIncident);

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
      const activeIncident = await Incident.findOne({ userId: req.userId, isActive: true });
      if (!activeIncident) {
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
          const diffSecs = Math.abs(parseTime(endTimeText) - parseTime(activeIncident.startTime));
          const mins = Math.floor(diffSecs / 60);
          const secs = diffSecs % 60;
          return `${mins}m ${secs}s`;
        } catch (e) {
          return '1m 20s';
        }
      })();

      activeIncident.endTime = endTimeText;
      activeIncident.duration = durationText;
      activeIncident.isActive = false;
      await activeIncident.save();

      const fullIncidentObj = await assembleIncident(activeIncident);

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
      const incidentRows = await Incident.find({ userId: req.userId }).sort({ createdAt: -1 });
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
      const incident = await Incident.findById(id);
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }
      await Incident.deleteOne({ _id: id });
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
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const startTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endTime = new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date().toISOString().split('T')[0];
      
      const newIncident = await Incident.create({
        _id: incidentId,
        userId: req.userId,
        userName: user.name,
        userPhone: user.phone,
        type: type || 'Mock Emergency Alert',
        startTime,
        endTime,
        date: dateStr,
        duration: '15 mins',
        isActive: false,
        notes: 'Simulated test incident added manually.',
        locationPath: [
          { lat: 4.8156, lng: 7.0498, timestamp: startTime },
          { lat: 4.8160, lng: 7.0505, timestamp: endTime }
        ]
      });
      
      const fullObj = await assembleIncident(newIncident);
      res.status(201).json(fullObj);
    } catch (err) {
      console.error('Create mock history error:', err);
      res.status(500).json({ error: 'Internal server error creating mock incident.' });
    }
  }
};

module.exports = sosController;
module.exports.assembleIncident = assembleIncident;
