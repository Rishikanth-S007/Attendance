const { AppError } = require('./errors');

const toNumber = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));

/**
 * Read the optional GPS fields the employee app sends alongside a face photo
 * (multipart form fields arrive as strings). Returns undefined if none were sent.
 */
function parseLocation(body = {}) {
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  if (latitude === undefined && longitude === undefined) return undefined;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new AppError('Invalid location coordinates', 400, 'INVALID_LOCATION');
  }
  const accuracy = toNumber(body.accuracy);
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : undefined,
    mocked: ['1', 'true', true].includes(body.mocked),
  };
}

module.exports = { parseLocation };
