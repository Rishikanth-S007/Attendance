const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true }, // Rule 10: must be unique
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    joiningDate: { type: Date },

    profileImage: { type: String },

    // Work pattern + location. Both optional: without a shift the default
    // shift applies, without an office any active office is acceptable.
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Office', default: null },

    // --- Biometric fields ---
    faceRegistered: { type: Boolean, default: false },
    faceSamples: { type: Number, default: 0 }, // how many templates are stored (safe to expose)
    // Embeddings only; raw photos are never stored. `select: false` keeps the
    // vectors out of every query (and so every API response) unless a service
    // explicitly asks for them with .select('+faceEmbeddings').
    faceEmbeddings: {
      type: [
        {
          vector: { type: [Number], required: true },
          label: { type: String, default: 'primary' }, // front / left / right / primary
          createdAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      select: false,
    },

    // Rule 9: deletion is modelled as deactivation so history stays valid.
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

employeeSchema.index({ status: 1, faceRegistered: 1 });
employeeSchema.index({ department: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
