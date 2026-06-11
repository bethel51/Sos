const Settings = require('../models/settings');

const settingsController = {
  async getSettings(req, res) {
    try {
      let settings = await Settings.findById(req.userId);
      if (!settings) {
        // Create default settings row if missing
        settings = await Settings.create({
          _id: req.userId,
          shakeEnabled: true,
          powerTapThreshold: 5,
          selectedTemplate: 'I am in danger. Please check my location. (Lead City SOS)',
          geofenceAutoSosEnabled: false
        });
      }

      res.json({
        shakeEnabled: settings.shakeEnabled,
        powerTapThreshold: settings.powerTapThreshold,
        selectedTemplate: settings.selectedTemplate,
        geofenceAutoSosEnabled: settings.geofenceAutoSosEnabled
      });
    } catch (err) {
      console.error('Get settings error:', err);
      res.status(500).json({ error: 'Internal server error fetching configuration settings.' });
    }
  },

  async updateSettings(req, res) {
    const { shakeEnabled, powerTapThreshold, selectedTemplate, geofenceAutoSosEnabled } = req.body;
    
    try {
      const thresholdVal = powerTapThreshold !== undefined ? parseInt(powerTapThreshold, 10) : 5;
      const templateVal = selectedTemplate || 'I am in danger. Please check my location. (Lead City SOS)';

      const settings = await Settings.findByIdAndUpdate(
        req.userId,
        {
          shakeEnabled: !!shakeEnabled,
          powerTapThreshold: thresholdVal,
          selectedTemplate: templateVal,
          geofenceAutoSosEnabled: !!geofenceAutoSosEnabled
        },
        { new: true, upsert: true }
      );

      res.json({
        shakeEnabled: settings.shakeEnabled,
        powerTapThreshold: settings.powerTapThreshold,
        selectedTemplate: settings.selectedTemplate,
        geofenceAutoSosEnabled: settings.geofenceAutoSosEnabled
      });
    } catch (err) {
      console.error('Update settings error:', err);
      res.status(500).json({ error: 'Internal server error updating settings.' });
    }
  }
};

module.exports = settingsController;
