const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Map to userId
  shakeEnabled: { type: Boolean, default: true },
  powerTapThreshold: { type: Number, default: 5 },
  selectedTemplate: { type: String, default: 'I am in danger. Please check my location. (Silent SOS)' },
  geofenceAutoSosEnabled: { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      ret.userId = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
