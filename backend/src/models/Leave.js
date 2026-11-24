const mongoose = require('mongoose');

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid'];

const leaveSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    type: { type: String, enum: LEAVE_TYPES, required: true },
    startDate: { type: String, required: true }, // YYYY-MM-DD, inclusive
    endDate: { type: String, required: true }, // YYYY-MM-DD, inclusive
    days: { type: Number, required: true }, // working days covered (weekends and holidays excluded)
    reason: { type: String, trim: true, default: '' },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    // Employees have no accounts, so a request comes either from an admin
    // or from the employee app after a successful face check.
    requestedVia: { type: String, enum: ['admin', 'face_app'], default: 'admin' },
    faceDistance: { type: Number },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    decidedAt: { type: Date },
    decisionNote: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

leaveSchema.index({ employeeId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Leave', leaveSchema);
module.exports.LEAVE_TYPES = LEAVE_TYPES;
