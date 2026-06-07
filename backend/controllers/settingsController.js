const { dbQuery } = require('../config/db');

const settingsController = {
  async getSettings(req, res) {
    try {
      let settings = await dbQuery.get('SELECT * FROM user_settings WHERE user_id = ?', [req.userId]);
      if (!settings) {
        // Create default settings row if missing
        await dbQuery.run(
          `INSERT OR IGNORE INTO user_settings (user_id, shake_enabled, power_tap_threshold, selected_template, geofence_auto_sos_enabled)
           VALUES (?, 1, 5, 'I am in danger. Please check my location. (Silent SOS)', 0)`,
          [req.userId]
        );
        settings = await dbQuery.get('SELECT * FROM user_settings WHERE user_id = ?', [req.userId]);
      }

      res.json({
        shakeEnabled: settings.shake_enabled === 1,
        powerTapThreshold: settings.power_tap_threshold,
        selectedTemplate: settings.selected_template,
        geofenceAutoSosEnabled: settings.geofence_auto_sos_enabled === 1
      });
    } catch (err) {
      console.error('Get settings error:', err);
      res.status(500).json({ error: 'Internal server error fetching configuration settings.' });
    }
  },

  async updateSettings(req, res) {
    const { shakeEnabled, powerTapThreshold, selectedTemplate, geofenceAutoSosEnabled } = req.body;
    
    try {
      const shakeVal = shakeEnabled === true ? 1 : 0;
      const thresholdVal = powerTapThreshold !== undefined ? parseInt(powerTapThreshold, 10) : 5;
      const templateVal = selectedTemplate || 'I am in danger. Please check my location. (Silent SOS)';
      const geofenceVal = geofenceAutoSosEnabled === true ? 1 : 0;

      // Use INSERT OR REPLACE to update settings row dynamically
      await dbQuery.run(
        `INSERT OR REPLACE INTO user_settings (user_id, shake_enabled, power_tap_threshold, selected_template, geofence_auto_sos_enabled)
         VALUES (?, ?, ?, ?, ?)`,
        [req.userId, shakeVal, thresholdVal, templateVal, geofenceVal]
      );

      res.json({
        shakeEnabled: shakeVal === 1,
        powerTapThreshold: thresholdVal,
        selectedTemplate: templateVal,
        geofenceAutoSosEnabled: geofenceVal === 1
      });
    } catch (err) {
      console.error('Update settings error:', err);
      res.status(500).json({ error: 'Internal server error updating settings.' });
    }
  }
};

module.exports = settingsController;
