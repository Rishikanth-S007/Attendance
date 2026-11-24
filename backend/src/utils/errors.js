// One error type for every "expected" failure (validation, business rule,
// recognition failure). Controllers turn it into an HTTP response; anything
// else that reaches the error middleware is treated as an unexpected 500.
class AppError extends Error {
  /**
   * @param {string} message  safe to show to the end user
   * @param {number} statusCode
   * @param {string} code     stable machine-readable code
   * @param {object} meta     extra context for logs (never sent to the client)
   */
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', meta = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.meta = meta;
  }
}

module.exports = { AppError };
