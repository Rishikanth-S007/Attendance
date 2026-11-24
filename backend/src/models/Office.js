const mongoose = require('mongoose');

// A geofenced work location: a centre point plus an allowed radius.
const officeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    radiusMeters: { type: Number, default: 150, min: 10, max: 5000 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Office', officeSchema);
