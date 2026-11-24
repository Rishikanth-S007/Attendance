const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const calendar = require('./calendarService');
const leaveService = require('./leaveService');
const attendanceService = require('./attendanceService');
const rules = require('./rules');
const { todayKey, monthRange } = require('../utils/date');

/**
 * Where every active employee stands today. Computed live from the records,
 * shifts, holidays and approved leave, so it cannot drift out of sync.
 */
async function snapshot() {
  const date = todayKey();
  const [employees, shifts, holidays, records, leaves] = await Promise.all([
    Employee.find({ status: 'active' }).select('employeeId department shiftId').lean(),
    calendar.loadShifts(),
    calendar.loadHolidays(date, date),
    Attendance.find({ date }).lean(),
    leaveService.approvedLeaveByDay(date, date),
  ]);

  const recordByEmployee = new Map(records.map((r) => [r.employeeId, r]));
  const rows = employees.map((e) => {
    const shift = calendar.pickShift(shifts, e.shiftId);
    const dayType = rules.dayTypeFor(date, shift, holidays);
    const record = recordByEmployee.get(e.employeeId);
    const onLeave = !record && leaves.has(e.employeeId) && leaves.get(e.employeeId).has(date);

    let state;
    if (record) state = 'attended';
    else if (dayType !== 'working') state = 'off';
    else if (onLeave) state = 'on_leave';
    else state = 'absent';
    return { employee: e, record, dayType, state };
  });
  return { date, rows, holidays };
}

const emptyCounts = () => ({ total: 0, present: 0, late: 0, halfDay: 0, checkedOut: 0, onLeave: 0, absent: 0 });

function tally(counts, row) {
  counts.total += 1;
  if (row.state === 'attended') {
    counts.present += 1;
    if (row.record.outcome === 'late') counts.late += 1;
    if (row.record.outcome === 'half_day') counts.halfDay += 1;
    if (row.record.status === 'checked_out') counts.checkedOut += 1;
  } else if (row.state === 'on_leave') counts.onLeave += 1;
  else if (row.state === 'absent') counts.absent += 1;
}

// FR-012: dashboard analytics.
async function summary() {
  const { date, rows, holidays } = await snapshot();
  const counts = emptyCounts();
  rows.forEach((row) => tally(counts, row));

  // Who was expected today: everyone who came in plus everyone who should have.
  const expected = counts.present + counts.absent;
  const holiday = holidays.has(date) ? (await Holiday.findOne({ date }).lean())?.name || 'Holiday' : null;

  return {
    date,
    totalEmployees: counts.total,
    present: counts.present,
    late: counts.late,
    halfDay: counts.halfDay,
    onLeave: counts.onLeave,
    absent: counts.absent, // working today, no check-in and no approved leave
    checkedOut: counts.checkedOut,
    holiday,
    attendancePercentage: expected > 0 ? Number(((counts.present / expected) * 100).toFixed(2)) : 0,
  };
}

async function todaysAttendance() {
  return attendanceService.listAttendance({ date: todayKey() });
}

async function monthly(year, month) {
  const { start, end } = monthRange(year, month);
  const records = await Attendance.find({ date: { $gte: start, $lte: end } }).lean();
  const byDate = {};
  for (const r of records) {
    const day = (byDate[r.date] = byDate[r.date] || { present: 0, late: 0, halfDay: 0, checkedOut: 0 });
    day.present += 1;
    if (r.outcome === 'late') day.late += 1;
    if (r.outcome === 'half_day') day.halfDay += 1;
    if (r.status === 'checked_out') day.checkedOut += 1;
  }
  return byDate;
}

async function byDepartment() {
  const { rows } = await snapshot();
  const stats = {};
  for (const row of rows) {
    const dept = row.employee.department || 'Unassigned';
    stats[dept] = stats[dept] || emptyCounts();
    tally(stats[dept], row);
  }
  return stats;
}

module.exports = { summary, todaysAttendance, monthly, byDepartment };
