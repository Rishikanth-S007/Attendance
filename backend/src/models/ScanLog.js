const mongoose = require('mongoose');

// Every check-in / check-out / leave-request attempt, including failures.
// No images and no embeddings: only the outcome and numbers useful for
// tuning the match threshold and spotting abuse. Entries expire after 90 days.
const scanLogSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['check_in', 'check_out', 'verify', 'leave_request'], required: true },
    outcome: { type: String, enum: ['success', 'rejected', 'error'], required: true },
    code: { type: String },
    message: { type: String },
    employeeId: { type: String },
    distance: { type: Number },
    margin: { type: Number },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    ip: { type: String },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
  },
  { versionKey: false }
);

scanLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ScanLog', scanLogSchema);
