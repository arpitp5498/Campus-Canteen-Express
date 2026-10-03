/**
 * Campus Canteen Express - Authentication Controller
 * File: backend/controllers/authController.js
 */

const authService = require('../services/authService');
const { successResponse } = require('../utils/response');

/**
 * POST /api/auth/register
 * Register a new student or canteen staff account.
 */
async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const result = await authService.register({ name, email, password, role });

    return successResponse(res, result, 'User registration successful', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/login
 * Authenticate user with credentials and issue JWT.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    return successResponse(res, result, 'Login successful', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 * Retrieve profile of currently authenticated user.
 */
async function getMe(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    return successResponse(res, { user }, 'Profile retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  getMe
};
