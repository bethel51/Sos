const SafeZone = require('../models/safeZone');

const safeZonesController = {
  async getZones(req, res) {
    try {
      const list = await SafeZone.find({ userId: req.userId });
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
      const newZone = await SafeZone.create({
        _id: zoneId,
        userId: req.userId,
        name,
        lat,
        lng,
        radius
      });
      res.status(201).json(newZone);
    } catch (err) {
      console.error('Add safe zone error:', err);
      res.status(500).json({ error: 'Internal server error creating safe zone.' });
    }
  },

  async deleteZone(req, res) {
    const zoneId = req.params.id;
    try {
      const zone = await SafeZone.findOne({ _id: zoneId, userId: req.userId });
      if (!zone) {
        return res.status(404).json({ error: 'Safe zone not found.' });
      }

      await SafeZone.deleteOne({ _id: zoneId });
      res.json({ success: true });
    } catch (err) {
      console.error('Delete safe zone error:', err);
      res.status(500).json({ error: 'Internal server error deleting safe zone.' });
    }
  }
};

module.exports = safeZonesController;
