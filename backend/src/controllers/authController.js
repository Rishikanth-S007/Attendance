const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const env = require('../config/environment');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { success } = require('../utils/response');

// Compared against when the email is unknown, so "no such user" costs the same
// time as "wrong password" and cannot be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// FR-001: Admin Authentication.
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  const valid = await bcrypt.compare(password, admin ? admin.passwordHash : DUMMY_HASH);
  if (!admin || admin.status !== 'active' || !valid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const token = jwt.sign({ id: admin._id, role: admin.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  return success(res, 200, 'Login successful', {
    token,
    admin: { id: admin._id, name: admin.name, role: admin.role },
  });
});

// One-time bootstrap of the very first admin. Protected by SETUP_TOKEN so a
// stranger who reaches a freshly deployed server cannot claim it.
const registerFirstAdmin = asyncHandler(async (req, res) => {
  if (!env.setupToken && env.nodeEnv === 'production') {
    throw new AppError('Initial setup is disabled. Set SETUP_TOKEN to enable it.', 403, 'SETUP_DISABLED');
  }
  if (env.setupToken && !sameSecret(req.headers['x-setup-token'] || '', env.setupToken)) {
    throw new AppError('Invalid or missing setup token', 403, 'BAD_SETUP_TOKEN');
  }
  if ((await Admin.countDocuments()) > 0) {
    throw new AppError('An admin already exists. Use the dashboard to add more admins.', 403, 'ALREADY_SETUP');
  }

  const { name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await Admin.create({ name, email, passwordHash, role: 'super_admin' });
  return success(res, 201, 'Initial admin created', { admin: { id: admin._id, email: admin.email } });
});

const me = asyncHandler(async (req, res) => success(res, 200, 'OK', { admin: req.admin }));

const changePassword = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.admin.id).select('+passwordHash');
  if (!(await bcrypt.compare(req.body.currentPassword, admin.passwordHash))) {
    throw new AppError('Current password is incorrect', 400, 'WRONG_PASSWORD');
  }
  admin.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await admin.save();
  return success(res, 200, 'Password changed');
});

const createAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await Admin.create({ name, email, passwordHash, role });
  return success(res, 201, 'Admin created', { admin: { id: admin._id, name, email, role } });
});

module.exports = { login, registerFirstAdmin, me, changePassword, createAdmin };
