const ScanLog = require('../models/ScanLog');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/** Best-effort write: a logging problem must never break a check-in. */
async function record(entry) {
  try {
    await ScanLog.create(entry);
  } catch (err) {
    logger.warn(`Could not write scan log: ${err.message}`);
  }
}

/**
 * Run a face-driven action and log its outcome either way.
 * `action` must resolve to { employee, faceDistance, margin } on success.
 * Errors may carry `err.meta` (employeeId, distance, margin) for the log.
 */
async function logged(type, ctx, action) {
  const base = { type, deviceId: ctx.deviceId, ip: ctx.ip };
  try {
    const result = await action();
    await record({
      ...base,
      outcome: 'success',
      employeeId: result.employee && result.employee.employeeId,
      distance: result.faceDistance,
      margin: result.margin,
      message: result.message,
    });
    return result;
  } catch (err) {
    const expected = err instanceof AppError && err.statusCode < 500;
    await record({
      ...base,
      outcome: expected ? 'rejected' : 'error',
      code: err.code,
      message: err.message,
      employeeId: err.meta && err.meta.employeeId,
      distance: err.meta && err.meta.distance,
      margin: err.meta && err.meta.margin,
    });
    throw err;
  }
}

async function list({ limit = 100, outcome } = {}) {
  const query = outcome ? { outcome } : {};
  return ScanLog.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
}

module.exports = { record, logged, list };
