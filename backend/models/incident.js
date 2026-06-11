const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, ref: 'User' },
  userName: { type: String },
  userPhone: { type: String },
  startTime: { type: String },
  date: { type: String },
  type: { type: String },
  lastLocationLat: { type: Number },
  lastLocationLng: { type: Number },
  endTime: { type: String },
  duration: { type: String },
  isActive: { type: Boolean, default: true },
  audioRecordingUrl: { type: String },
  notes: { type: String },
  locationPath: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    timestamp: { type: String, required: true }
  }],
  photos: { type: Array, default: [] } // holds objects: { id, src, source, timestamp }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Incident', incidentSchema);
