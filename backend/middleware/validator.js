/**
 * Campus Canteen Express - Request Validation Middleware
 * File: backend/middleware/validator.js
 */

const { errorResponse } = require('../utils/response');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_CATEGORIES = ['Sandwiches', 'Snacks', 'Meals', 'Rolls', 'Drinks', 'Desserts'];

/**
 * Validates registration payload: { name, email, password, role? }
 */
function validateRegister(req, res, next) {
  let { name, email, password, role } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return errorResponse(res, 'Validation failed: Name is required and must be at least 2 characters.', 400, 'VALIDATION_ERROR');
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return errorResponse(res, 'Validation failed: A valid email address is required.', 400, 'VALIDATION_ERROR');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return errorResponse(res, 'Validation failed: Password must be at least 6 characters in length.', 400, 'VALIDATION_ERROR');
  }

  if (role && !['STUDENT', 'ADMIN', 'CANTEEN_STAFF'].includes(role.toUpperCase())) {
    return errorResponse(res, 'Validation failed: Role must be STUDENT, ADMIN, or CANTEEN_STAFF.', 400, 'VALIDATION_ERROR');
  }

  // Sanitize values
  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  req.body.role = role ? role.toUpperCase() : 'STUDENT';

  return next();
}

/**
 * Validates login payload: { email, password }
 */
function validateLogin(req, res, next) {
  let { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !email.trim()) {
    return errorResponse(res, 'Validation failed: Email is required.', 400, 'VALIDATION_ERROR');
  }

  if (!password || typeof password !== 'string' || !password) {
    return errorResponse(res, 'Validation failed: Password is required.', 400, 'VALIDATION_ERROR');
  }

  req.body.email = email.trim().toLowerCase();

  return next();
}

/**
 * Validates Menu Item creation/update payload.
 */
function validateMenuItem(req, res, next) {
  const { name, category, price, base_price, preparation_time, prep_time_minutes, variants } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return errorResponse(res, 'Validation failed: Item name is required and cannot be empty.', 400, 'VALIDATION_ERROR');
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return errorResponse(res, `Validation failed: Category must be one of: ${VALID_CATEGORIES.join(', ')}`, 400, 'INVALID_CATEGORY');
  }

  const resolvedPrice = price !== undefined ? price : base_price;
  if (resolvedPrice === undefined || typeof resolvedPrice !== 'number' || isNaN(resolvedPrice) || resolvedPrice < 0) {
    return errorResponse(res, 'Validation failed: Price must be a non-negative number.', 400, 'INVALID_PRICE');
  }

  const resolvedPrep = preparation_time !== undefined ? preparation_time : (prep_time_minutes !== undefined ? prep_time_minutes : 10);
  if (typeof resolvedPrep !== 'number' || isNaN(resolvedPrep) || resolvedPrep < 0) {
    return errorResponse(res, 'Validation failed: Preparation time must be a non-negative number.', 400, 'INVALID_PREP_TIME');
  }

  if (variants && Array.isArray(variants)) {
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.variant_name || typeof v.variant_name !== 'string' || v.variant_name.trim().length === 0) {
        return errorResponse(res, `Validation failed: Variant at index ${i} requires a non-empty variant_name.`, 400, 'INVALID_VARIANT');
      }
      if (v.price === undefined || typeof v.price !== 'number' || isNaN(v.price) || v.price < 0) {
        return errorResponse(res, `Validation failed: Variant at index ${i} requires a non-negative price.`, 400, 'INVALID_VARIANT_PRICE');
      }
    }
  }

  return next();
}

/**
 * Validates availability toggle payload: { is_available }
 */
function validateToggleAvailability(req, res, next) {
  const { is_available } = req.body || {};
  if (is_available !== undefined && typeof is_available !== 'boolean' && is_available !== 0 && is_available !== 1 && is_available !== '0' && is_available !== '1') {
    return errorResponse(res, 'Validation failed: is_available must be a boolean or 0/1.', 400, 'VALIDATION_ERROR');
  }
  return next();
}

/**
 * Validates order checkout payload: { slot_id, items }
 */
function validateCreateOrder(req, res, next) {
  const { slot_id, pickup_slot_id, items } = req.body || {};
  const slotId = slot_id !== undefined ? slot_id : pickup_slot_id;

  if (slotId === undefined || isNaN(Number(slotId)) || Number(slotId) <= 0) {
    return errorResponse(res, 'Validation failed: A valid pickup slot ID is required.', 400, 'VALIDATION_ERROR');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return errorResponse(res, 'Validation failed: Order items array cannot be empty. At least 1 item is required.', 400, 'VALIDATION_ERROR');
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemId = item.item_id !== undefined ? item.item_id : item.menu_item_id;
    const qty = item.quantity;

    if (itemId === undefined || isNaN(Number(itemId)) || Number(itemId) <= 0) {
      return errorResponse(res, `Validation failed: Item at index ${i} has an invalid item_id.`, 400, 'VALIDATION_ERROR');
    }

    if (qty === undefined || typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) {
      return errorResponse(res, `Validation failed: Quantity for item at index ${i} must be a positive integer greater than or equal to 1.`, 400, 'VALIDATION_ERROR');
    }
  }

  return next();
}

/**
 * Validates pickup token verification payload: { pickup_token / token }
 */
function validateVerifyToken(req, res, next) {
  const rawToken = req.body ? (req.body.pickup_token || req.body.token) : null;

  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    return errorResponse(res, 'Validation failed: pickup_token is required.', 400, 'VALIDATION_ERROR');
  }

  req.body.pickup_token = rawToken.trim().toUpperCase();
  return next();
}

/**
 * Validates payment verification payload: { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
function validateVerifyPayment(req, res, next) {
  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  if (!order_id || isNaN(Number(order_id))) {
    return errorResponse(res, 'Validation failed: A valid order_id is required.', 400, 'VALIDATION_ERROR');
  }

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return errorResponse(res, 'Validation failed: Missing payment verification parameters (razorpay_order_id, razorpay_payment_id, razorpay_signature).', 400, 'VALIDATION_ERROR');
  }

  return next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateMenuItem,
  validateToggleAvailability,
  validateCreateOrder,
  validateVerifyToken,
  validateVerifyPayment
};
