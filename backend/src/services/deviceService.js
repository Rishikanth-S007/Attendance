const crypto = require('crypto');
const Device = require('../models/Device');
const { AppError } = require('../utils/errors');

const hashKey = (rawKey) => crypto.createHash('sha256').update(String(rawKey)).digest('hex');

/** Create a device and return its raw key. This is the only time the key is available. */
async function createDevice(name, adminId) {
  const key = `dk_${crypto.randomBytes(32).toString('hex')}`;
  const device = await Device.create({
    name,
    keyHash: hashKey(key),
    keyPrefix: key.slice(0, 7),
    createdBy: adminId,
  });
  return { device: toPublic(device), key };
}

function toPublic(device) {
  const d = device.toObject ? device.toObject() : device;
  delete d.keyHash;
  return d;
}

async function listDevices() {
  return Device.find().sort({ createdAt: -1 }).lean();
}

async function revokeDevice(id) {
  const { matchedCount } = await Device.updateOne({ _id: id }, { status: 'revoked' });
  if (!matchedCount) throw new AppError('Device not found', 404, 'NOT_FOUND');
  return Device.findById(id).lean();
}

/** Look up an active device by raw key, or null. */
async function findActiveByKey(rawKey) {
  if (!rawKey) return null;
  return Device.findOne({ keyHash: hashKey(rawKey), status: 'active' }).lean();
}

function touch(deviceId, ip) {
  Device.updateOne({ _id: deviceId }, { lastSeenAt: new Date(), lastIp: ip }).catch(() => {});
}

module.exports = { createDevice, listDevices, revokeDevice, findActiveByKey, touch, hashKey };
