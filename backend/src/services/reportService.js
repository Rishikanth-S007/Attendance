const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const calendar = require('./calendarService');
const leaveService = require('./leaveService');
const rules = require('./rules');
const { AppError } = require('../utils/errors');
const { todayKey, formatTime, isDateKey, eachDate, monthRange } = require('../utils/date');

const MAX_RANGE_DAYS = 366;

function resolveRange({ startDate, endDate }) {
  let start = startDate;
  let end = endDate;
  if (!start && !end) {
    const [y, m] = todayKey().split('-');
    ({ start, end } = monthRange(y, m)); // default: the current month
  }
  if (!isDateKey(start) || !isDateKey(end)) throw new AppError('startDate and endDate must be YYYY-MM-DD', 400, 'INVALID_DATE');
  if (end < start) throw new AppError('endDate cannot be before startDate', 400, 'INVALID_RANGE');
  if (eachDate(start, end).length > MAX_RANGE_DAYS) throw new AppError(`Range cannot exceed ${MAX_RANGE_DAYS} days`, 400, 'RANGE_TOO_LONG');
  return { start, end };
}

async function employeeFilter({ employeeId, department }) {
  const query = { status: { $in: ['active', 'inactive'] } };
  if (employeeId) query.employeeId = employeeId;
  if (department) query.department = department;
  return Employee.find(query).select('employeeId name department shiftId status').sort({ employeeId: 1 }).lean();
}

const hours = (minutes) => Number(((minutes || 0) / 60).toFixed(2));
const time = (stamp) => (stamp ? formatTime(stamp) : '');

const OUTCOME_LABEL = { on_time: 'On time', late: 'Late', half_day: 'Half day' };
const STATUS_LABEL = { present: 'Present', checked_out: 'Checked out', absent: 'Absent', on_leave: 'On leave' };

/** One row per attendance record in the range (the "register"). */
async function attendanceRegister(params) {
  const { start, end } = resolveRange(params);
  const employees = await employeeFilter(params);
  const byId = new Map(employees.map((e) => [e.employeeId, e]));

  const records = await Attendance.find({
    date: { $gte: start, $lte: end }, employeeId: { $in: [...byId.keys()] },
  }).sort({ date: 1, employeeId: 1 }).lean();

  const columns = [
    { key: 'date', header: 'Date', width: 9 },
    { key: 'employeeId', header: 'Employee ID', width: 9 },
    { key: 'name', header: 'Name', width: 14 },
    { key: 'department', header: 'Department', width: 11 },
    { key: 'shift', header: 'Shift', width: 9 },
    { key: 'checkIn', header: 'Check-in', width: 8 },
    { key: 'checkOut', header: 'Check-out', width: 8 },
    { key: 'outcome', header: 'Outcome', width: 8 },
    { key: 'status', header: 'Status', width: 9 },
    { key: 'lateMinutes', header: 'Late (min)', width: 7 },
    { key: 'earlyLeaveMinutes', header: 'Early leave (min)', width: 8 },
    { key: 'workedHours', header: 'Worked (h)', width: 7 },
    { key: 'overtimeHours', header: 'Overtime (h)', width: 8 },
  ];

  const rows = records.map((r) => {
    const e = byId.get(r.employeeId);
    return {
      date: r.date,
      employeeId: r.employeeId,
      name: e ? e.name : '',
      department: (e && e.department) || '',
      shift: r.shiftName || '',
      checkIn: time(r.checkIn && r.checkIn.timestamp),
      checkOut: time(r.checkOut && r.checkOut.timestamp),
      outcome: OUTCOME_LABEL[r.outcome] || '',
      status: STATUS_LABEL[r.status] || r.status,
      lateMinutes: r.lateMinutes || 0,
      earlyLeaveMinutes: r.earlyLeaveMinutes || 0,
      workedHours: hours(r.workedMinutes),
      overtimeHours: hours(r.overtimeMinutes),
    };
  });

  return { title: 'Attendance Register', subtitle: `${start} to ${end}`, columns, rows, range: { start, end } };
}

/** One row per employee: attendance, lateness, leave and absences over the range. */
async function monthlySummary(params) {
  const { start, end } = resolveRange(params);
  const employees = await employeeFilter(params);
  const ids = employees.map((e) => e.employeeId);
  const dates = eachDate(start, end);
  const asOf = todayKey();

  const [shifts, holidays, records, leaves] = await Promise.all([
    calendar.loadShifts(),
    calendar.loadHolidays(start, end),
    Attendance.find({ date: { $gte: start, $lte: end }, employeeId: { $in: ids } }).lean(),
    leaveService.approvedLeaveByDay(start, end, ids),
  ]);

  const recordsByEmployee = new Map();
  for (const r of records) {
    if (!recordsByEmployee.has(r.employeeId)) recordsByEmployee.set(r.employeeId, new Map());
    recordsByEmployee.get(r.employeeId).set(r.date, r);
  }

  const columns = [
    { key: 'employeeId', header: 'Employee ID', width: 9 },
    { key: 'name', header: 'Name', width: 15 },
    { key: 'department', header: 'Department', width: 11 },
    { key: 'workingDays', header: 'Working days', width: 7 },
    { key: 'onTime', header: 'On time', width: 6 },
    { key: 'late', header: 'Late', width: 5 },
    { key: 'halfDay', header: 'Half days', width: 6 },
    { key: 'onLeave', header: 'On leave', width: 6 },
    { key: 'absent', header: 'Absent', width: 6 },
    { key: 'lateMinutes', header: 'Late (min)', width: 7 },
    { key: 'workedHours', header: 'Worked (h)', width: 7 },
    { key: 'overtimeHours', header: 'Overtime (h)', width: 8 },
    { key: 'attendancePercent', header: 'Attendance %', width: 8 },
  ];

  const rows = employees.map((e) => {
    const s = rules.summarizeEmployee({
      dates,
      shift: calendar.pickShift(shifts, e.shiftId),
      holidays,
      recordsByDate: recordsByEmployee.get(e.employeeId) || new Map(),
      leaveByDate: leaves.get(e.employeeId) || new Map(),
      asOf,
    });
    return {
      employeeId: e.employeeId,
      name: e.name,
      department: e.department || '',
      workingDays: s.workingDays,
      onTime: s.onTime,
      late: s.late,
      halfDay: s.halfDay,
      onLeave: s.onLeave,
      absent: s.absent,
      lateMinutes: s.lateMinutes,
      workedHours: hours(s.workedMinutes),
      overtimeHours: hours(s.overtimeMinutes),
      attendancePercent: s.attendancePercent === null ? '' : s.attendancePercent,
    };
  });

  return { title: 'Attendance Summary', subtitle: `${start} to ${end}`, columns, rows, range: { start, end } };
}

module.exports = { attendanceRegister, monthlySummary };
