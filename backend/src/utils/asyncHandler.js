// Lets controllers be plain async functions: any thrown error (including
// AppError) is forwarded to the error middleware instead of needing try/catch.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
