/**
 * Campus Canteen Express - Centralized Error Handler Middleware
 * File: backend/middleware/errorHandler.js
 */

const config = require('../config');
const logger = require('../utils/logger');
const { errorResponse } = require('../utils/response');

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED', statusCode = 401) {
    super(message, statusCode, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden: Insufficient permissions', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Requested resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT') {
    super(message, 409, code);
  }
}

function errorHandler(err, req, res, next) {
  // 1. JSON Syntax Error from body-parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return errorResponse(res, 'Malformed JSON payload in request body', 400, 'BAD_REQUEST');
  }

  // 2. JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Invalid authentication token', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Authentication token has expired', 401, 'TOKEN_EXPIRED');
  }

  // 3. SQLite Constraint Violations
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
    if (err.message && err.message.includes('users.email')) {
      return errorResponse(res, 'Email is already registered. Please login or use a different email.', 409, 'EMAIL_EXISTS');
    }
    return errorResponse(res, 'A duplicate record already exists in the system', 409, 'DUPLICATE_ENTRY');
  }

  if (err.code === 'SQLITE_CONSTRAINT_CHECK' || (err.message && err.message.includes('CHECK constraint failed'))) {
    return errorResponse(res, err.message || 'Data constraint validation failed', 400, 'CONSTRAINT_CHECK_FAILED');
  }

  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || (err.message && err.message.includes('FOREIGN KEY constraint failed'))) {
    return errorResponse(res, 'Foreign key constraint violation or dependent data exists', 400, 'FOREIGN_KEY_VIOLATION');
  }

  // 4. Custom AppError or Errors with explicit status/statusCode
  if (err instanceof AppError || err.isOperational || err.status || err.statusCode) {
    const statusCode = err.statusCode || err.status || 500;
    const code = err.code || (statusCode === 400 ? 'VALIDATION_ERROR' : (statusCode === 404 ? 'NOT_FOUND' : (statusCode === 401 ? 'UNAUTHORIZED' : (statusCode === 403 ? 'FORBIDDEN' : 'APP_ERROR'))));
    return errorResponse(
      res,
      err.message || 'An error occurred',
      statusCode,
      code,
      err.details
    );
  }

  // 5. Unhandled / Unexpected Server Errors
  logger.error(`[Unhandled Server Error] ${req.method} ${req.originalUrl}:`, err);

  const message = config.isProduction ? 'An unexpected server error occurred' : (err.message || 'Internal Server Error');
  const details = config.isDevelopment ? { stack: err.stack } : null;

  return errorResponse(res, message, 500, 'INTERNAL_SERVER_ERROR', details);
}

module.exports = {
  errorHandler,
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError
};
