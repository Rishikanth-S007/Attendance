// Shifts, holidays, offices and devices: small admin-managed lookup tables.
const Shift = require('../models/Shift');
const Holiday = require('../models/Holiday');
const Office = require('../models/Office');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const deviceService = require('../services/deviceService');
const scanLogService = require('../services/scanLogService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { success } = require('../utils/response');

const audit = (req, action, entity, id, previousValue, newValue) =>
  AuditLog.create({ adminId: req.admin.id, action, entity, entityId: String(id), previousValue, newValue });

const found = (doc, what) => { if (!doc) throw new AppError(`${what} not found`, 404, 'NOT_FOUND'); return doc; };

// ---- Shifts ----
const listShifts = asyncHandler(async (req, res) => success(res, 200, 'Shifts retrieved', { shifts: await Shift.find().sort({ name: 1 }) }));

// Exactly one default shift at a time.
const clearOtherDefaults = (keepId) => Shift.updateMany({ _id: { $ne: keepId }, isDefault: true }, { isDefault: false });

const createShift = asyncHandler(async (req, res) => {
  const shift = await Shift.create(req.body);
  if (shift.isDefault) await clearOtherDefaults(shift._id);
  await audit(req, 'CREATE_SHIFT', 'Shift', shift._id, null, shift.toObject());
  return success(res, 201, 'Shift created', { shift });
});

const updateShift = asyncHandler(async (req, res) => {
  const before = found(await Shift.findById(req.params.id), 'Shift');
  const merged = { ...before.toObject(), ...req.body };
  if (merged.endTime <= merged.startTime) throw new AppError('endTime must be later than startTime', 400, 'VALIDATION_FAILED');
  if (before.isDefault && req.body.isDefault === false) throw new AppError('Make another shift the default instead', 400, 'DEFAULT_REQUIRED');
  if (before.isDefault && req.body.status === 'inactive') throw new AppError('The default shift cannot be deactivated', 400, 'DEFAULT_REQUIRED');

  const shift = await Shift.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (shift.isDefault) await clearOtherDefaults(shift._id);
  await audit(req, 'UPDATE_SHIFT', 'Shift', shift._id, before.toObject(), shift.toObject());
  return success(res, 200, 'Shift updated', { shift });
});

const deleteShift = asyncHandler(async (req, res) => {
  const shift = found(await Shift.findById(req.params.id), 'Shift');
  if (shift.isDefault) throw new AppError('The default shift cannot be deleted', 400, 'DEFAULT_REQUIRED');
  const users = await Employee.countDocuments({ shiftId: shift._id });
  if (users > 0) throw new AppError(`${users} employee(s) use this shift. Reassign them first.`, 409, 'IN_USE');
  await shift.deleteOne();
  await audit(req, 'DELETE_SHIFT', 'Shift', shift._id, shift.toObject(), null);
  return success(res, 200, 'Shift deleted');
});

// ---- Holidays ----
const listHolidays = asyncHandler(async (req, res) => {
  const query = req.query.year ? { date: { $gte: `${req.query.year}-01-01`, $lte: `${req.query.year}-12-31` } } : {};
  return success(res, 200, 'Holidays retrieved', { holidays: await Holiday.find(query).sort({ date: 1 }) });
});
const createHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.create(req.body);
  await audit(req, 'CREATE_HOLIDAY', 'Holiday', holiday._id, null, holiday.toObject());
  return success(res, 201, 'Holiday added', { holiday });
});
const deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = found(await Holiday.findByIdAndDelete(req.params.id), 'Holiday');
  await audit(req, 'DELETE_HOLIDAY', 'Holiday', holiday._id, holiday.toObject(), null);
  return success(res, 200, 'Holiday removed');
});

// ---- Offices ----
const listOffices = asyncHandler(async (req, res) => success(res, 200, 'Offices retrieved', { offices: await Office.find().sort({ name: 1 }) }));
const createOffice = asyncHandler(async (req, res) => {
  const office = await Office.create(req.body);
  await audit(req, 'CREATE_OFFICE', 'Office', office._id, null, office.toObject());
  return success(res, 201, 'Office created', { office });
});
const updateOffice = asyncHandler(async (req, res) => {
  const before = found(await Office.findById(req.params.id), 'Office');
  const office = await Office.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  await audit(req, 'UPDATE_OFFICE', 'Office', office._id, before.toObject(), office.toObject());
  return success(res, 200, 'Office updated', { office });
});
const deleteOffice = asyncHandler(async (req, res) => {
  const office = found(await Office.findById(req.params.id), 'Office');
  await Employee.updateMany({ officeId: office._id }, { officeId: null });
  await office.deleteOne();
  await audit(req, 'DELETE_OFFICE', 'Office', office._id, office.toObject(), null);
  return success(res, 200, 'Office deleted');
});

// ---- Devices ----
const listDevices = asyncHandler(async (req, res) => success(res, 200, 'Devices retrieved', { devices: await deviceService.listDevices() }));
const createDevice = asyncHandler(async (req, res) => {
  const { device, key } = await deviceService.createDevice(req.body.name, req.admin.id);
  await audit(req, 'CREATE_DEVICE', 'Device', device._id, null, { name: device.name });
  // The raw key is returned exactly once and cannot be retrieved again.
  return success(res, 201, 'Device created. Copy the key now: it will not be shown again.', { device, key });
});
const revokeDevice = asyncHandler(async (req, res) => {
  const device = await deviceService.revokeDevice(req.params.id);
  await audit(req, 'REVOKE_DEVICE', 'Device', device._id, null, { status: 'revoked' });
  return success(res, 200, 'Device revoked', { device });
});

// ---- Scan log ----
const listScans = asyncHandler(async (req, res) =>
  success(res, 200, 'Scan log retrieved', { scans: await scanLogService.list({ limit: req.query.limit, outcome: req.query.outcome }) }));

module.exports = {
  listShifts, createShift, updateShift, deleteShift,
  listHolidays, createHoliday, deleteHoliday,
  listOffices, createOffice, updateOffice, deleteOffice,
  listDevices, createDevice, revokeDevice, listScans,
};
