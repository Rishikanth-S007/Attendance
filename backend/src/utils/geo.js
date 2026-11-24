// Geofencing maths and the accept/reject decision. Pure functions: no I/O.

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lng points, in metres. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Decide whether a reported position is inside any of the allowed offices.
 *
 * GPS accuracy is a radius of uncertainty, so we forgive up to
 * `maxAccuracyMeters` of it: someone standing just inside the fence with a
 * poor fix is not locked out, but a wildly inaccurate fix cannot be used to
 * claim a location from far away.
 *
 * Returns { ok, reason, distanceMeters, office }.
 */
function evaluateGeofence({ offices, location, maxAccuracyMeters = 100 }) {
  if (!offices || offices.length === 0) {
    return { ok: true, reason: null, distanceMeters: null, office: null, skipped: true };
  }
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return { ok: false, reason: 'LOCATION_REQUIRED', distanceMeters: null, office: null };
  }
  if (location.mocked) {
    return { ok: false, reason: 'MOCK_LOCATION', distanceMeters: null, office: null };
  }

  const forgiven = Math.min(Math.max(location.accuracy || 0, 0), maxAccuracyMeters);
  let nearest = null;

  for (const office of offices) {
    const distance = haversineMeters(location.latitude, location.longitude, office.latitude, office.longitude);
    if (!nearest || distance < nearest.distance) nearest = { office, distance };
  }

  const ok = nearest.distance - forgiven <= nearest.office.radiusMeters;
  return {
    ok,
    reason: ok ? null : 'OUTSIDE_GEOFENCE',
    distanceMeters: Math.round(nearest.distance),
    office: nearest.office,
  };
}

module.exports = { haversineMeters, evaluateGeofence };
