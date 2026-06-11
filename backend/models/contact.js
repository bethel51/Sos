const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, ref: 'User' },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  relationship: { type: String, required: true }
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

module.exports = mongoose.model('Contact', contactSchema);
