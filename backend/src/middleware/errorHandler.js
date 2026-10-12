const { sendError } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  console.error(err);

  if (err && err.code === '23505') {
    return sendError(res, 409, 'Duplicate record detected.', 'duplicate_record');
  }

  if (err && err.code === '23503') {
    return sendError(res, 400, 'Referenced record does not exist.', 'foreign_key_violation');
  }

  if (err && err.code === '23514') {
    return sendError(res, 400, 'Validation failed for one or more fields.', 'check_violation');
  }

  if (err && err.code === '23P01') {
    return sendError(res, 409, 'Schedule conflict or overlapping booking detected.', 'exclusion_violation');
  }

  if (err && err.code === 'P0001') {
    const isConflict = err.message && (
      err.message.toLowerCase().includes('overlap') ||
      err.message.toLowerCase().includes('conflict')
    );
    return sendError(res, isConflict ? 409 : 400, err.message, 'business_rule_violation');
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  return sendError(res, statusCode, message, err.error || 'server_error');
};

module.exports = { errorHandler };
