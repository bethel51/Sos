const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Map to token
  userId: { type: String, required: true, ref: 'User' }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      ret.token = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Session', sessionSchema);
