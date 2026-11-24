const mongoose = require('mongoose');

// A paired kiosk or employee phone. The raw key is shown to the admin exactly
// once at creation; only its SHA-256 hash is stored, so a database leak does
// not hand out working keys. (Keys are 256-bit random values, so a fast hash
// is appropriate here; slow hashing is for low-entropy passwords.)
const deviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    keyHash: { type: String, required: true, unique: true, select: false },
    keyPrefix: { type: String, required: true }, // first characters, to recognise a key in the UI
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    lastSeenAt: { type: Date },
    lastIp: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Device', deviceSchema);
