// End-to-end test of the real stack: Express app + MongoDB-compatible database
// + the Python face service. Skipped unless INTEGRATION=1 and the services are up:
//   INTEGRATION=1 MONGO_URI=mongodb://127.0.0.1:27017/att_test FACE_SERVICE_URL=http://127.0.0.1:8000 \
//   TEST_FACE_IMAGE=/path/face.jpg TEST_NOFACE_IMAGE=/path/noface.jpg npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const RUN = process.env.INTEGRATION === '1';
const skip = RUN ? false : 'set INTEGRATION=1 (needs MongoDB + face service)';

if (RUN) {
  Object.assign(process.env, {
    NODE_ENV: 'test', SETUP_TOKEN: 'setup-secret', REQUIRE_DEVICE_KEY: 'true', GEOFENCE_ENFORCE: 'true',
    FACE_RATE_LIMIT_PER_MIN: '1000', TIMEZONE_NOTE: 'x', APP_TIMEZONE: 'Asia/Kolkata',
    JWT_SECRET: 'integration-test-secret-integration-test-secret',
  });
  process.env.MONGO_URI = `${process.env.MONGO_URI}_${Date.now()}`;
}

let base; let server; let mongoose;
let adminToken; let deviceKey;
const faceJpg = RUN ? fs.readFileSync(process.env.TEST_FACE_IMAGE) : null;
const noFaceJpg = RUN ? fs.readFileSync(process.env.TEST_NOFACE_IMAGE) : null;

async function api(method, path, { json, form, token, key, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (key) h['x-device-key'] = key;
  let body;
  if (json !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(base + path, { method, headers: h, body });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}
const photo = (buffer, fields = {}) => {
  const f = new FormData();
  f.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'x.jpg');
  Object.entries(fields).forEach(([k, v]) => f.append(k, String(v)));
  return f;
};
const admin = (method, path, json) => api(method, path, { json, token: adminToken });
const face = (path, buffer, fields) => api('POST', path, { form: photo(buffer, fields), key: deviceKey });

test('integration: full attendance workflow', { skip }, async (t) => {
  const app = require('../src/server');
  mongoose = require('mongoose');

  t.after(async () => {
    if (server) { server.closeAllConnections(); server.close(); }
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  });

  await mongoose.connect(process.env.MONGO_URI);
  // allSettled: the stand-in database used in CI sandboxes (FerretDB) lacks TTL
  // indexes, which only affects ScanLog's 90-day expiry. Real MongoDB supports it.
  const inits = await Promise.allSettled(Object.values(mongoose.models).map((m) => m.init()));
  inits.forEach((r) => { if (r.status === 'rejected' && !/expireAfterSeconds/.test(r.reason.message)) throw r.reason; });
  await require('../src/services/calendarService').ensureDefaultShift();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  await t.test('first-admin setup is protected by the setup token and works once', async () => {
    const body = { name: 'Root', email: 'root@example.com', password: 'a-long-password' };
    assert.equal((await api('POST', '/api/auth/setup-first-admin', { json: body })).status, 403);
    const ok = await api('POST', '/api/auth/setup-first-admin', { json: body, headers: { 'x-setup-token': 'setup-secret' } });
    assert.equal(ok.status, 201);
    const again = await api('POST', '/api/auth/setup-first-admin', { json: body, headers: { 'x-setup-token': 'setup-secret' } });
    assert.equal(again.status, 403);
  });

  await t.test('login rejects bad credentials and returns a token for good ones', async () => {
    assert.equal((await api('POST', '/api/auth/login', { json: { email: 'root@example.com', password: 'wrong-password' } })).status, 401);
    assert.equal((await api('POST', '/api/auth/login', { json: { email: 'nobody@example.com', password: 'wrong-password' } })).status, 401);
    const ok = await api('POST', '/api/auth/login', { json: { email: 'root@example.com', password: 'a-long-password' } });
    assert.equal(ok.status, 200);
    adminToken = ok.data.token;
    assert.equal((await api('GET', '/api/employees')).status, 401);
    assert.equal((await admin('GET', '/api/auth/me')).data.admin.role, 'super_admin');
  });

  await t.test('face endpoints need a paired device', async () => {
    assert.equal((await api('POST', '/api/attendance/check-in', { form: photo(faceJpg) })).status, 401);
    assert.equal((await api('POST', '/api/attendance/check-in', { form: photo(faceJpg), key: 'dk_bogus' })).status, 401);
    const made = await admin('POST', '/api/config/devices', { name: 'Front desk' });
    assert.equal(made.status, 201);
    assert.match(made.data.key, /^dk_[0-9a-f]{64}$/);
    assert.equal(made.data.device.keyHash, undefined, 'hash must never be returned');
    deviceKey = made.data.key;
    const listed = await admin('GET', '/api/config/devices');
    assert.equal(JSON.stringify(listed.data).includes(deviceKey), false, 'raw key is shown only once');
  });

  await t.test('employee CRUD: validation, duplicates, no embeddings leaked', async () => {
    assert.equal((await admin('POST', '/api/employees', { employeeId: 'E1' })).status, 400);
    assert.equal((await admin('POST', '/api/employees', { employeeId: 'E1', name: 'Asha', department: 'Eng', status: 'inactive', faceRegistered: true })).status, 201);
    const dup = await admin('POST', '/api/employees', { employeeId: 'E1', name: 'Other' });
    assert.equal(dup.status, 409);
    const got = (await admin('GET', '/api/employees/E1')).data.employee;
    assert.equal(got.status, 'active', 'mass-assignment of status must be ignored');
    assert.equal(got.faceRegistered, false, 'mass-assignment of faceRegistered must be ignored');
    assert.equal((await admin('GET', '/api/employees?status[$ne]=x')).status, 400, 'operator injection rejected');
    assert.equal((await admin('GET', '/api/employees?search=(.*)%2B')).status, 200, 'regex input is escaped');
  });

  await t.test('face enrolment: quality gate, duplicate-face guard, templates hidden', async () => {
    const bad = await api('POST', '/api/employees/E1/register-face', { form: photo(noFaceJpg), token: adminToken });
    assert.equal(bad.status, 422);
    assert.equal(bad.data.code, 'NO_FACE');

    const ok = await api('POST', '/api/employees/E1/register-face', { form: photo(faceJpg, { label: 'front' }), token: adminToken });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.faceSamples, 1);

    await admin('POST', '/api/employees', { employeeId: 'E2', name: 'Buddy' });
    const twin = await api('POST', '/api/employees/E2/register-face', { form: photo(faceJpg), token: adminToken });
    assert.equal(twin.status, 409);
    assert.equal(twin.data.code, 'DUPLICATE_FACE');

    const got = (await admin('GET', '/api/employees/E1')).data.employee;
    assert.equal(got.faceRegistered, true);
    assert.equal(got.faceEmbeddings, undefined, 'embeddings must never leave the server');
    const all = JSON.stringify((await admin('GET', '/api/employees')).data);
    assert.equal(all.includes('faceEmbeddings'), false);
  });

  await t.test('check-in: unusable photo, success, then idempotent repeat', async () => {
    const none = await face('/api/attendance/check-in', noFaceJpg);
    assert.equal(none.status, 422);
    assert.equal(none.data.code, 'NO_FACE');

    const first = await face('/api/attendance/check-in', faceJpg);
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.alreadyCheckedIn, false);
    assert.equal(first.data.employee.employeeId, 'E1');
    assert.ok(['on_time', 'late', 'half_day'].includes(first.data.attendance.outcome));

    const second = await face('/api/attendance/check-in', faceJpg);
    assert.equal(second.status, 200);
    assert.equal(second.data.alreadyCheckedIn, true);

    const today = (await admin('GET', '/api/attendance/today')).data.records;
    assert.equal(today.length, 1, 'exactly one record per employee per day');
    assert.equal(today[0].employeeName, 'Asha');
  });

  await t.test('verify identifies without side effects', async () => {
    const hit = await face('/api/attendance/verify', faceJpg);
    assert.equal(hit.data.matched, true);
    assert.equal(hit.data.employeeId, 'E1');
    const miss = await face('/api/attendance/verify', noFaceJpg);
    assert.equal(miss.data.matched, false);
  });

  await t.test('check-out: too soon, geofence rules, then success once', async () => {
    assert.equal((await face('/api/attendance/check-out', faceJpg)).data.code, 'TOO_SOON');

    // Pretend the person arrived 3 hours ago; metrics are recomputed by the admin edit.
    const rec = (await admin('GET', '/api/attendance/today')).data.records[0];
    const earlier = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const edited = await admin('PUT', `/api/attendance/${rec._id}`, { checkIn: { timestamp: earlier } });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.record.edited, true);

    const office = await admin('POST', '/api/config/offices', { name: 'HQ', latitude: 12.9716, longitude: 77.5946, radiusMeters: 150 });
    assert.equal(office.status, 201);

    const noLoc = await face('/api/attendance/check-out', faceJpg);
    assert.equal(noLoc.status, 403);
    assert.equal(noLoc.data.code, 'LOCATION_REQUIRED');
    const far = await face('/api/attendance/check-out', faceJpg, { latitude: 13.08, longitude: 80.27, accuracy: 10 });
    assert.equal(far.data.code, 'OUTSIDE_GEOFENCE');
    const fake = await face('/api/attendance/check-out', faceJpg, { latitude: 12.9716, longitude: 77.5946, accuracy: 5, mocked: true });
    assert.equal(fake.data.code, 'MOCK_LOCATION');
    assert.equal((await face('/api/attendance/check-out', faceJpg, { latitude: 'abc', longitude: 1 })).status, 400);

    const done = await face('/api/attendance/check-out', faceJpg, { latitude: 12.9718, longitude: 77.5948, accuracy: 10 });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.alreadyCheckedOut, false);
    assert.ok(done.data.attendance.workedMinutes >= 179);

    const again = await face('/api/attendance/check-out', faceJpg, { latitude: 12.9718, longitude: 77.5948, accuracy: 10 });
    assert.equal(again.data.alreadyCheckedOut, true);

    // Check-out must not be editable into the past of check-in.
    const bad = await admin('PUT', `/api/attendance/${rec._id}`, { checkOut: { timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString() } });
    assert.equal(bad.status, 400);
  });

  await t.test('admin can back-fill a missed day; future dates are refused', async () => {
    const ok = await admin('POST', '/api/attendance', { employeeId: 'E1', date: '2026-11-02', checkIn: '2026-11-02T04:00:00Z', checkOut: '2026-11-02T12:30:00Z' });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.record.dayType, 'working');
    assert.equal((await admin('POST', '/api/attendance', { employeeId: 'E1', date: '2026-11-02', checkIn: '2026-11-02T04:00:00Z' })).status, 409);
    assert.equal((await admin('POST', '/api/attendance', { employeeId: 'E1', date: '2099-01-01', checkIn: '2099-01-01T04:00:00Z' })).status, 400);
  });

  await t.test('shifts and holidays', async () => {
    const shifts = (await admin('GET', '/api/config/shifts')).data.shifts;
    assert.equal(shifts.filter((s) => s.isDefault).length, 1);
    assert.equal((await admin('POST', '/api/config/shifts', { name: 'Night', startTime: '18:00', endTime: '09:00' })).status, 400);
    const made = await admin('POST', '/api/config/shifts', { name: 'Early', startTime: '07:00', endTime: '15:00', isDefault: true });
    assert.equal(made.status, 201);
    const after = (await admin('GET', '/api/config/shifts')).data.shifts;
    assert.equal(after.filter((s) => s.isDefault).length, 1, 'only one default shift');
    assert.equal((await admin('DELETE', `/api/config/shifts/${made.data.shift._id}`)).status, 400);

    assert.equal((await admin('POST', '/api/config/holidays', { date: '2027-03-02', name: 'Festival' })).status, 201);
    assert.equal((await admin('POST', '/api/config/holidays', { date: '2027-03-02', name: 'Again' })).status, 409);
    assert.equal((await admin('POST', '/api/config/holidays', { date: '2027-02-30', name: 'Bad' })).status, 400);
  });

  await t.test('leave: face-identified request, working-day maths, balance, overlap, approval', async () => {
    // 2027-03-01 is a Monday, 03-02 is the holiday above, 03-03 Wednesday: 2 working days
    const req = await face('/api/leaves/app/request', faceJpg, { type: 'casual', startDate: '2027-03-01', endDate: '2027-03-03', reason: 'Family event' });
    assert.equal(req.status, 201, JSON.stringify(req.data));
    assert.equal(req.data.leave.days, 2, 'the holiday does not use up leave');
    assert.equal(req.data.leave.status, 'pending');
    const casual = req.data.balance.find((b) => b.type === 'casual');
    assert.equal(casual.remaining, 10);

    const overlap = await face('/api/leaves/app/request', faceJpg, { type: 'sick', startDate: '2027-03-03', endDate: '2027-03-04' });
    assert.equal(overlap.status, 409);
    const weekend = await face('/api/leaves/app/request', faceJpg, { type: 'casual', startDate: '2027-03-06', endDate: '2027-03-07' });
    assert.equal(weekend.data.code, 'NO_WORKING_DAYS');
    const past = await face('/api/leaves/app/request', faceJpg, { type: 'casual', startDate: '2026-11-02', endDate: '2026-11-03' });
    assert.equal(past.data.code, 'PAST_DATE');
    const tooMany = await face('/api/leaves/app/request', faceJpg, { type: 'earned', startDate: '2027-04-05', endDate: '2027-04-27' });
    assert.equal(tooMany.data.code, 'INSUFFICIENT_BALANCE');
    assert.equal((await face('/api/leaves/app/request', noFaceJpg, { type: 'casual', startDate: '2027-05-03', endDate: '2027-05-03' })).status, 422);

    const id = req.data.leave._id;
    assert.equal((await admin('PATCH', `/api/leaves/${id}/decision`, { status: 'approved', note: 'ok' })).status, 200);
    assert.equal((await admin('PATCH', `/api/leaves/${id}/decision`, { status: 'rejected' })).status, 409, 'cannot decide twice');

    const bal = await face('/api/leaves/app/balance', faceJpg, { year: 2027 });
    assert.equal(bal.data.balance.find((b) => b.type === 'casual').used, 2);
    assert.equal((await admin('POST', `/api/leaves/${id}/cancel`)).status, 200);
    assert.equal((await admin('GET', '/api/leaves/balance/E1?year=2027')).data.balance.find((b) => b.type === 'casual').remaining, 12);
    assert.equal((await admin('GET', '/api/leaves?status[$ne]=x')).status, 400);
  });

  await t.test('dashboard and reports', async () => {
    const sum = (await admin('GET', '/api/dashboard/summary')).data;
    assert.equal(sum.totalEmployees, 2);
    assert.ok(sum.present >= 1);
    assert.equal((await admin('GET', '/api/dashboard/monthly?month=13')).status, 400);
    assert.equal((await admin('GET', '/api/dashboard/department')).status, 200);

    const q = '?startDate=2026-11-01&endDate=2026-11-30';
    const json = await admin('GET', `/api/reports/summary${q}`);
    const row = json.data.rows.find((r) => r.employeeId === 'E1');
    assert.ok(row && row.workingDays > 0);

    const csv = await api('GET', `/api/reports/attendance${q}&format=csv`, { token: adminToken });
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.headers.get('content-disposition'), /attendance_register_2026-11-01_2026-11-30\.csv/);
    assert.ok(csv.data.toString().includes('Asha'));
    const xlsx = await api('GET', `/api/reports/summary${q}&format=xlsx`, { token: adminToken });
    assert.equal(xlsx.data.subarray(0, 2).toString(), 'PK');
    const pdf = await api('GET', `/api/reports/summary${q}&format=pdf`, { token: adminToken });
    assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');

    assert.equal((await admin('GET', '/api/reports/summary?startDate=2026-11-30&endDate=2026-11-01')).status, 400);
    assert.equal((await admin('GET', '/api/reports/summary?startDate=2020-01-01&endDate=2026-11-01')).status, 400);
    assert.equal((await api('GET', '/api/reports/summary')).status, 401);
  });

  await t.test('scan log records successes and rejections without biometrics', async () => {
    const scans = (await admin('GET', '/api/config/scans?limit=200')).data.scans;
    assert.ok(scans.some((s) => s.outcome === 'success'));
    assert.ok(scans.some((s) => s.outcome === 'rejected' && s.code === 'NO_FACE'));
    assert.ok(scans.some((s) => s.code === 'OUTSIDE_GEOFENCE'));
    assert.equal(JSON.stringify(scans).includes('embedding'), false);
  });

  await t.test('audit trail covers admin changes', async () => {
    const AuditLog = mongoose.model('AuditLog');
    const actions = (await AuditLog.find().lean()).map((a) => a.action);
    for (const a of ['CREATE_EMPLOYEE', 'REGISTER_FACE', 'UPDATE_ATTENDANCE', 'CREATE_ATTENDANCE', 'CREATE_OFFICE', 'LEAVE_APPROVED', 'LEAVE_CANCELLED']) {
      assert.ok(actions.includes(a), `missing audit action ${a}`);
    }
  });

  await t.test('deactivated employees cannot check in; revoked devices are locked out', async () => {
    await Promise.resolve();
    assert.equal((await admin('DELETE', '/api/employees/E1')).status, 200);
    const out = await face('/api/attendance/verify', faceJpg);
    assert.equal(out.data.matched, false);

    const id = (await admin('GET', '/api/config/devices')).data.devices[0]._id;
    assert.equal((await admin('DELETE', `/api/config/devices/${id}`)).status, 200);
    assert.equal((await face('/api/attendance/verify', faceJpg)).status, 401);
  });
});
