const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

const pendingRegistrations = new Map();
const pendingPasswordResets = new Map();

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
  // Send Signup OTP
  async sendSignupOTP(req, res) {
    const { name, email, phone, password, pin } = req.body;
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

      // Generate 4-digit verification code
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      console.log(`\n====================================\n[OTP DEBUG] SIGNUP CODE FOR ${email} IS: ${code}\n====================================\n`);

      // Store in memory map
      pendingRegistrations.set(email.toLowerCase(), {
        name,
        email,
        phone,
        password,
        pin,
        code,
        expiresAt: Date.now() + 15 * 60 * 1000 // 15 mins
      });

      // Send Email via Brevo (Nodemailer)
      const notificationService = require('../services/notificationService');
      await notificationService.sendEmail({
        to: email,
        subject: `Silent SOS - Verification Code: ${code}`,
        bodyText: `Your verification code is ${code}. Please enter this code to complete your account setup.`,
        bodyHtml: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e4e6; border-radius: 8px; background-color: #06060c; color: #ffffff;">
            <h2 style="color: #00f2fe; text-align: center;">Silent SOS Account Verification</h2>
            <p>Hello,</p>
            <p>Thank you for creating an account with Silent SOS. Please use the following 4-digit verification code to secure and activate your account:</p>
            <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #00f2fe; margin: 20px 0;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #888;">This code is valid for 15 minutes. If you did not request this code, please ignore this email.</p>
          </div>
        `
      });

      res.status(200).json({ success: true, message: 'OTP sent to your email.' });
    } catch (err) {
      console.error('Send OTP error:', err);
      res.status(500).json({ error: 'Internal server error sending OTP.' });
    }
  },

  // Verify Signup OTP and Create Account
  async verifySignupOTP(req, res) {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    try {
      const pending = pendingRegistrations.get(email.toLowerCase());
      if (!pending) {
        return res.status(400).json({ error: 'No pending registration request found for this email. Please submit the form again.' });
      }

      if (pending.expiresAt < Date.now()) {
        pendingRegistrations.delete(email.toLowerCase());
        return res.status(400).json({ error: 'Verification code has expired. Please sign up again.' });
      }

      if (String(pending.code) !== String(code)) {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }

      // Hash password and insert into DB
      const passwordHash = await bcrypt.hash(pending.password, 10);
      const userId = 'user_' + Date.now();

      await dbQuery.run(
        `INSERT INTO users (id, name, email, phone, password_hash, pin, dob, blood_group, medical_conditions, emergency_notes, home_address, profile_picture, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          userId,
          pending.name,
          pending.email,
          pending.phone,
          passwordHash,
          pending.pin || '1234',
          '',
          '',
          '',
          '',
          '',
          '',
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

      // Remove from pending registrations cache
      pendingRegistrations.delete(email.toLowerCase());

      const newUser = await dbQuery.get('SELECT * FROM users WHERE id = ?', [userId]);
      res.status(201).json({ user: formatUser(newUser), token });
    } catch (err) {
      console.error('Verify OTP error:', err);
      res.status(500).json({ error: 'Internal server error during registration verification.' });
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

  // Forgot Password (Send OTP)
  async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    try {
      const user = await dbQuery.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      if (!user) {
        return res.status(404).json({ error: 'Email address not registered.' });
      }

      const code = Math.floor(1000 + Math.random() * 9000).toString();
      console.log(`\n====================================\n[OTP DEBUG] PASSWORD RESET CODE FOR ${email} IS: ${code}\n====================================\n`);
      pendingPasswordResets.set(email.toLowerCase(), {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 mins
      });

      const notificationService = require('../services/notificationService');
      await notificationService.sendEmail({
        to: email,
        subject: `Silent SOS - Password Reset OTP: ${code}`,
        bodyText: `Your password reset code is ${code}.`,
        bodyHtml: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e4e6; border-radius: 8px; background-color: #06060c; color: #ffffff;">
            <h2 style="color: #ff2e63; text-align: center;">Silent SOS Password Reset</h2>
            <p>Hello,</p>
            <p>We received a request to reset your password. Please use the following 4-digit verification code to proceed:</p>
            <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #ff2e63; margin: 20px 0;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #888;">This code is valid for 10 minutes. If you did not request a password reset, please ignore this email.</p>
          </div>
        `
      });

      res.status(200).json({ success: true, message: 'Password reset code sent.' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Internal server error sending password reset OTP.' });
    }
  },

  // Reset Password (Verify OTP and Update)
  async resetPassword(req, res) {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required.' });
    }

    try {
      const user = await dbQuery.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      if (!user) {
        return res.status(404).json({ error: 'Email address not registered.' });
      }

      const pending = pendingPasswordResets.get(email.toLowerCase());
      if (!pending) {
        return res.status(400).json({ error: 'No password reset request found for this email.' });
      }

      if (pending.expiresAt < Date.now()) {
        pendingPasswordResets.delete(email.toLowerCase());
        return res.status(400).json({ error: 'Password reset code has expired.' });
      }

      if (String(pending.code) !== String(code)) {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await dbQuery.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);

      await dbQuery.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
      pendingPasswordResets.delete(email.toLowerCase());

      res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Internal server error resetting password.' });
    }
  }
};

module.exports = authController;
