const User = require('../models/user');
const Contact = require('../models/contact');
const Incident = require('../models/incident');
const Session = require('../models/session');

const adminController = {
  // Admin Login
  async login(req, res) {
    const { email, password } = req.body;
    if (email === 'admin@leadcitysos.com' && password === 'admin123') {
      return res.json({ token: 'admin_secret_token' });
    }
    res.status(400).json({ error: 'Invalid admin credentials' });
  },

  // Admin Stats
  async getStats(req, res) {
    try {
      const userCount = await User.countDocuments();
      const activeCount = await Incident.countDocuments({ isActive: true });
      const historyCount = await Incident.countDocuments({ isActive: false });

      res.json({
        totalUsers: userCount,
        activeEmergencies: activeCount,
        totalHistory: historyCount,
        uptime: '99.98%'
      });
    } catch (err) {
      console.error('Admin stats error:', err);
      res.status(500).json({ error: 'Internal server error fetching admin stats.' });
    }
  },

  // Get Users List
  async getUsers(req, res) {
    try {
      const users = await User.find({}, 'id name phone email status');
      const userList = [];
      for (const u of users) {
        const contactCount = await Contact.countDocuments({ userId: u.id });
        userList.push({
          id: u.id,
          name: u.name,
          phone: u.phone,
          email: u.email,
          status: u.status,
          sosContactsCount: contactCount
        });
      }
      res.json(userList);
    } catch (err) {
      console.error('Admin users error:', err);
      res.status(500).json({ error: 'Internal server error fetching user list.' });
    }
  },

  // Suspend/Unsuspend User
  async toggleSuspend(req, res) {
    const userId = req.params.id;
    const suspend = req.body.suspend;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const status = suspend ? 'suspended' : 'active';
      user.status = status;
      await user.save();

      // If suspending, immediately delete all active sessions for this user
      if (suspend) {
        await Session.deleteMany({ userId });
      }

      res.json({ success: true, status });
    } catch (err) {
      console.error('Admin suspend error:', err);
      res.status(500).json({ error: 'Internal server error setting suspend status.' });
    }
  }
};

module.exports = adminController;
