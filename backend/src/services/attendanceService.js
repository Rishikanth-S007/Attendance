const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const faceService = require('./faceService');
const calendar = require('./calendarService');
const scanLog = require('./scanLogService');
const rules = require('./rules');
const env = require('../config/environment');
const { AppError } = require('../utils/errors');
const { evaluateGeofence } = require('../utils/geo');
const { todayKey, formatTime, isDateKey } = require('../utils/date');

// Re-exported under the old name so existing imports keep working.
const AttendanceError = AppError;

// Capture problems reported by the face service: the photo was unusable, which
// is different from "we looked at a good photo and it matched nobody".
const CAPTURE_MESSAGES = {
  NO_FACE: 'No face detected. Please face the camera.',
  MULTIPLE_FACES: 'More than one face detected. Please check in one person at a time.',
};

const NOT_RECOGNIZED = 'Face not recognized. Please ensure good lighting and face the camera directly.';
const AMBIGUOUS = 'We could not tell for certain who this is. Please try again, facing the camera directly.';

/**
 * Identify who is in the photo among active, enrolled employees (FR-004),
 * then apply the acceptance rules: close enough, clearly closer than the
 * runner-up, and an active employee (FR-005, Rules 1-3).
 * Returns { employee, faceDistance, margin, confidence }.
 */
async function identifyEmployeeFromImage(imageBuffer) {
  const candidates = await Employee.find({ status: 'active', faceRegistered: true })
    .select('employeeId name status shiftId officeId +faceEmbeddings');

  if (candidates.length === 0) {
    throw new AppError('No registered employees to match against', 422, 'NO_CANDIDATES');
  }

  const registered = candidates.map((e) => ({
    employeeId: e.employeeId,
    embeddings: e.faceEmbeddings.map((f) => f.vector),
  }));

  const result = await faceService.recognizeFace(imageBuffer, registered);

  if (!result.matched) {
    // The face service attaches a code when the photo itself was the problem.
    if (result.code && result.code !== 'BAD_REQUEST') {
      throw new AppError(CAPTURE_MESSAGES[result.code] || result.message || NOT_RECOGNIZED, 422, result.code);
    }
    throw new AppError(NOT_RECOGNIZED, 401, 'FACE_NOT_RECOGNIZED');
  }

  const meta = { employeeId: result.employeeId, distance: result.distance, margin: result.margin };
  const decision = rules.decideMatch(result, { maxDistance: env.faceMaxDistance, minMargin: env.faceMinMargin });
  if (!decision.accepted) {
    // Unknown face: no attendance record is created.
    const ambiguous = decision.code === 'FACE_AMBIGUOUS';
    throw new AppError(ambiguous ? AMBIGUOUS : NOT_RECOGNIZED, 401, decision.code, meta);
  }

  const employee = candidates.find((e) => e.employeeId === result.employeeId);
  if (!employee) throw new AppError('Matched employee record could not be found', 404, 'EMPLOYEE_NOT_FOUND', meta);
  if (employee.status !== 'active') throw new AppError('This employee account is not active', 403, 'EMPLOYEE_INACTIVE', meta);

  return { employee, faceDistance: result.distance, margin: result.margin, confidence: result.confidence };
}

/** Reject check-ins from outside every allowed office (when offices are configured). */
async function enforceGeofence(employee, location, meta) {
  if (!env.geofenceEnforce) return null;

  const offices = await calendar.getAllowedOffices(employee);
  const verdict = evaluateGeofence({ offices, location, maxAccuracyMeters: env.geofenceMaxAccuracyMeters });
  if (verdict.ok) return verdict;

  const messages = {
    LOCATION_REQUIRED: () => 'Location is required. Please turn on GPS and allow location access.',
    MOCK_LOCATION: () => 'A mock or fake location was detected. Please turn it off and try again.',
    OUTSIDE_GEOFENCE: () => `You are about ${verdict.distanceMeters} m from ${verdict.office.name}. Move closer to the office to continue.`,
  };
  throw new AppError(messages[verdict.reason](), 403, verdict.reason, { ...meta, employeeId: employee.employeeId });
}

const verificationFor = (identity, ctx, verdict, timestamp) => ({
  timestamp,
  verificationScore: identity.confidence,
  faceDistance: identity.faceDistance,
  verificationMethod: 'face_embedding',
  deviceId: ctx.deviceId,
  location: ctx.location && Number.isFinite(ctx.location.latitude)
    ? {
        latitude: ctx.location.latitude,
        longitude: ctx.location.longitude,
        accuracy: ctx.location.accuracy,
        distanceMeters: verdict && verdict.distanceMeters != null ? verdict.distanceMeters : undefined,
        officeId: verdict && verdict.office ? verdict.office._id : undefined,
      }
    : undefined,
});

async function findToday(employeeId, date) {
  return Attendance.findOne({ employeeId, date });
}

/** FR-006 / FR-007: check-in with duplicate prevention and shift rules. */
async function checkIn(imageBuffer, ctx = {}) {
  return scanLog.logged('check_in', ctx, async () => {
    const identity = await identifyEmployeeFromImage(imageBuffer);
    const { employee } = identity;
    const meta = { distance: identity.faceDistance, margin: identity.margin };
    const date = todayKey();

    const alreadyIn = (record) => ({
      alreadyCheckedIn: true, employee, attendance: record,
      faceDistance: identity.faceDistance, margin: identity.margin,
      message: `Welcome back, ${employee.name}! You were already marked present today.`,
    });

    // Not an error: a valid, expected state ("Already Checked In").
    const existing = await findToday(employee.employeeId, date);
    if (existing) return alreadyIn(existing);

    const verdict = await enforceGeofence(employee, ctx.location, meta);

    const shift = await calendar.getShiftForEmployee(employee);
    const holidays = await calendar.loadHolidays(date, date);
    const dayType = rules.dayTypeFor(date, shift, holidays);
    const now = new Date();
    const metrics = rules.computeMetrics({ shift, dayType, checkIn: now });

    let attendance;
    try {
      attendance = await Attendance.create({
        employeeId: employee.employeeId,
        date,
        checkIn: verificationFor(identity, ctx, verdict, now),
        status: 'present',
        shiftId: shift._id,
        shiftName: shift.name,
        dayType,
        ...metrics,
      });
    } catch (err) {
      // Two requests raced past the check above; the unique index stopped the
      // second one. Treat it as the friendly "already checked in" case.
      if (err.code === 11000) return alreadyIn(await findToday(employee.employeeId, date));
      throw err;
    }

    let message = `Welcome, ${employee.name}! You are marked present.`;
    if (dayType !== 'working') message = `Welcome, ${employee.name}! Today is a ${dayType === 'holiday' ? 'holiday' : 'non-working day'}; your time is recorded as extra work.`;
    else if (metrics.outcome === 'half_day') message = `Welcome, ${employee.name}! You are ${metrics.lateMinutes} minutes late, so today is recorded as a half day.`;
    else if (metrics.outcome === 'late') message = `Welcome, ${employee.name}! You are marked present, ${metrics.lateMinutes} minutes late.`;

    return {
      alreadyCheckedIn: false, employee, attendance, shift, message,
      faceDistance: identity.faceDistance, margin: identity.margin,
    };
  });
}

/** FR-008 / FR-009: check-out, validated against an existing check-in. */
async function checkOut(imageBuffer, ctx = {}) {
  return scanLog.logged('check_out', ctx, async () => {
    const identity = await identifyEmployeeFromImage(imageBuffer);
    const { employee } = identity;
    const meta = { distance: identity.faceDistance, margin: identity.margin, employeeId: employee.employeeId };
    const date = todayKey();
    const done = (record, already) => ({
      alreadyCheckedOut: already, employee, attendance: record,
      faceDistance: identity.faceDistance, margin: identity.margin,
      message: already ? "Today's checkout was already recorded." : `Goodbye, ${employee.name}! Have a great day.`,
    });

    const attendance = await findToday(employee.employeeId, date);
    if (!attendance || !attendance.checkIn) {
      // Rule 6: check-out requires an existing check-in.
      throw new AppError('No check-in record was found for today. Please check in first.', 400, 'NO_CHECKIN', meta);
    }
    // Rule 7: check-out can only be recorded once.
    if (attendance.checkOut && attendance.checkOut.timestamp) return done(attendance, true);

    const now = new Date();
    const sinceCheckIn = (now - attendance.checkIn.timestamp) / 60000;
    if (sinceCheckIn < env.minCheckoutGapMinutes) {
      throw new AppError('You just checked in. Please wait a moment before checking out.', 400, 'TOO_SOON', meta);
    }

    const verdict = await enforceGeofence(employee, ctx.location, meta);

    const shift = await calendar.getShiftForEmployee(employee, attendance.shiftId);
    const metrics = rules.computeMetrics({
      shift, dayType: attendance.dayType, checkIn: attendance.checkIn.timestamp, checkOut: now,
    });

    // Conditional update so two simultaneous check-outs cannot both win.
    const updated = await Attendance.findOneAndUpdate(
      { _id: attendance._id, checkOut: null },
      { $set: { checkOut: verificationFor(identity, ctx, verdict, now), status: 'checked_out', ...metrics } },
      { new: true }
    );
    if (!updated) return done(await findToday(employee.employeeId, date), true);

    return { ...done(updated, false), shift, faceDistance: identity.faceDistance };
  });
}

/** Attach employee name/department so tables are readable without N extra calls. */
async function withEmployeeInfo(records) {
  const ids = [...new Set(records.map((r) => r.employeeId))];
  const employees = await Employee.find({ employeeId: { $in: ids } }).select('employeeId name department').lean();
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  return records.map((r) => {
    const e = byId.get(r.employeeId);
    return { ...r, employeeName: e ? e.name : null, department: e ? e.department : null };
  });
}

async function listAttendance(filters = {}) {
  const query = {};
  if (filters.date) query.date = filters.date;
  if (filters.from || filters.to) query.date = { ...(filters.from && { $gte: filters.from }), ...(filters.to && { $lte: filters.to }) };
  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.status) query.status = filters.status;
  if (filters.outcome) query.outcome = filters.outcome;
  if (filters.month && filters.year) {
    const prefix = `${filters.year}-${String(filters.month).padStart(2, '0')}-`;
    query.date = { $gte: `${prefix}01`, $lte: `${prefix}31` };
  }
  if (filters.department) {
    const inDept = await Employee.find({ department: filters.department }).select('employeeId').lean();
    query.employeeId = { $in: inDept.map((e) => e.employeeId) };
  }

  const limit = Math.min(Number(filters.limit) || 500, 2000);
  const records = await Attendance.find(query).sort({ date: -1, 'checkIn.timestamp': 1 }).limit(limit).lean();
  return withEmployeeInfo(records);
}

/** Recalculate lateness/overtime/etc. after an admin changes times. */
async function refreshMetrics(record) {
  const employee = await Employee.findOne({ employeeId: record.employeeId }).select('shiftId').lean();
  const shift = await calendar.getShiftForEmployee(employee || {}, record.shiftId);
  Object.assign(record, rules.computeMetrics({
    shift,
    dayType: record.dayType,
    checkIn: record.checkIn && record.checkIn.timestamp,
    checkOut: record.checkOut && record.checkOut.timestamp,
  }));
}

/**
 * FR-011: admin correction. Every modification is written to the audit log
 * (Rule 8) with the previous and new values, and the shift rules are re-run.
 */
async function adminUpdateAttendance(attendanceId, updates, adminId) {
  const record = await Attendance.findById(attendanceId);
  if (!record) throw new AppError('Attendance record not found', 404, 'NOT_FOUND');

  const previousValue = record.toObject();

  const setTime = (field, value) => {
    const prior = record[field] ? record[field].toObject() : { verificationMethod: 'manual' };
    record[field] = { ...prior, timestamp: new Date(value) };
  };
  if (updates.checkIn && updates.checkIn.timestamp) setTime('checkIn', updates.checkIn.timestamp);
  if (updates.checkOut === null) record.checkOut = null;
  else if (updates.checkOut && updates.checkOut.timestamp) setTime('checkOut', updates.checkOut.timestamp);

  if (record.checkIn && record.checkOut && record.checkOut.timestamp <= record.checkIn.timestamp) {
    throw new AppError('Check-out must be after check-in', 400, 'INVALID_TIMES');
  }

  if (updates.status) record.status = updates.status;
  else if (updates.checkOut !== undefined) record.status = record.checkOut ? 'checked_out' : 'present';

  await refreshMetrics(record);
  record.edited = true;
  await record.save();

  await AuditLog.create({
    adminId, action: 'UPDATE_ATTENDANCE', entity: 'Attendance', entityId: String(attendanceId),
    previousValue, newValue: record.toObject(),
  });
  return record;
}

/** Admin enters a day that was missed entirely (forgot to check in, phone broke...). */
async function adminCreateAttendance({ employeeId, date, checkIn, checkOut, status }, adminId) {
  if (!isDateKey(date)) throw new AppError('Date must be YYYY-MM-DD', 400, 'INVALID_DATE');
  if (date > todayKey()) throw new AppError('Cannot record attendance for a future date', 400, 'FUTURE_DATE');

  const employee = await Employee.findOne({ employeeId }).select('employeeId shiftId').lean();
  if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  if (checkOut && new Date(checkOut) <= new Date(checkIn)) {
    throw new AppError('Check-out must be after check-in', 400, 'INVALID_TIMES');
  }

  const shift = await calendar.getShiftForEmployee(employee);
  const holidays = await calendar.loadHolidays(date, date);
  const dayType = rules.dayTypeFor(date, shift, holidays);
  const metrics = rules.computeMetrics({ shift, dayType, checkIn: new Date(checkIn), checkOut: checkOut && new Date(checkOut) });

  const record = await Attendance.create({
    employeeId, date,
    checkIn: { timestamp: new Date(checkIn), verificationMethod: 'manual' },
    checkOut: checkOut ? { timestamp: new Date(checkOut), verificationMethod: 'manual' } : null,
    status: status || (checkOut ? 'checked_out' : 'present'),
    shiftId: shift._id, shiftName: shift.name, dayType, ...metrics, edited: true,
  });

  await AuditLog.create({
    adminId, action: 'CREATE_ATTENDANCE', entity: 'Attendance', entityId: String(record._id),
    previousValue: null, newValue: record.toObject(),
  });
  return record;
}

module.exports = {
  AttendanceError,
  identifyEmployeeFromImage,
  checkIn,
  checkOut,
  listAttendance,
  adminUpdateAttendance,
  adminCreateAttendance,
  formatTime,
};
