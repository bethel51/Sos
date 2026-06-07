const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { dbQuery } = require('../config/db');

const DB_JSON_PATH = path.join(__dirname, '..', '..', 'db.json');

async function initializeDatabase() {
  console.log('Initializing database schema...');

  // 1. Create Tables
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      pin TEXT NOT NULL DEFAULT '1234',
      dob TEXT,
      blood_group TEXT,
      medical_conditions TEXT,
      emergency_notes TEXT,
      home_address TEXT,
      profile_picture TEXT,
      status TEXT DEFAULT 'active'
    )
  `);

  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      relationship TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT,
      user_phone TEXT,
      start_time TEXT,
      date TEXT,
      type TEXT,
      last_location_lat REAL,
      last_location_lng REAL,
      end_time TEXT,
      duration TEXT,
      is_active INTEGER DEFAULT 1,
      audio_recording_url TEXT,
      notes TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS incident_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    )
  `);

  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS incident_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      photo_data TEXT NOT NULL,
      FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    )
  `);

  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Safe zones table
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS safe_zones (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      radius REAL NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Custom configurations table
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      shake_enabled INTEGER DEFAULT 1,
      power_tap_threshold INTEGER DEFAULT 5,
      selected_template TEXT DEFAULT 'I am in danger. Please check my location. (Silent SOS)',
      geofence_auto_sos_enabled INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('Database tables verified/created successfully.');

  // Run migrations if schema already exists but missing geofence_auto_sos_enabled column
  try {
    await dbQuery.run('ALTER TABLE user_settings ADD COLUMN geofence_auto_sos_enabled INTEGER DEFAULT 0');
    console.log('Migrated user_settings to add geofence_auto_sos_enabled column.');
  } catch (e) {
    // Column already exists, ignore
  }

  // 2. Import Seed/Existing Data from db.json if configured or in development
  const shouldSeed = process.env.SEED_DB === 'true' || (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test');
  if (shouldSeed && fs.existsSync(DB_JSON_PATH)) {
    try {
      const data = fs.readFileSync(DB_JSON_PATH, 'utf8');
      const dbJson = JSON.parse(data);

      console.log('Found db.json. Checking for data migration...');

      // Migration check
      const userCountRow = await dbQuery.get('SELECT COUNT(*) as count FROM users');
      if (userCountRow.count === 0) {
        console.log('Database is empty. Migrating users and data from db.json...');

        // Migrate users
        if (Array.isArray(dbJson.users)) {
          for (const user of dbJson.users) {
            const passwordHash = await bcrypt.hash(user.password || 'Password123!', 10);
            await dbQuery.run(
              `INSERT OR IGNORE INTO users (id, name, email, phone, password_hash, pin, dob, blood_group, medical_conditions, emergency_notes, home_address, profile_picture, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                user.id,
                user.name,
                user.email,
                user.phone,
                passwordHash,
                user.pin || '1234',
                user.dob || '',
                user.bloodGroup || '',
                user.medicalConditions || '',
                user.emergencyNotes || '',
                user.homeAddress || '',
                user.profilePicture || '',
                user.status || 'active'
              ]
            );

            // Populate default settings for the migrated user
            await dbQuery.run(
              `INSERT OR IGNORE INTO user_settings (user_id, shake_enabled, power_tap_threshold, selected_template, geofence_auto_sos_enabled)
               VALUES (?, 1, 5, 'I am in danger. Please check my location. (Silent SOS)', 0)`,
              [user.id]
            );

            // Migrate contacts for this user
            const contacts = dbJson.contacts?.[user.id] || [];
            for (const contact of contacts) {
              await dbQuery.run(
                `INSERT OR IGNORE INTO contacts (id, user_id, name, phone, email, relationship) VALUES (?, ?, ?, ?, ?, ?)`,
                [contact.id, user.id, contact.name, contact.phone, contact.email, contact.relationship]
              );
            }

            // Migrate history for this user
            const history = dbJson.history?.[user.id] || [];
            for (const incident of history) {
              await dbQuery.run(
                `INSERT OR IGNORE INTO incidents (id, user_id, user_name, user_phone, start_time, date, type, last_location_lat, last_location_lng, end_time, duration, is_active, audio_recording_url, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                [
                  incident.id,
                  user.id,
                  incident.userName || user.name,
                  incident.userPhone || user.phone,
                  incident.startTime || '',
                  incident.date || '',
                  incident.type || 'Unspecified Threat',
                  incident.lastLocation?.lat || 40.7128,
                  incident.lastLocation?.lng || -74.0060,
                  incident.endTime || '',
                  incident.duration || '',
                  incident.audioRecordingUrl || null,
                  incident.notes || ''
                ]
              );

              // Migrate location path
              if (Array.isArray(incident.locationPath)) {
                for (const loc of incident.locationPath) {
                  await dbQuery.run(
                    `INSERT INTO incident_locations (incident_id, lat, lng, timestamp) VALUES (?, ?, ?, ?)`,
                    [incident.id, loc.lat, loc.lng, loc.timestamp]
                  );
                }
              }

              // Migrate photos
              if (Array.isArray(incident.photos)) {
                for (const photo of incident.photos) {
                  await dbQuery.run(
                    `INSERT INTO incident_photos (incident_id, photo_data) VALUES (?, ?)`,
                    [incident.id, JSON.stringify(photo)]
                  );
                }
              }
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
