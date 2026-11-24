// Loads the "calendar context" that attendance rules need: which shift an
// employee works, which days are holidays, and which offices they may use.
const Shift = require('../models/Shift');
const Holiday = require('../models/Holiday');
const Office = require('../models/Office');
const { BUILTIN_SHIFT } = require('./rules');

/** Create a General shift on first run so there is always something to apply. */
async function ensureDefaultShift() {
  if ((await Shift.countDocuments()) === 0) {
    await Shift.create({ ...BUILTIN_SHIFT, isDefault: true });
  }
}

/** All shifts keyed by id, plus the default one. Few rows, so one query is cheap. */
async function loadShifts() {
  const shifts = await Shift.find().lean();
  const active = shifts.filter((s) => s.status === 'active');
  const fallback = active.find((s) => s.isDefault) || active[0] || BUILTIN_SHIFT;
  return { byId: new Map(shifts.map((s) => [String(s._id), s])), fallback };
}

function pickShift(ctx, shiftId) {
  return (shiftId && ctx.byId.get(String(shiftId))) || ctx.fallback;
}

async function getShiftForEmployee(employee, preferredShiftId) {
  const ctx = await loadShifts();
  return pickShift(ctx, preferredShiftId || employee.shiftId);
}

/** Set of YYYY-MM-DD holiday keys in [startKey, endKey]. */
async function loadHolidays(startKey, endKey) {
  const rows = await Holiday.find({ date: { $gte: startKey, $lte: endKey } }).lean();
  return new Set(rows.map((h) => h.date));
}

/**
 * Offices an employee may check in from: their assigned office if it is
 * active, otherwise every active office. An empty list means geofencing is
 * not configured, so location is not checked.
 */
async function getAllowedOffices(employee) {
  if (employee.officeId) {
    const assigned = await Office.findOne({ _id: employee.officeId, status: 'active' }).lean();
    if (assigned) return [assigned];
  }
  return Office.find({ status: 'active' }).lean();
}

module.exports = { ensureDefaultShift, loadShifts, pickShift, getShiftForEmployee, loadHolidays, getAllowedOffices };
