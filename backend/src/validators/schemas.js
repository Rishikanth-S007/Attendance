const Joi = require('joi');
const { isDateKey } = require('../utils/date');

// All request schemas in one place.
const dateKey = Joi.string().custom((v, h) => (isDateKey(v) ? v : h.message('must be a real date in YYYY-MM-DD format')));
const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).message('must be HH:mm (24-hour)');
const objectId = Joi.string().hex().length(24);
const optionalText = Joi.string().trim().allow('', null);

// --- Auth ---
const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});
const createAdmin = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(10).required(),
  role: Joi.string().valid('admin', 'super_admin').default('admin'),
});
const changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(10).required(),
});

// --- Employees ---
const employeeFields = {
  name: Joi.string().trim(),
  email: Joi.string().email().allow('', null),
  phone: optionalText,
  department: optionalText,
  designation: optionalText,
  joiningDate: Joi.date().allow(null),
  shiftId: objectId.allow(null),
  officeId: objectId.allow(null),
};
const createEmployee = Joi.object({
  ...employeeFields,
  employeeId: Joi.string().trim().required(),
  name: Joi.string().trim().required(),
});
const updateEmployee = Joi.object({ ...employeeFields, status: Joi.string().valid('active', 'inactive') });

// --- Attendance ---
const timestamp = Joi.object({ timestamp: Joi.date().required() });
const updateAttendance = Joi.object({
  checkIn: timestamp,
  checkOut: timestamp.allow(null),
  status: Joi.string().valid('present', 'checked_out', 'absent', 'on_leave'),
});
const createAttendance = Joi.object({
  employeeId: Joi.string().trim().required(),
  date: dateKey.required(),
  checkIn: Joi.date().required(),
  checkOut: Joi.date().allow(null),
  status: Joi.string().valid('present', 'checked_out', 'absent', 'on_leave'),
});

// --- Shifts ---
const shiftFields = {
  name: Joi.string().trim().max(60),
  startTime: hhmm,
  endTime: hhmm,
  graceMinutes: Joi.number().integer().min(0).max(180),
  halfDayLateMinutes: Joi.number().integer().min(0).max(720),
  halfDayWorkedMinutes: Joi.number().integer().min(0).max(720),
  overtimeAfterMinutes: Joi.number().integer().min(0).max(480),
  workingDays: Joi.array().items(Joi.number().integer().min(0).max(6)).min(1).unique(),
  isDefault: Joi.boolean(),
  status: Joi.string().valid('active', 'inactive'),
};
const endAfterStart = (value, helpers) => {
  if (value.startTime && value.endTime && value.endTime <= value.startTime) {
    return helpers.message('endTime must be later than startTime (overnight shifts are not supported)');
  }
  return value;
};
const createShift = Joi.object(shiftFields).fork(['name', 'startTime', 'endTime'], (s) => s.required()).custom(endAfterStart);
const updateShift = Joi.object(shiftFields).custom(endAfterStart);

// --- Holidays, offices, devices ---
const createHoliday = Joi.object({ date: dateKey.required(), name: Joi.string().trim().max(80).required() });

const officeFields = {
  name: Joi.string().trim().max(80),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  radiusMeters: Joi.number().min(10).max(5000),
  status: Joi.string().valid('active', 'inactive'),
};
const createOffice = Joi.object(officeFields).fork(['name', 'latitude', 'longitude'], (s) => s.required());
const updateOffice = Joi.object(officeFields);

const createDevice = Joi.object({ name: Joi.string().trim().max(60).required() });

// --- Leave ---
const leaveFields = {
  type: Joi.string().valid('casual', 'sick', 'earned', 'unpaid').required(),
  startDate: dateKey.required(),
  endDate: dateKey.required(),
  reason: Joi.string().trim().max(300).allow('').default(''),
};
const createLeave = Joi.object({ ...leaveFields, employeeId: Joi.string().trim().required(), autoApprove: Joi.boolean().default(false) });
const leaveFromApp = Joi.object(leaveFields); // employee identified by face, never by a client-supplied ID
const leaveDecision = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  note: Joi.string().trim().max(300).allow('').default(''),
});

// --- Query strings ---
const reportQuery = Joi.object({
  startDate: dateKey,
  endDate: dateKey,
  employeeId: Joi.string().trim(),
  department: Joi.string().trim(),
  format: Joi.string().valid('json', 'csv', 'xlsx', 'pdf').default('json'),
});

// Query strings are validated too: Express parses `?status[$ne]=x` into an
// object, which would otherwise reach MongoDB as an operator (NoSQL injection).
const employeeListQuery = Joi.object({
  search: Joi.string().trim().max(60).allow(''),
  department: Joi.string().trim().max(60).allow(''),
  status: Joi.string().valid('active', 'inactive').allow(''),
});
const leaveListQuery = Joi.object({
  status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled').allow(''),
  employeeId: Joi.string().trim().allow(''),
  year: Joi.number().integer().min(2000).max(2200),
});
const yearQuery = Joi.object({ year: Joi.number().integer().min(2000).max(2200) });
const scanQuery = Joi.object({
  limit: Joi.number().integer().min(1).max(500), outcome: Joi.string().valid('success', 'rejected', 'error'),
});

module.exports = {
  employeeListQuery, leaveListQuery, yearQuery, scanQuery,
  login, createAdmin, changePassword,
  createEmployee, updateEmployee,
  updateAttendance, createAttendance,
  createShift, updateShift, createHoliday, createOffice, updateOffice, createDevice,
  createLeave, leaveFromApp, leaveDecision,
  reportQuery,
};
