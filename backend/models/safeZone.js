const mongoose = require('mongoose');

const safeZoneSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, ref: 'User' },
  name: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  radius: { type: Number, required: true }
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

module.exports = mongoose.model('SafeZone', safeZoneSchema);
