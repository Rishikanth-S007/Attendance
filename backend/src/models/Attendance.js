const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    distanceMeters: Number, // distance to the nearest allowed office at that moment
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Office' },
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    timestamp: { type: Date },
    verificationScore: { type: Number }, // 0-1 display score derived from face distance
    faceDistance: { type: Number }, // raw embedding distance (smaller = closer)
    verificationMethod: { type: String, default: 'face_embedding' }, // or 'manual' (admin entry)
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
    location: { type: locationSchema, default: undefined },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true }, // references Employee.employeeId
    date: { type: String, required: true }, // YYYY-MM-DD in the organisation's timezone

    checkIn: { type: verificationSchema, default: null },
    checkOut: { type: verificationSchema, default: null },

    // Workflow state.
    status: {
      type: String,
      enum: ['present', 'checked_out', 'absent', 'on_leave'],
      default: 'present',
    },

    // Shift rules, evaluated when checking in/out and re-evaluated on admin edits.
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    shiftName: { type: String },
    dayType: { type: String, enum: ['working', 'weekend', 'holiday'], default: 'working' },
    outcome: { type: String, enum: ['on_time', 'late', 'half_day'], default: 'on_time' },
    lateMinutes: { type: Number, default: 0 },
    earlyLeaveMinutes: { type: Number, default: 0 },
    workedMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },

    edited: { type: Boolean, default: false }, // true once an admin has corrected or created it
  },
  { timestamps: true }
);

// Rule 5: exactly one attendance record per employee per day. This unique
// compound index is the authoritative, database-level guarantee; application
// checks are only the friendly first line of defence.
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
