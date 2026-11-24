const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const calendar = require('./calendarService');
const rules = require('./rules');
const env = require('../config/environment');
const { AppError } = require('../utils/errors');
const { todayKey, isDateKey, eachDate } = require('../utils/date');

const LEAVE_TYPES = Leave.LEAVE_TYPES;
const ACTIVE = ['pending', 'approved']; // statuses that count against balance and overlap

const allowanceFor = (type) => (type === 'unpaid' ? null : env.leaveAllowances[type] ?? 0);

/** Days taken (approved) and waiting (pending) per type for a calendar year. */
async function usage(employeeId, year) {
  const leaves = await Leave.find({
    employeeId, status: { $in: ACTIVE }, startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  }).lean();

  const out = {};
  for (const type of LEAVE_TYPES) out[type] = { used: 0, pending: 0 };
  for (const l of leaves) out[l.type][l.status === 'approved' ? 'used' : 'pending'] += l.days;
  return out;
}

async function getBalance(employeeId, year = Number(todayKey().slice(0, 4))) {
  const taken = await usage(employeeId, year);
  return LEAVE_TYPES.map((type) => {
    const allowance = allowanceFor(type);
    const { used, pending } = taken[type];
    return { type, allowance, used, pending, remaining: allowance === null ? null : allowance - used - pending };
  });
}

/**
 * Create a leave request. Days are counted as working days under the
 * employee's shift, so weekends and public holidays do not use up balance.
 */
async function createLeave(input, { adminId, autoApprove = false } = {}) {
  const { employeeId, type, startDate, endDate, reason = '', requestedVia = 'admin', faceDistance } = input;

  if (!LEAVE_TYPES.includes(type)) throw new AppError('Unknown leave type', 400, 'INVALID_TYPE');
  if (!isDateKey(startDate) || !isDateKey(endDate)) throw new AppError('Dates must be YYYY-MM-DD', 400, 'INVALID_DATE');
  if (endDate < startDate) throw new AppError('End date cannot be before the start date', 400, 'INVALID_RANGE');
  if (eachDate(startDate, endDate).length > 92) throw new AppError('A single request cannot exceed 92 days', 400, 'RANGE_TOO_LONG');
  if (requestedVia === 'face_app' && startDate < todayKey()) {
    throw new AppError('Leave cannot start in the past. Please ask your admin to record it.', 400, 'PAST_DATE');
  }

  const employee = await Employee.findOne({ employeeId }).select('employeeId name status shiftId').lean();
  if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  if (employee.status !== 'active') throw new AppError('This employee account is not active', 403, 'EMPLOYEE_INACTIVE');

  const shift = await calendar.getShiftForEmployee(employee);
  const holidays = await calendar.loadHolidays(startDate, endDate);
  const days = rules.countLeaveDays({ startDate, endDate, shift, holidays });
  if (days === 0) throw new AppError('The selected dates contain no working days', 400, 'NO_WORKING_DAYS');

  const overlapping = await Leave.findOne({
    employeeId, status: { $in: ACTIVE }, startDate: { $lte: endDate }, endDate: { $gte: startDate },
  }).lean();
  if (overlapping) {
    throw new AppError(`Overlaps an existing ${overlapping.status} leave (${overlapping.startDate} to ${overlapping.endDate})`, 409, 'OVERLAP');
  }

  const allowance = allowanceFor(type);
  if (allowance !== null) {
    const { used, pending } = (await usage(employeeId, startDate.slice(0, 4)))[type];
    const remaining = allowance - used - pending;
    if (days > remaining) {
      throw new AppError(`Not enough ${type} leave: ${days} day(s) requested, ${Math.max(remaining, 0)} remaining`, 400, 'INSUFFICIENT_BALANCE');
    }
  }

  const leave = await Leave.create({
    employeeId, type, startDate, endDate, days, reason, requestedVia, faceDistance,
    status: autoApprove ? 'approved' : 'pending',
    ...(autoApprove && { decidedBy: adminId, decidedAt: new Date(), decisionNote: 'Recorded by admin' }),
  });

  if (adminId) {
    await AuditLog.create({
      adminId, action: 'CREATE_LEAVE', entity: 'Leave', entityId: String(leave._id), previousValue: null, newValue: leave.toObject(),
    });
  }
  return leave;
}

async function decide(id, { status, note = '' }, adminId) {
  const leave = await Leave.findById(id);
  if (!leave) throw new AppError('Leave request not found', 404, 'NOT_FOUND');
  if (leave.status !== 'pending') throw new AppError(`This request is already ${leave.status}`, 409, 'NOT_PENDING');

  const previousValue = leave.toObject();
  Object.assign(leave, { status, decisionNote: note, decidedBy: adminId, decidedAt: new Date() });
  await leave.save();

  await AuditLog.create({
    adminId, action: `LEAVE_${status.toUpperCase()}`, entity: 'Leave', entityId: String(id), previousValue, newValue: leave.toObject(),
  });
  return leave;
}

async function cancel(id, adminId) {
  const leave = await Leave.findById(id);
  if (!leave) throw new AppError('Leave request not found', 404, 'NOT_FOUND');
  if (!ACTIVE.includes(leave.status)) throw new AppError(`A ${leave.status} request cannot be cancelled`, 409, 'NOT_CANCELLABLE');

  const previousValue = leave.toObject();
  leave.status = 'cancelled';
  leave.decidedBy = adminId;
  leave.decidedAt = new Date();
  await leave.save();

  await AuditLog.create({
    adminId, action: 'LEAVE_CANCELLED', entity: 'Leave', entityId: String(id), previousValue, newValue: leave.toObject(),
  });
  return leave;
}

async function listLeaves({ status, employeeId, year } = {}) {
  const query = {};
  if (status) query.status = status;
  if (employeeId) query.employeeId = employeeId;
  if (year) query.startDate = { $gte: `${year}-01-01`, $lte: `${year}-12-31` };

  const leaves = await Leave.find(query).sort({ createdAt: -1 }).limit(500).lean();
  const employees = await Employee.find({ employeeId: { $in: [...new Set(leaves.map((l) => l.employeeId))] } })
    .select('employeeId name department').lean();
  const byId = new Map(employees.map((e) => [e.employeeId, e]));
  return leaves.map((l) => ({ ...l, employeeName: byId.get(l.employeeId)?.name || null, department: byId.get(l.employeeId)?.department || null }));
}

/**
 * Approved leave expanded to individual days: Map employeeId -> Map date -> type.
 * Used by the dashboard and reports to tell "absent" from "on leave".
 */
async function approvedLeaveByDay(startKey, endKey, employeeIds) {
  const query = { status: 'approved', startDate: { $lte: endKey }, endDate: { $gte: startKey } };
  if (employeeIds) query.employeeId = { $in: employeeIds };
  const leaves = await Leave.find(query).lean();

  const out = new Map();
  for (const l of leaves) {
    if (!out.has(l.employeeId)) out.set(l.employeeId, new Map());
    const days = out.get(l.employeeId);
    const from = l.startDate > startKey ? l.startDate : startKey;
    const to = l.endDate < endKey ? l.endDate : endKey;
    for (const d of eachDate(from, to)) days.set(d, l.type);
  }
  return out;
}

module.exports = { LEAVE_TYPES, getBalance, createLeave, decide, cancel, listLeaves, approvedLeaveByDay };
