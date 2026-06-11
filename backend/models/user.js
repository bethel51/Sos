const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  phone: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  pin: { type: String, default: '1234' },
  dob: { type: String, default: '' },
  bloodGroup: { type: String, default: '' },
  medicalConditions: { type: String, default: '' },
  emergencyNotes: { type: String, default: '' },
  homeAddress: { type: String, default: '' },
  profilePicture: { type: String, default: '' },
  status: { type: String, default: 'active' }
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

module.exports = mongoose.model('User', userSchema);
