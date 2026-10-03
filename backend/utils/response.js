/**
 * Campus Canteen Express - Standard Response Serializer Utility
 * File: backend/utils/response.js
 * 
 * Provides unified, dual-layout JSON responses satisfying both nested (.data)
 * and top-level property accessors.
 */

/**
 * Send a standardized success JSON response.
 * @param {import('express').Response} res
 * @param {Object|Array} [data={}] - Response data payload
 * @param {string|null} [message=null] - Optional human-readable message
 * @param {number} [statusCode=200] - HTTP status code
 */
function successResponse(res, data = {}, message = null, statusCode = 200) {
  const isObject = typeof data === 'object' && data !== null && !Array.isArray(data);

  const payload = {
    success: true,
    ...(message ? { message } : {}),
    data: data,
    // Flatten top-level properties if data is an object
    ...(isObject ? data : {})
  };

  return res.status(statusCode).json(payload);
}

/**
 * Send a standardized error JSON response.
 * @param {import('express').Response} res
 * @param {string} [message='An error occurred'] - Human-readable error message
 * @param {number} [statusCode=500] - HTTP status code
 * @param {string} [code='INTERNAL_ERROR'] - Application error code
 * @param {any} [details=null] - Optional additional error details
 */
function errorResponse(res, message = 'An error occurred', statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
  const payload = {
    success: false,
    message: message,
    error: {
      code,
      message,
      ...(details !== null && details !== undefined ? { details } : {})
    }
  };

  return res.status(statusCode).json(payload);
}

module.exports = {
  successResponse,
  errorResponse
};
