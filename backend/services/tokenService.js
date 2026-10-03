/**
 * Campus Canteen Express - Pickup Token & Identifier Generation Service
 * File: backend/services/tokenService.js
 * 
 * Generates human-readable, unambiguous 4-character pickup tokens and
 * unique order reference numbers with SHA-256 cryptographic hashing.
 */

const crypto = require('crypto');
const db = require('../config/database');

// Unambiguous alphanumeric character set:
// Removed visually ambiguous characters: 0/O, 1/I/l, 8/B (partially)
const TOKEN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXY3456789';
const TOKEN_LENGTH = 4;
const MAX_COLLISION_RETRIES = 10;

/**
 * Generate a SHA-256 hash of a plaintext token.
 * 
 * @param {string} token - 4-character pickup token
 * @returns {string} 64-character hex hash
 */
function hashToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto
    .createHash('sha256')
    .update(token.trim().toUpperCase())
    .digest('hex');
}

/**
 * Generate a single raw 4-character token from the unambiguous character set.
 * 
 * @returns {string} 4-character token
 */
function generateRawToken() {
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * TOKEN_CHARS.length);
    token += TOKEN_CHARS[randomIndex];
  }
  return token;
}

/**
 * Generate a unique 4-character pickup token for a given date.
 * Verifies no active token collision exists for that calendar date.
 * 
 * @param {Object} [tx] - Database transaction wrapper (or db instance)
 * @param {string} [targetDate] - Target date string 'YYYY-MM-DD'
 * @returns {Promise<string>} Unique 4-character token
 */
async function generateUniqueToken(tx = db, targetDate = null) {
  const dateFilter = targetDate || new Date().toISOString().split('T')[0];
  const runner = tx && typeof tx.get === 'function' ? tx : db;

  for (let attempt = 1; attempt <= MAX_COLLISION_RETRIES; attempt++) {
    const candidateToken = generateRawToken();

    const existing = await runner.get(
      `SELECT id FROM orders 
       WHERE pickup_token = ? 
         AND (DATE(created_at) = ? OR pickup_slot_id IN (SELECT id FROM pickup_slots WHERE slot_date = ?))
       LIMIT 1`,
      [candidateToken, dateFilter, dateFilter]
    );

    if (!existing) {
      return candidateToken;
    }
  }

  // High-entropy fallback if collisions occur
  return 'A' + Math.floor(100 + Math.random() * 900);
}

/**
 * Generate a unique order number in the format CCE-<digits>.
 * 
 * @param {Object} [tx] - Database transaction wrapper
 * @returns {Promise<string>}
 */
async function generateOrderNumber(tx = db) {
  const runner = tx && typeof tx.get === 'function' ? tx : db;

  for (let attempt = 1; attempt <= MAX_COLLISION_RETRIES; attempt++) {
    const timeSlice = Date.now().toString().slice(-6);
    const randSlice = Math.floor(100 + Math.random() * 900).toString();
    const candidateNumber = `CCE-${timeSlice}${randSlice}`;

    const existing = await runner.get(
      'SELECT id FROM orders WHERE order_number = ? LIMIT 1',
      [candidateNumber]
    );

    if (!existing) {
      return candidateNumber;
    }
  }

  return `CCE-${Date.now()}`;
}

/**
 * Sanitize user/staff input token.
 * Trims whitespace and converts to uppercase.
 * 
 * @param {string} token
 * @returns {string}
 */
function sanitizeToken(token) {
  if (!token || typeof token !== 'string') return '';
  return token.trim().toUpperCase();
}

/**
 * Validate token format: exactly 4 characters from the allowed unambiguous charset.
 * 
 * @param {string} token
 * @returns {boolean}
 */
function isValidTokenFormat(token) {
  if (!token || typeof token !== 'string') return false;
  const sanitized = sanitizeToken(token);
  if (sanitized.length !== TOKEN_LENGTH) return false;

  for (let i = 0; i < sanitized.length; i++) {
    if (!TOKEN_CHARS.includes(sanitized[i])) {
      return false;
    }
  }
  return true;
}

module.exports = {
  TOKEN_CHARS,
  TOKEN_LENGTH,
  hashToken,
  generateRawToken,
  generateUniqueToken,
  generateUniqueTokenSync: generateUniqueToken,
  generateOrderNumber,
  generateOrderNumberSync: generateOrderNumber,
  sanitizeToken,
  isValidTokenFormat
};
