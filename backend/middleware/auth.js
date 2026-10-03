/**
 * Campus Canteen Express - Authentication & Authorization Middleware
 * File: backend/middleware/auth.js
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/database');
const { errorResponse } = require('../utils/response');

/**
 * Verify JWT Bearer token and attach authenticated user object to req.user.
 */
async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.header('Authorization');

    if (!authHeader) {
      return errorResponse(res, 'Authentication token required. No token provided.', 401, 'TOKEN_REQUIRED');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return errorResponse(res, 'Malformed Authorization header. Format: Bearer <token>', 401, 'MALFORMED_HEADER');
    }

    const token = parts[1];
    let decoded;

    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return errorResponse(res, 'Authentication token has expired. Please login again.', 401, 'TOKEN_EXPIRED');
      }
      return errorResponse(res, 'Invalid or corrupted authentication token', 401, 'INVALID_TOKEN');
    }

    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return errorResponse(res, 'Invalid token payload: missing user identifier', 401, 'INVALID_TOKEN_PAYLOAD');
    }

    // Verify user exists in database
    const user = await db.get(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return errorResponse(res, 'Authenticated user account no longer exists in database', 401, 'USER_NOT_FOUND');
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Enforce Admin or Canteen Staff role.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 'Authentication required for admin access', 401, 'UNAUTHORIZED');
  }

  if (req.user.role !== 'ADMIN' && req.user.role !== 'CANTEEN_STAFF') {
    return errorResponse(res, 'Forbidden: Admin access required. Insufficient permissions.', 403, 'FORBIDDEN');
  }

  return next();
}

/**
 * Enforce Student role (also allows Admin).
 */
function requireStudent(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 'Authentication required for student access', 401, 'UNAUTHORIZED');
  }

  if (req.user.role !== 'STUDENT' && req.user.role !== 'ADMIN') {
    return errorResponse(res, 'Forbidden: Student access required.', 403, 'FORBIDDEN');
  }

  return next();
}

/**
 * Optional authentication: attaches user if token is present and valid,
 * otherwise proceeds with req.user = null without rejecting.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    const userId = decoded.userId || decoded.id;
    if (userId) {
      const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
      if (user) {
        req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      }
    }
  } catch (e) {
    req.user = null;
  }
  return next();
}

module.exports = {
  verifyToken,
  requireAdmin,
  requireStudent,
  optionalAuth
};
