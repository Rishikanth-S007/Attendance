const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const env = require('../config/environment');

dayjs.extend(utc);
dayjs.extend(timezone);

// Attendance records are keyed by calendar day (YYYY-MM-DD) in the
// organisation's timezone, so a check-in at 00:30 local time lands on the
// right day even when the server itself runs in UTC (e.g. inside Docker).
const tz = () => env.timezone;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  // Round-trip through a real date so impossible days (2026-13-40, 2026-02-30) are rejected.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayKey() {
  return dayjs().tz(tz()).format('YYYY-MM-DD');
}

function dateKey(date) {
  return dayjs(date).tz(tz()).format('YYYY-MM-DD');
}

function formatTime(date) {
  return dayjs(date).tz(tz()).format('hh:mm A');
}

/** Minutes since local midnight for a timestamp, in the organisation's timezone. */
function minutesOfDay(date) {
  const d = dayjs(date).tz(tz());
  return d.hour() * 60 + d.minute();
}

/** "HH:mm" -> minutes since midnight. */
function parseHHmm(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD key, independent of server timezone. */
function weekdayOf(key) {
  return dayjs.utc(key).day();
}

/** Every YYYY-MM-DD from start to end inclusive. */
function eachDate(startKey, endKey) {
  const out = [];
  let cursor = dayjs.utc(startKey);
  const end = dayjs.utc(endKey);
  while (!cursor.isAfter(end, 'day')) {
    out.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return out;
}

function monthRange(year, month) {
  const start = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-01`);
  return { start: start.format('YYYY-MM-DD'), end: start.endOf('month').format('YYYY-MM-DD') };
}

module.exports = {
  todayKey, dateKey, formatTime, minutesOfDay, parseHHmm,
  weekdayOf, eachDate, monthRange, isDateKey,
};
