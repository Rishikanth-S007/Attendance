const env = require('../config/environment');
const deviceService = require('../services/deviceService');
const { failure } = require('../utils/response');

// Guards the face-driven endpoints (check-in, check-out, verify, leave request).
// Employees still have no accounts, but the *device* must be one an admin has
// paired. That stops anyone who finds the API address from hammering it with
// face photos or probing who is enrolled.
async function deviceAuth(req, res, next) {
  const key = req.headers['x-device-key'];

  if (!key) {
    if (!env.requireDeviceKey) {
      req.device = null;
      return next();
    }
    return failure(res, 401, 'This device is not paired. Ask an admin for a device key.');
  }

  try {
    const device = await deviceService.findActiveByKey(key);
    if (!device) return failure(res, 401, 'Device key is invalid or has been revoked.');
    req.device = { id: device._id, name: device.name };
    deviceService.touch(device._id, req.ip);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = deviceAuth;
