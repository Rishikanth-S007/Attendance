const { failure } = require('../utils/response');

// Generic Joi validator. `source` is which part of the request to check:
// 'body' (default) or 'query'.
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      const errors = error.details.map((d) => d.message);
      return failure(res, 400, 'Validation failed', errors, 'VALIDATION_FAILED');
    }
    req[source] = value;
    next();
  };
}

module.exports = validate;
