const logger = require('../utils/logger');
const env = require('../config/environment');
const { AppError } = require('../utils/errors');
const { failure } = require('../utils/response');

const DUPLICATE_MESSAGES = {
  employeeId: 'That employee ID already exists',
  name: 'That name is already in use',
  date: 'A record for this date already exists',
  email: 'That email is already in use',
};

// Catches expected AppErrors, Multer and Mongoose errors, and anything thrown
// asynchronously that reaches Express's error handler.
function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error(`${err.code}: ${err.message} ${JSON.stringify(err.meta)}`);
    return failure(res, err.statusCode, err.message, null, err.code);
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return failure(res, 413, `Image is too large (max ${env.uploadMaxSizeMb} MB)`, null, 'FILE_TOO_LARGE');
  }
  if (err.name === 'MulterError' || err.message === 'Only image uploads are allowed') {
    return failure(res, 400, err.message, null, 'BAD_UPLOAD');
  }
  if (err.name === 'ValidationError') return failure(res, 400, err.message, null, 'VALIDATION_FAILED');
  if (err.name === 'CastError') return failure(res, 400, `Invalid ${err.path || 'value'}`, null, 'INVALID_ID');

  if (err.code === 11000) {
    // Duplicate key, e.g. the (employeeId, date) unique index catching a race.
    const field = Object.keys(err.keyPattern || {}).find((k) => DUPLICATE_MESSAGES[k]);
    return failure(res, 409, field ? DUPLICATE_MESSAGES[field] : 'Duplicate record', null, 'DUPLICATE');
  }

  logger.error(err.stack || err.message);
  // Never leak internals in production.
  const message = env.nodeEnv === 'production' ? 'Internal server error' : err.message || 'Internal server error';
  return failure(res, err.statusCode || 500, message, null, 'INTERNAL_ERROR');
}

module.exports = errorMiddleware;
