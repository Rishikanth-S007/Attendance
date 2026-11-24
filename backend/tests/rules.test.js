const test = require('node:test');
const assert = require('node:assert/strict');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tz = require('dayjs/plugin/timezone');

process.env.APP_TIMEZONE = 'Asia/Kolkata';
dayjs.extend(utc);
dayjs.extend(tz);

const rules = require('../src/services/rules');
const { BUILTIN_SHIFT: shift } = rules;

// Local (Asia/Kolkata) wall-clock time -> Date
const at = (day, hhmm) => dayjs.tz(`${day} ${hhmm}`, 'Asia/Kolkata').toDate();

// 2026-11-23 is a Monday, 2026-11-28 a Saturday, 2026-11-29 a Sunday.
const MON = '2026-11-23';

test('dayTypeFor: working day, weekend and holiday', () => {
  assert.equal(rules.dayTypeFor(MON, shift, new Set()), 'working');
  assert.equal(rules.dayTypeFor('2026-11-28', shift, new Set()), 'weekend');
  assert.equal(rules.dayTypeFor('2026-11-29', shift, new Set()), 'weekend');
  assert.equal(rules.dayTypeFor(MON, shift, new Set([MON])), 'holiday');
});

test('custom working days (Mon-Sat shift)', () => {
  const sixDay = { ...shift, workingDays: [1, 2, 3, 4, 5, 6] };
  assert.equal(rules.dayTypeFor('2026-11-28', sixDay, new Set()), 'working');
  assert.equal(rules.dayTypeFor('2026-11-29', sixDay, new Set()), 'weekend');
});

test('on time, including inside the grace window', () => {
  assert.equal(rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '08:55') }).outcome, 'on_time');
  const grace = rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '09:10') });
  assert.equal(grace.outcome, 'on_time');
  assert.equal(grace.lateMinutes, 0);
});

test('late counts the whole delay once grace is exceeded', () => {
  const m = rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '09:11') });
  assert.equal(m.outcome, 'late');
  assert.equal(m.lateMinutes, 11);
});

test('very late arrival is a half day', () => {
  const m = rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '11:05') });
  assert.equal(m.outcome, 'half_day');
  assert.equal(m.lateMinutes, 125);
});

test('full day with overtime', () => {
  const m = rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '09:00'), checkOut: at(MON, '19:00') });
  assert.equal(m.outcome, 'on_time');
  assert.equal(m.workedMinutes, 600);
  assert.equal(m.overtimeMinutes, 60);
  assert.equal(m.earlyLeaveMinutes, 0);
});

test('overtime below the threshold is ignored', () => {
  const m = rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '09:00'), checkOut: at(MON, '18:20') });
  assert.equal(m.overtimeMinutes, 0);
});

test('early leave is measured against the shift end', () => {
  const m = rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '09:00'), checkOut: at(MON, '17:15') });
  assert.equal(m.earlyLeaveMinutes, 45);
  assert.equal(m.outcome, 'on_time');
});

test('working under the half-day minimum downgrades to half day', () => {
  const m = rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '09:00'), checkOut: at(MON, '12:30') });
  assert.equal(m.workedMinutes, 210);
  assert.equal(m.outcome, 'half_day');
});

test('late check-in followed by a normal day stays late, not downgraded', () => {
  const m = rules.computeMetrics({ shift, dayType: 'working', checkIn: at(MON, '09:30'), checkOut: at(MON, '18:00') });
  assert.equal(m.outcome, 'late');
});

test('half-day rules can be disabled with 0', () => {
  const lenient = { ...shift, halfDayLateMinutes: 0, halfDayWorkedMinutes: 0 };
  const m = rules.computeMetrics({ shift: lenient, dayType: 'working', checkIn: at(MON, '12:00'), checkOut: at(MON, '13:00') });
  assert.equal(m.outcome, 'late');
});

test('weekend work has no lateness and is all overtime', () => {
  const sat = '2026-11-28';
  const m = rules.computeMetrics({ shift, dayType: 'weekend', checkIn: at(sat, '13:00'), checkOut: at(sat, '16:00') });
  assert.equal(m.outcome, 'on_time');
  assert.equal(m.lateMinutes, 0);
  assert.equal(m.overtimeMinutes, 180);
});

test('decideMatch: distance and margin gates', () => {
  const limits = { maxDistance: 0.5, minMargin: 0.04 };
  assert.deepEqual(rules.decideMatch({ matched: true, distance: 0.3, margin: 0.2 }, limits), { accepted: true, code: null });
  assert.equal(rules.decideMatch({ matched: true, distance: 0.55, margin: 0.3 }, limits).code, 'FACE_NOT_RECOGNIZED');
  assert.equal(rules.decideMatch({ matched: true, distance: 0.4, margin: 0.01 }, limits).code, 'FACE_AMBIGUOUS');
  assert.equal(rules.decideMatch({ matched: false }, limits).code, 'FACE_NOT_RECOGNIZED');
  // a lone enrolled employee has no runner-up, so no margin test applies
  assert.equal(rules.decideMatch({ matched: true, distance: 0.3, margin: null }, limits).accepted, true);
});

test('countLeaveDays skips weekends and holidays', () => {
  // Fri 27 Nov -> Tue 1 Dec: Fri, (Sat, Sun), Mon, Tue = 3 working days
  assert.equal(rules.countLeaveDays({ startDate: '2026-11-27', endDate: '2026-12-01', shift, holidays: new Set() }), 3);
  // a holiday on Monday 30 Nov removes one more
  assert.equal(rules.countLeaveDays({ startDate: '2026-11-27', endDate: '2026-12-01', shift, holidays: new Set(['2026-11-30']) }), 2);
});

test('rangesOverlap', () => {
  assert.equal(rules.rangesOverlap('2026-11-01', '2026-11-05', '2026-11-05', '2026-11-09'), true);
  assert.equal(rules.rangesOverlap('2026-11-01', '2026-11-04', '2026-11-05', '2026-11-09'), false);
});

test('summarizeEmployee counts absences, leave, holidays and ignores the future', () => {
  const dates = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-30'];
  const records = new Map([
    ['2026-11-23', { outcome: 'on_time', workedMinutes: 540, overtimeMinutes: 0, lateMinutes: 0 }],
    ['2026-11-24', { outcome: 'late', workedMinutes: 500, overtimeMinutes: 0, lateMinutes: 20 }],
    ['2026-11-26', { outcome: 'half_day', workedMinutes: 200, overtimeMinutes: 0, lateMinutes: 0 }],
  ]);
  const leave = new Map([['2026-11-25', 'casual']]);
  const s = rules.summarizeEmployee({
    dates, shift, holidays: new Set(['2026-11-27']), recordsByDate: records, leaveByDate: leave, asOf: '2026-11-29',
  });
  assert.equal(s.workingDays, 4); // 23,24,25,26 (27 is a holiday, 28 a Saturday, 30 is after asOf)
  assert.equal(s.onTime, 1);
  assert.equal(s.late, 1);
  assert.equal(s.halfDay, 1);
  assert.equal(s.onLeave, 1);
  assert.equal(s.absent, 0);
  assert.equal(s.holidays, 1);
  assert.equal(s.weekends, 1);
  assert.equal(s.lateMinutes, 20);
  assert.equal(s.workedMinutes, 1240);
  assert.equal(s.attendancePercent, 100); // 3 attended of (4 working - 1 leave)
});

test('summarizeEmployee marks missing working days absent', () => {
  const s = rules.summarizeEmployee({
    dates: ['2026-11-23', '2026-11-24'], shift, holidays: new Set(),
    recordsByDate: new Map(), leaveByDate: new Map(), asOf: '2026-11-24',
  });
  assert.equal(s.absent, 2);
  assert.equal(s.attendancePercent, 0);
});
