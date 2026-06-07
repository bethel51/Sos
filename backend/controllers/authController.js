const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

// Format user row to CamelCase matching UI models (excluding decoy pin)
function formatUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    pin: user.pin,
    dob: user.dob,
    bloodGroup: user.blood_group,
    medicalConditions: user.medical_conditions,
    emergencyNotes: user.emergency_notes,
    homeAddress: user.home_address,
    profilePicture: user.profile_picture,
    status: user.status
  };
}

const authController = {
  // Signup handler
  async signup(req, res) {
    const {
      name,
      email,
      phone,
      password,
      pin,
      dob,
      bloodGroup,
      medicalConditions,
      emergencyNotes,
      homeAddress,
      profilePicture
    } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Missing required signup fields.' });
    }

    try {
      // Check for existing email
      const existingEmail = await dbQuery.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email is already registered.' });
      }

      // Check for existing phone
      const existingPhone = await dbQuery.get('SELECT id FROM users WHERE phone = ?', [phone]);
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number is already registered.' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = 'user_' + Date.now();

      await dbQuery.run(
        `INSERT INTO users (id, name, email, phone, password_hash, pin, dob, blood_group, medical_conditions, emergency_notes, home_address, profile_picture, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          userId,
          name,
          email,
          phone,
          passwordHash,
          pin || '1234',
          dob || '',
          bloodGroup || '',
          medicalConditions || '',
          emergencyNotes || '',
          homeAddress || '',
          profilePicture || '',
        ]
      );

      // Initialize default configurations for new users
      await dbQuery.run(
        `INSERT OR IGNORE INTO user_settings (user_id, shake_enabled, power_tap_threshold, selected_template)
         VALUES (?, 1, 5, 'I am in danger. Please check my location. (Silent SOS)')`,
        [userId]
      );

      // Create JWT session
      const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
      await dbQuery.run('INSERT OR REPLACE INTO sessions (token, user_id) VALUES (?, ?)', [token, userId]);

      const newUser = await dbQuery.get('SELECT * FROM users WHERE id = ?', [userId]);
      res.status(201).json({ user: formatUser(newUser), token });
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Internal server error during signup.' });
    }
  },

  // Login handler
  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
      const user = await dbQuery.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      if (!user) {
        return res.status(400).json({ error: 'User not found.' });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(400).json({ error: 'Incorrect password.' });
      }

      if (user.status === 'suspended') {
        return res.status(403).json({ error: 'This account has been suspended.' });
      }

      // Create JWT session
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      await dbQuery.run('INSERT OR REPLACE INTO sessions (token, user_id) VALUES (?, ?)', [token, user.id]);

      res.json({ user: formatUser(user), token });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error during login.' });
    }
  },

  // Get Profile (from middleware decoded state)
  getProfile(req, res) {
    res.json({ user: req.user });
  },

  // Update Profile
  async updateProfile(req, res) {
    const {
      name,
      phone,
      dob,
      bloodGroup,
      medicalConditions,
      emergencyNotes,
      homeAddress,
      pin,
      profilePicture
    } = req.body;

    try {
      const existingUser = await dbQuery.get('SELECT * FROM users WHERE id = ?', [req.userId]);
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Use database fields or fall back to current values
      const updatedName = name || existingUser.name;
      const updatedPhone = phone || existingUser.phone;
      const updatedDob = dob !== undefined ? dob : existingUser.dob;
      const updatedBloodGroup = bloodGroup !== undefined ? bloodGroup : existingUser.blood_group;
      const updatedMedicalConditions = medicalConditions !== undefined ? medicalConditions : existingUser.medical_conditions;
      const updatedEmergencyNotes = emergencyNotes !== undefined ? emergencyNotes : existingUser.emergency_notes;
      const updatedHomeAddress = homeAddress !== undefined ? homeAddress : existingUser.home_address;
      const updatedPin = pin || existingUser.pin;
      const updatedProfilePicture = profilePicture !== undefined ? profilePicture : existingUser.profile_picture;

      await dbQuery.run(
        `UPDATE users SET
          name = ?, phone = ?, dob = ?, blood_group = ?, medical_conditions = ?,
          emergency_notes = ?, home_address = ?, pin = ?, profile_picture = ?
         WHERE id = ?`,
        [
          updatedName,
          updatedPhone,
          updatedDob,
          updatedBloodGroup,
          updatedMedicalConditions,
          updatedEmergencyNotes,
          updatedHomeAddress,
          updatedPin,
          updatedProfilePicture,
          req.userId
        ]
      );

      const updatedUser = await dbQuery.get('SELECT * FROM users WHERE id = ?', [req.userId]);
      res.json({ user: formatUser(updatedUser) });
    } catch (err) {
      console.error('Update profile error:', err);
      res.status(500).json({ error: 'Internal server error updating profile.' });
    }
  },

  // Reset Password
  async resetPassword(req, res) {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required.' });
    }

    try {
      const user = await dbQuery.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      if (!user) {
        return res.status(404).json({ error: 'Email address not registered.' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await dbQuery.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);

      // Invalidate existing sessions on password reset
      await dbQuery.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Internal server error resetting password.' });
    }
  }
};

module.exports = authController;
