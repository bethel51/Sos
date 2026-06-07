const jwt = require('jsonwebtoken');
const { dbQuery } = require('../config/db');

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
    const session = await dbQuery.get('SELECT user_id FROM sessions WHERE token = ?', [token]);
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalid token' });
    }

    // 3. Fetch User and verify status
    const user = await dbQuery.get('SELECT * FROM users WHERE id = ?', [session.user_id]);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.status === 'suspended') {
      // Clean up sessions for suspended user
      await dbQuery.run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
      return res.status(403).json({ error: 'User is suspended' });
    }

    // Map database snake_case fields back to camelCase for front-end compatibility
    const formattedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      pin: user.pin,
      decoyPin: user.decoy_pin,
      dob: user.dob,
      bloodGroup: user.blood_group,
      medicalConditions: user.medical_conditions,
      emergencyNotes: user.emergency_notes,
      homeAddress: user.home_address,
      profilePicture: user.profile_picture,
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
