/**
 * Campus Canteen Express - Authentication Service
 * File: backend/services/authService.js
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/database');
const { ConflictError, AuthError, NotFoundError } = require('../middleware/errorHandler');

/**
 * Generates a signed JWT token for a user.
 * @param {Object} user - { id, email, role }
 * @returns {string} Signed JWT
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      id: user.id,
      email: user.email,
      role: user.role
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * Register a new user.
 * @param {Object} params - { name, email, password, role }
 * @returns {Promise<{ token: string, user: Object }>}
 */
async function register({ name, email, password, role = 'STUDENT' }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const trimmedName = (name || '').trim();
  const assignedRole = (role || 'STUDENT').toUpperCase();

  // 1. Check for duplicate email
  const existingUser = await db.get(
    'SELECT id FROM users WHERE email = ?',
    [normalizedEmail]
  );

  if (existingUser) {
    throw new ConflictError('Email is already registered. Please login or use a different email.');
  }

  // 2. Hash password with bcrypt work factor 10
  const passwordHash = await bcrypt.hash(password, 10);

  // 3. Insert user record
  const result = await db.run(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES (?, ?, ?, ?)`,
    [trimmedName, normalizedEmail, passwordHash, assignedRole]
  );

  const newUserId = result.lastInsertRowid;

  // 4. Retrieve created user (omitting password hash)
  const createdUser = await db.get(
    'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
    [newUserId]
  );

  // 5. Generate authentication token
  const token = generateToken(createdUser);

  const safeUser = {
    id: createdUser.id,
    name: createdUser.name,
    email: createdUser.email,
    role: createdUser.role
  };

  return {
    token,
    user: safeUser
  };
}

/**
 * Authenticate user with email and password.
 * @param {Object} params - { email, password }
 * @returns {Promise<{ token: string, user: Object }>}
 */
async function login({ email, password }) {
  const normalizedEmail = (email || '').trim().toLowerCase();

  // 1. Retrieve user by normalized email
  const user = await db.get(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
    [normalizedEmail]
  );

  if (!user) {
    throw new AuthError('Invalid credentials. User not found.', 'INVALID_CREDENTIALS', 401);
  }

  // 2. Verify password hash
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new AuthError('Invalid credentials. Incorrect password.', 'INVALID_CREDENTIALS', 401);
  }

  // 3. Generate token
  const token = generateToken(user);

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  return {
    token,
    user: safeUser
  };
}

/**
 * Retrieve user profile by user ID.
 * @param {number} userId
 * @returns {Promise<Object>} Safe user profile
 */
async function getMe(userId) {
  const user = await db.get(
    'SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = ?',
    [userId]
  );

  if (!user) {
    throw new NotFoundError('User profile not found.');
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

module.exports = {
  generateToken,
  register,
  login,
  getMe
};
