const Joi = require('joi');
const attendanceService = require('../services/attendanceService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { success } = require('../utils/response');
const { formatTime, todayKey, isDateKey } = require('../utils/date');
const { parseLocation } = require('../utils/location');
const scanLog = require('../services/scanLogService');

const needImage = (req) => {
  if (!req.file) throw new AppError('Face image is required', 400, 'IMAGE_REQUIRED');
};
const ctxOf = (req) => ({ deviceId: req.device && req.device.id, ip: req.ip, location: parseLocation(req.body) });
const t = (stamp) => (stamp ? formatTime(stamp) : null);

const present = (a) => ({
  date: a.date,
  checkIn: t(a.checkIn && a.checkIn.timestamp),
  checkOut: t(a.checkOut && a.checkOut.timestamp),
  status: a.status,
  outcome: a.outcome,
  lateMinutes: a.lateMinutes,
  workedMinutes: a.workedMinutes,
  overtimeMinutes: a.overtimeMinutes,
});
const who = (e) => ({ employeeId: e.employeeId, name: e.name });

// FR-006 / FR-007: Check-In.
const checkIn = asyncHandler(async (req, res) => {
  needImage(req);
  const r = await attendanceService.checkIn(req.file.buffer, ctxOf(req));
  return success(res, 200, r.message, { alreadyCheckedIn: r.alreadyCheckedIn, employee: who(r.employee), attendance: present(r.attendance) });
});

// FR-008 / FR-009: Check-Out.
const checkOut = asyncHandler(async (req, res) => {
  needImage(req);
  const r = await attendanceService.checkOut(req.file.buffer, ctxOf(req));
  return success(res, 200, r.message, { alreadyCheckedOut: r.alreadyCheckedOut, employee: who(r.employee), attendance: present(r.attendance) });
});

// Identification only, no attendance side effects (kiosk "who is this?" and admin testing).
const verify = asyncHandler(async (req, res) => {
  needImage(req);
  const ctx = { deviceId: req.device && req.device.id, ip: req.ip };
  try {
    const r = await scanLog.logged('verify', ctx, () => attendanceService.identifyEmployeeFromImage(req.file.buffer));
    return success(res, 200, 'Face verified', { matched: true, employeeId: r.employee.employeeId, name: r.employee.name, confidence: r.confidence });
  } catch (err) {
    if (err instanceof AppError && err.statusCode < 500) {
      return success(res, 200, err.message, { matched: false, employeeId: null, confidence: 0, code: err.code });
    }
    throw err;
  }
});

const dateKey = Joi.string().custom((v, h) => (isDateKey(v) ? v : h.message('must be a real date (YYYY-MM-DD)')));
const listQuery = Joi.object({
  date: dateKey, from: dateKey, to: dateKey,
  employeeId: Joi.string().trim(), department: Joi.string().trim(),
  status: Joi.string().valid('present', 'checked_out', 'absent', 'on_leave'),
  outcome: Joi.string().valid('on_time', 'late', 'half_day'),
  month: Joi.number().integer().min(1).max(12), year: Joi.number().integer().min(2000).max(2200),
  limit: Joi.number().integer().min(1).max(2000),
});

const list = asyncHandler(async (req, res) => {
  const { error, value } = listQuery.validate(req.query, { stripUnknown: true });
  if (error) throw new AppError(error.message, 400, 'VALIDATION_FAILED');
  return success(res, 200, 'Attendance retrieved', { records: await attendanceService.listAttendance(value) });
});

const today = asyncHandler(async (req, res) =>
  success(res, 200, "Today's attendance retrieved", { records: await attendanceService.listAttendance({ date: todayKey() }) }));

const byEmployee = asyncHandler(async (req, res) =>
  success(res, 200, 'Employee attendance history retrieved', { records: await attendanceService.listAttendance({ employeeId: req.params.employeeId }) }));

// FR-011: admin correction, fully audited.
const update = asyncHandler(async (req, res) =>
  success(res, 200, 'Attendance updated', { record: await attendanceService.adminUpdateAttendance(req.params.id, req.body, req.admin.id) }));

const create = asyncHandler(async (req, res) =>
  success(res, 201, 'Attendance recorded', { record: await attendanceService.adminCreateAttendance(req.body, req.admin.id) }));

module.exports = { checkIn, checkOut, verify, list, today, byEmployee, update, create };
