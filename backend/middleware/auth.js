const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Session = require('../models/session');

const JWT_SECRET = process.env.JWT_SECRET || 'silentsos_jwt_secret_key';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.replace('Bearer ', '');
  
  try {
    // 1. Verify JWT signature & expiration
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 2. Verify session exists in DB (stateful logout/suspension check)
    const session = await Session.findById(token);
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid token' });
    }

    // 3. Fetch User and verify status
    const user = await User.findById(session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.status === 'suspended') {
      // Clean up sessions for suspended user
      await Session.deleteMany({ userId: user._id });
      return res.status(403).json({ error: 'User is suspended' });
    }

    // Map database fields to front-end compatibility format
    const formattedUser = {
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

    req.userId = user.id;
    req.user = formattedUser;
    req.token = token;
    next();
  } catch (err) {
    console.error('JWT Auth Error:', err);
    return res.status(401).json({ error: 'Session expired or invalid token' });
  }
}

module.exports = authMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
