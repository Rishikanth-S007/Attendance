// Centralized environment configuration.
// Every other module reads config from here instead of process.env directly,
// so defaults and validation live in exactly one place.
require('dotenv').config();

const bool = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
};

const num = (name, fallback) => {
  const parsed = parseFloat(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const json = (name, fallback) => {
  if (!process.env[name]) return fallback;
  try {
    return JSON.parse(process.env[name]);
  } catch {
    throw new Error(`Environment variable ${name} must be valid JSON`);
  }
};

const nodeEnv = process.env.NODE_ENV || 'development';
const PLACEHOLDER_SECRETS = ['dev_secret_change_me', 'change_this_to_a_long_random_secret'];
const jwtSecret = process.env.JWT_SECRET || 'dev_secret_change_me';

if (nodeEnv === 'production' && (PLACEHOLDER_SECRETS.includes(jwtSecret) || jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters in production');
}

module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv,
  trustProxy: process.env.TRUST_PROXY === undefined ? 0 : /^\d+$/.test(process.env.TRUST_PROXY) ? parseInt(process.env.TRUST_PROXY, 10) : process.env.TRUST_PROXY,

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/attendance_system',

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  setupToken: process.env.SETUP_TOKEN || '',
  requireDeviceKey: bool('REQUIRE_DEVICE_KEY', true),

  faceServiceUrl: process.env.FACE_SERVICE_URL || 'http://127.0.0.1:8000',
  faceMaxDistance: num('FACE_MAX_DISTANCE', 0.5),
  faceMinMargin: num('FACE_MIN_MARGIN', 0.04),
  maxFaceTemplates: 5,

  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  minCheckoutGapMinutes: num('MIN_CHECKOUT_GAP_MINUTES', 2),

  geofenceEnforce: bool('GEOFENCE_ENFORCE', true),
  geofenceMaxAccuracyMeters: num('GEOFENCE_MAX_ACCURACY_METERS', 100),

  leaveAllowances: json('LEAVE_ALLOWANCES', { casual: 12, sick: 10, earned: 15 }),

  // Face requests per device/IP per minute (each one runs the face model).
  faceRateLimitPerMinute: num('FACE_RATE_LIMIT_PER_MIN', 20),

  uploadMaxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5', 10),

  allowedOrigins: (process.env.ALLOWED_ORIGINS || (nodeEnv === 'production' ? '' : '*'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
