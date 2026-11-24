const mongoose = require('mongoose');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    startTime: { type: String, required: true, match: HHMM }, // "09:00"
    endTime: { type: String, required: true, match: HHMM }, // "18:00" (same day; overnight shifts are not supported)

    // Arriving within the grace window is still "on time".
    graceMinutes: { type: Number, default: 10, min: 0 },
    // Arriving this late (measured from the start time) counts as a half day.
    halfDayLateMinutes: { type: Number, default: 120, min: 0 },
    // Working fewer minutes than this also counts as a half day.
    halfDayWorkedMinutes: { type: Number, default: 240, min: 0 },
    // Time worked beyond the end time counts as overtime only past this threshold.
    overtimeAfterMinutes: { type: Number, default: 30, min: 0 },

    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0 = Sunday ... 6 = Saturday
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Shift', shiftSchema);
