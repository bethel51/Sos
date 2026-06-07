const { dbQuery } = require('../config/db');

const safeZonesController = {
  async getZones(req, res) {
    try {
      const list = await dbQuery.all('SELECT * FROM safe_zones WHERE user_id = ?', [req.userId]);
      res.json(list);
    } catch (err) {
      console.error('Get safe zones error:', err);
      res.status(500).json({ error: 'Internal server error fetching safe zones.' });
    }
  },

  async addZone(req, res) {
    const { name, lat, lng, radius } = req.body;
    if (!name || lat === undefined || lng === undefined || radius === undefined) {
      return res.status(400).json({ error: 'Name, lat, lng, and radius are required.' });
    }

    try {
      const zoneId = 'zone_' + Date.now();
      await dbQuery.run(
        `INSERT INTO safe_zones (id, user_id, name, lat, lng, radius) VALUES (?, ?, ?, ?, ?, ?)`,
        [zoneId, req.userId, name, lat, lng, radius]
      );
      res.status(201).json({ id: zoneId, name, lat, lng, radius });
    } catch (err) {
      console.error('Add safe zone error:', err);
      res.status(500).json({ error: 'Internal server error creating safe zone.' });
    }
  },

  async deleteZone(req, res) {
    const zoneId = req.params.id;
    try {
      const zone = await dbQuery.get('SELECT id FROM safe_zones WHERE id = ? AND user_id = ?', [zoneId, req.userId]);
      if (!zone) {
        return res.status(404).json({ error: 'Safe zone not found.' });
      }

      await dbQuery.run('DELETE FROM safe_zones WHERE id = ?', [zoneId]);
      res.json({ success: true });
    } catch (err) {
      console.error('Delete safe zone error:', err);
      res.status(500).json({ error: 'Internal server error deleting safe zone.' });
    }
  }
};

module.exports = safeZonesController;
