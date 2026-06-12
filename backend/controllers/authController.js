const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Session = require('../models/session');
const Settings = require('../models/settings');
const { JWT_SECRET } = require('../middleware/auth');

const pendingRegistrations = new Map();
const pendingPasswordResets = new Map();

function formatUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    pin: user.pin,
    dob: user.dob,
    bloodGroup: user.bloodGroup,
    medicalConditions: user.medicalConditions,
    emergencyNotes: user.emergencyNotes,
    homeAddress: user.homeAddress,
    profilePicture: user.profilePicture,
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
      const existingEmail = await User.findOne({ email: new RegExp(`^${email}$`, 'i') });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email is already registered.' });
      }

      // Check for existing phone
      const existingPhone = await User.findOne({ phone });
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
        subject: `Lead City SOS - Verification Code: ${code}`,
        bodyText: `Your verification code is ${code}. Please enter this code to complete your account setup.`,
        bodyHtml: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e4e6; border-radius: 8px; background-color: #06060c; color: #ffffff;">
            <h2 style="color: #FFD700; text-align: center;">Lead City SOS Account Verification</h2>
            <p>Hello,</p>
            <p>Thank you for creating an account with Lead City SOS Safety App. Please use the following 4-digit verification code to secure and activate your account:</p>
            <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #FFD700; margin: 20px 0;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #888;">This code is valid for 15 minutes. If you did not request this code, please ignore this email.</p>
          </div>
        `
      });

      // In development/local mode, return the OTP code in the response for easy testing
      // (since SMTP may not be whitelisted for local IPs)
      const isDevMode = process.env.NODE_ENV !== 'production' || process.env.SHOW_OTP_IN_RESPONSE === 'true';
      res.status(200).json({
        success: true,
        message: 'OTP sent to your email.',
        ...(isDevMode ? { devOtp: code, devNote: 'Email SMTP may be restricted. Use this code to verify.' } : {})
      });
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

      const newUser = await User.create({
        _id: userId,
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        passwordHash: passwordHash,
        pin: pending.pin || '1234',
        status: 'active'
      });

      // Initialize default configurations for new users
      await Settings.create({
        _id: userId,
        shakeEnabled: true,
        powerTapThreshold: 5,
        selectedTemplate: 'I am in danger. Please check my location. (Lead City SOS)'
      });

      // Create JWT session with unique salt to prevent duplicate key errors
      const token = jwt.sign({ userId, salt: Math.random().toString() }, JWT_SECRET, { expiresIn: '7d' });
      await Session.findOneAndUpdate(
        { _id: token },
        { userId },
        { upsert: true, new: true }
      );

      // Remove from pending registrations cache
      pendingRegistrations.delete(email.toLowerCase());

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
      const user = await User.findOne({ email: new RegExp(`^${email}$`, 'i') });
      if (!user) {
        return res.status(400).json({ error: 'User not found.' });
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return res.status(400).json({ error: 'Incorrect password.' });
      }

      if (user.status === 'suspended') {
        return res.status(403).json({ error: 'This account has been suspended.' });
      }

      // Create JWT session with unique salt to prevent duplicate key errors
      const token = jwt.sign({ userId: user.id, salt: Math.random().toString() }, JWT_SECRET, { expiresIn: '7d' });
      await Session.findOneAndUpdate(
        { _id: token },
        { userId: user.id },
        { upsert: true, new: true }
      );

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
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (name) user.name = name;
      if (phone) user.phone = phone;
      if (dob !== undefined) user.dob = dob;
      if (bloodGroup !== undefined) user.bloodGroup = bloodGroup;
      if (medicalConditions !== undefined) user.medicalConditions = medicalConditions;
      if (emergencyNotes !== undefined) user.emergencyNotes = emergencyNotes;
      if (homeAddress !== undefined) user.homeAddress = homeAddress;
      if (pin) user.pin = pin;
      if (profilePicture !== undefined) user.profilePicture = profilePicture;

      await user.save();

      res.json({ user: formatUser(user) });
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
      const user = await User.findOne({ email: new RegExp(`^${email}$`, 'i') });
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
        subject: `Lead City SOS - Password Reset OTP: ${code}`,
        bodyText: `Your password reset code is ${code}.`,
        bodyHtml: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e4e6; border-radius: 8px; background-color: #06060c; color: #ffffff;">
            <h2 style="color: #ff2e63; text-align: center;">Lead City SOS Password Reset</h2>
            <p>Hello,</p>
            <p>We received a request to reset your password. Please use the following 4-digit verification code to proceed:</p>
            <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #ff2e63; margin: 20px 0;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #888;">This code is valid for 10 minutes. If you did not request a password reset, please ignore this email.</p>
          </div>
        `
      });

      const isDevMode = process.env.NODE_ENV !== 'production' || process.env.SHOW_OTP_IN_RESPONSE === 'true';
      res.status(200).json({
        success: true,
        message: 'Password reset code sent.',
        ...(isDevMode ? { devOtp: code, devNote: 'Email SMTP may be restricted. Use this code to reset your password.' } : {})
      });
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
      const user = await User.findOne({ email: new RegExp(`^${email}$`, 'i') });
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
      user.passwordHash = passwordHash;
      await user.save();

      await Session.deleteMany({ userId: user.id });
      pendingPasswordResets.delete(email.toLowerCase());

      res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Internal server error resetting password.' });
    }
  }
};

module.exports = authController;
