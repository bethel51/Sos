const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/user');
const Contact = require('../models/contact');
const Incident = require('../models/incident');
const SafeZone = require('../models/safeZone');
const Settings = require('../models/settings');

const DB_JSON_PATH = path.join(__dirname, '..', '..', 'db.json');

async function initializeDatabase() {
  console.log('Initializing MongoDB database...');

  // Ensure DB connection is ready
  if (mongoose.connection.readyState === 0) {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/leadcity-sos';
    await mongoose.connect(MONGODB_URI);
  }

  // Import Seed/Existing Data from db.json if configured or in development
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  const shouldSeed = process.env.SEED_DB === 'true' || (nodeEnv !== 'production' && nodeEnv !== 'test');
  if (shouldSeed && fs.existsSync(DB_JSON_PATH)) {
    try {
      const data = fs.readFileSync(DB_JSON_PATH, 'utf8');
      const dbJson = JSON.parse(data);

      console.log('Found db.json. Checking for data migration...');

      const userCount = await User.countDocuments();
      if (userCount === 0) {
        console.log('Database is empty. Migrating users and data from db.json...');

        if (Array.isArray(dbJson.users)) {
          for (const user of dbJson.users) {
            const passwordHash = await bcrypt.hash(user.password || 'Password123!', 10);
            
            // Create user
            await User.create({
              _id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              passwordHash: passwordHash,
              pin: user.pin || '1234',
              dob: user.dob || '',
              bloodGroup: user.bloodGroup || '',
              medicalConditions: user.medicalConditions || '',
              emergencyNotes: user.emergencyNotes || '',
              homeAddress: user.homeAddress || '',
              profilePicture: user.profilePicture || '',
              status: user.status || 'active'
            });

            // Create settings
            await Settings.create({
              _id: user.id,
              shakeEnabled: true,
              powerTapThreshold: 5,
              selectedTemplate: 'I am in danger. Please check my location. (Silent SOS)',
              geofenceAutoSosEnabled: false
            });

            // Migrate contacts
            const contacts = dbJson.contacts?.[user.id] || [];
            for (const contact of contacts) {
              await Contact.create({
                _id: contact.id,
                userId: user.id,
                name: contact.name,
                phone: contact.phone,
                email: contact.email,
                relationship: contact.relationship
              });
            }

            // Migrate incidents
            const history = dbJson.history?.[user.id] || [];
            for (const incident of history) {
              // Convert photo structures
              const formattedPhotos = Array.isArray(incident.photos)
                ? incident.photos.map(p => ({ photoData: typeof p === 'string' ? p : p.photoData }))
                : [];

              await Incident.create({
                _id: incident.id,
                userId: user.id,
                userName: incident.userName || user.name,
                userPhone: incident.userPhone || user.phone,
                startTime: incident.startTime || '',
                date: incident.date || '',
                type: incident.type || 'Unspecified Threat',
                lastLocationLat: incident.lastLocation?.lat || 4.8156, // Lead city lat/lng is Nigeria-based or standard
                lastLocationLng: incident.lastLocation?.lng || 7.0498,
                endTime: incident.endTime || '',
                duration: incident.duration || '',
                isActive: false,
                audioRecordingUrl: incident.audioRecordingUrl || null,
                notes: incident.notes || '',
                locationPath: Array.isArray(incident.locationPath) ? incident.locationPath : [],
                photos: formattedPhotos
              });
            }
          }
        }
        console.log('Migration completed successfully!');
      } else {
        console.log('Database already has data. Skipping migration.');
      }
    } catch (err) {
      console.error('Migration failed:', err);
    }
  }
}

module.exports = initializeDatabase;
