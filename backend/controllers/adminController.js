const { dbQuery } = require('../config/db');

const adminController = {
  // Admin Login
  async login(req, res) {
    const { email, password } = req.body;
    if (email === 'admin@silentsos.com' && password === 'admin123') {
      return res.json({ token: 'admin_secret_token' });
    }
    res.status(400).json({ error: 'Invalid admin credentials' });
  },

  // Admin Stats
  async getStats(req, res) {
    try {
      const userCount = await dbQuery.get('SELECT COUNT(*) as count FROM users');
      const activeCount = await dbQuery.get('SELECT COUNT(*) as count FROM incidents WHERE is_active = 1');
      const historyCount = await dbQuery.get('SELECT COUNT(*) as count FROM incidents WHERE is_active = 0');

      res.json({
        totalUsers: userCount.count,
        activeEmergencies: activeCount.count,
        totalHistory: historyCount.count,
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
      const users = await dbQuery.all('SELECT id, name, phone, email, status FROM users');
      const userList = [];
      for (const u of users) {
        const contactCount = await dbQuery.get('SELECT COUNT(*) as count FROM contacts WHERE user_id = ?', [u.id]);
        userList.push({
          id: u.id,
          name: u.name,
          phone: u.phone,
          email: u.email,
          status: u.status,
          sosContactsCount: contactCount.count
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
      const user = await dbQuery.get('SELECT id FROM users WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const status = suspend ? 'suspended' : 'active';
      await dbQuery.run('UPDATE users SET status = ? WHERE id = ?', [status, userId]);

      // If suspending, immediately delete all active sessions for this user
      if (suspend) {
        await dbQuery.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
      }

      res.json({ success: true, status });
    } catch (err) {
      console.error('Admin suspend error:', err);
      res.status(500).json({ error: 'Internal server error setting suspend status.' });
    }
  }
};

module.exports = adminController;
