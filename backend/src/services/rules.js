// Business rules as pure functions: no database, no HTTP. Everything that
// decides "late", "half day", "absent", leave days or "accept this face"
// lives here so it can be tested exhaustively without any infrastructure.
const { minutesOfDay, parseHHmm, weekdayOf, eachDate } = require('../utils/date');

// Used when no shift has been configured at all.
const BUILTIN_SHIFT = Object.freeze({
  name: 'General',
  startTime: '09:00',
  endTime: '18:00',
  graceMinutes: 10,
  halfDayLateMinutes: 120,
  halfDayWorkedMinutes: 240,
  overtimeAfterMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
});

/** 'working' | 'weekend' | 'holiday' for a calendar day under a given shift. */
function dayTypeFor(dateKey, shift, holidays) {
  if (holidays && holidays.has(dateKey)) return 'holiday';
  if (!shift.workingDays.includes(weekdayOf(dateKey))) return 'weekend';
  return 'working';
}

/**
 * Lateness, early leave, hours worked, overtime and the day's outcome.
 *
 *  - Arriving up to `graceMinutes` after the start is on time. Beyond that the
 *    whole delay (measured from the start time) is counted as late minutes.
 *  - Arriving `halfDayLateMinutes` or more after the start makes it a half day.
 *  - Working fewer than `halfDayWorkedMinutes` also makes it a half day.
 *  - Time past the end counts as overtime only once it reaches
 *    `overtimeAfterMinutes`. Work on a weekend or holiday is all overtime.
 *  - A threshold of 0 for either half-day setting disables that rule.
 */
function computeMetrics({ shift, dayType, checkIn, checkOut }) {
  const metrics = { outcome: 'on_time', lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, overtimeMinutes: 0 };
  const start = parseHHmm(shift.startTime);
  const end = parseHHmm(shift.endTime);

  if (checkIn && dayType === 'working') {
    const late = Math.max(0, minutesOfDay(checkIn) - start);
    if (late > shift.graceMinutes) {
      metrics.lateMinutes = late;
      metrics.outcome = 'late';
    }
    if (shift.halfDayLateMinutes > 0 && late >= shift.halfDayLateMinutes) metrics.outcome = 'half_day';
  }

  if (checkIn && checkOut) {
    metrics.workedMinutes = Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 60000));

    if (dayType === 'working') {
      const outMinutes = minutesOfDay(checkOut);
      metrics.earlyLeaveMinutes = Math.max(0, end - outMinutes);
      const over = Math.max(0, outMinutes - end);
      metrics.overtimeMinutes = over >= shift.overtimeAfterMinutes && over > 0 ? over : 0;
      if (shift.halfDayWorkedMinutes > 0 && metrics.workedMinutes < shift.halfDayWorkedMinutes) {
        metrics.outcome = 'half_day';
      }
    } else {
      metrics.overtimeMinutes = metrics.workedMinutes;
    }
  }

  return metrics;
}

/**
 * Accept or reject the face engine's best candidate.
 * Two independent tests: the match must be close enough, and clearly closer
 * than the runner-up (so look-alikes are rejected rather than guessed).
 */
function decideMatch(result, { maxDistance, minMargin }) {
  if (!result || !result.matched || result.distance == null) {
    return { accepted: false, code: 'FACE_NOT_RECOGNIZED' };
  }
  if (result.distance > maxDistance) return { accepted: false, code: 'FACE_NOT_RECOGNIZED' };
  if (result.margin != null && result.margin < minMargin) return { accepted: false, code: 'FACE_AMBIGUOUS' };
  return { accepted: true, code: null };
}

const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;

/** Working days in [startDate, endDate]: weekends and holidays do not use up leave. */
function countLeaveDays({ startDate, endDate, shift, holidays }) {
  return eachDate(startDate, endDate).filter((d) => dayTypeFor(d, shift, holidays) === 'working').length;
}

/**
 * Month/period summary for one employee.
 *  - recordsByDate: Map date -> attendance record
 *  - leaveByDate:   Map date -> leave type (approved leave only)
 * Days after `asOf` are ignored, so a half-finished month is not full of "absences".
 */
function summarizeEmployee({ dates, shift, holidays, recordsByDate, leaveByDate, asOf }) {
  const s = {
    workingDays: 0, onTime: 0, late: 0, halfDay: 0, absent: 0, onLeave: 0,
    holidays: 0, weekends: 0, lateMinutes: 0, workedMinutes: 0, overtimeMinutes: 0, attendedDays: 0,
  };

  for (const date of dates) {
    if (asOf && date > asOf) continue;
    const dayType = dayTypeFor(date, shift, holidays);
    const record = recordsByDate.get(date);

    if (record) {
      s.attendedDays += 1;
      s.workedMinutes += record.workedMinutes || 0;
      s.overtimeMinutes += record.overtimeMinutes || 0;
    }

    if (dayType === 'holiday') { s.holidays += 1; continue; }
    if (dayType === 'weekend') { s.weekends += 1; continue; }

    s.workingDays += 1;
    if (record) {
      if (record.outcome === 'late') s.late += 1;
      else if (record.outcome === 'half_day') s.halfDay += 1;
      else s.onTime += 1;
      s.lateMinutes += record.lateMinutes || 0;
    } else if (leaveByDate.has(date)) {
      s.onLeave += 1;
    } else {
      s.absent += 1;
    }
  }

  const expected = s.workingDays - s.onLeave;
  const attendedWorking = s.onTime + s.late + s.halfDay;
  s.attendancePercent = expected > 0 ? Number(((attendedWorking / expected) * 100).toFixed(1)) : null;
  return s;
}

module.exports = {
  BUILTIN_SHIFT, dayTypeFor, computeMetrics, decideMatch, rangesOverlap, countLeaveDays, summarizeEmployee,
};
