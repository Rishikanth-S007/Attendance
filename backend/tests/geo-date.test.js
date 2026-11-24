const test = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_TIMEZONE = 'Asia/Kolkata';
const { haversineMeters, evaluateGeofence } = require('../src/utils/geo');
const date = require('../src/utils/date');
const { escapeRegex } = require('../src/utils/text');

// Roughly Bengaluru city centre
const OFFICE = { _id: 'o1', name: 'HQ', latitude: 12.9716, longitude: 77.5946, radiusMeters: 150 };

test('haversine: zero distance and a known ~111 km per degree of latitude', () => {
  assert.equal(Math.round(haversineMeters(12.9, 77.5, 12.9, 77.5)), 0);
  const d = haversineMeters(0, 0, 1, 0);
  assert.ok(d > 110000 && d < 112000, `got ${d}`);
});

test('geofence is skipped when no offices exist', () => {
  const r = evaluateGeofence({ offices: [], location: null });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
});

test('inside the radius passes, outside fails', () => {
  const near = { latitude: 12.9720, longitude: 77.5950, accuracy: 10 }; // ~60 m away
  const far = { latitude: 12.9800, longitude: 77.6100, accuracy: 10 }; // ~1.9 km away
  assert.equal(evaluateGeofence({ offices: [OFFICE], location: near }).ok, true);
  const out = evaluateGeofence({ offices: [OFFICE], location: far });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'OUTSIDE_GEOFENCE');
  assert.ok(out.distanceMeters > 1500);
});

test('location is required once offices are configured', () => {
  assert.equal(evaluateGeofence({ offices: [OFFICE], location: undefined }).reason, 'LOCATION_REQUIRED');
  assert.equal(evaluateGeofence({ offices: [OFFICE], location: { latitude: NaN, longitude: 1 } }).reason, 'LOCATION_REQUIRED');
});

test('mock (fake GPS) locations are rejected', () => {
  const r = evaluateGeofence({ offices: [OFFICE], location: { latitude: 12.9716, longitude: 77.5946, accuracy: 5, mocked: true } });
  assert.equal(r.reason, 'MOCK_LOCATION');
});

test('accuracy is forgiven, but only up to the cap', () => {
  // ~220 m from the office: outside 150 m, but a 100 m uncertainty brings it inside
  const loc = { latitude: 12.9716 + 0.00198, longitude: 77.5946, accuracy: 100 };
  const d = haversineMeters(loc.latitude, loc.longitude, OFFICE.latitude, OFFICE.longitude);
  assert.ok(d > 200 && d < 240, `distance ${d}`);
  assert.equal(evaluateGeofence({ offices: [OFFICE], location: loc, maxAccuracyMeters: 100 }).ok, true);
  // a hugely inaccurate fix cannot be used to claim presence from far away
  const loose = { latitude: 12.9716 + 0.01, longitude: 77.5946, accuracy: 5000 };
  assert.equal(evaluateGeofence({ offices: [OFFICE], location: loose, maxAccuracyMeters: 100 }).ok, false);
});

test('nearest of several offices is used', () => {
  const branch = { _id: 'o2', name: 'Branch', latitude: 13.0827, longitude: 80.2707, radiusMeters: 200 }; // Chennai
  const atBranch = { latitude: 13.0828, longitude: 80.2708, accuracy: 5 };
  const r = evaluateGeofence({ offices: [OFFICE, branch], location: atBranch });
  assert.equal(r.ok, true);
  assert.equal(r.office.name, 'Branch');
});

test('date helpers: day keys, weekdays and ranges', () => {
  assert.equal(date.isDateKey('2026-11-23'), true);
  assert.equal(date.isDateKey('2026-13-40'), false);
  assert.equal(date.isDateKey('23-11-2026'), false);
  assert.equal(date.weekdayOf('2026-11-23'), 1); // Monday
  assert.deepEqual(date.eachDate('2026-11-29', '2026-12-02'), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  assert.deepEqual(date.monthRange(2026, 2), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(date.parseHHmm('09:30'), 570);
});

test('day key follows the organisation timezone, not the server', () => {
  // 20:00 UTC on 22 Nov is already 01:30 on 23 Nov in India (UTC+5:30)
  assert.equal(date.dateKey(new Date('2026-11-22T20:00:00Z')), '2026-11-23');
  assert.equal(date.minutesOfDay(new Date('2026-11-22T20:00:00Z')), 90);
  assert.equal(date.formatTime(new Date('2026-11-23T03:30:00Z')), '09:00 AM');
});

test('escapeRegex neutralises regex metacharacters', () => {
  assert.equal(escapeRegex('a.b*c(d)'), 'a\\.b\\*c\\(d\\)');
  assert.equal(new RegExp(escapeRegex('(.*)+')).test('(.*)+'), true);
});
