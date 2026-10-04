/**
 * Campus Canteen Express - Payment Service (Razorpay Test Mode & Automated Mock)
 * File: backend/services/paymentService.js
 */

const crypto = require('crypto');
const config = require('../config');
const db = require('../config/database');
const { AppError, ValidationError } = require('../middleware/errorHandler');

let Razorpay = null;
try {
  Razorpay = require('razorpay');
} catch (e) {
  // Graceful fallback if razorpay is not yet loaded in test environments
}

/**
 * Determine whether payment service is operating in Mock mode.
 * Real Razorpay mode is active when valid test or live keys are configured.
 * @returns {boolean}
 */
function isMockMode() {
  const keyId = (config.razorpay?.keyId || process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (config.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET || '').trim();

  if (!keyId || !keySecret) return true;
  if (keyId.startsWith('<') || keySecret.startsWith('<')) return true;
  if (keyId.toLowerCase().includes('mock') || keyId === 'rzp_test_mock') return true;
  return false;
}

/**
 * Get configured Razorpay SDK client instance (or null in mock mode).
 * @returns {Object|null}
 */
function getRazorpayInstance() {
  if (isMockMode()) return null;
  if (!Razorpay) {
    try {
      Razorpay = require('razorpay');
    } catch (err) {
      throw new AppError('Razorpay package is not installed.', 500, 'DEPENDENCY_MISSING');
    }
  }

  const keyId = (config.razorpay?.keyId || process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (config.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET || '').trim();

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
}

/**
 * Create a payment order descriptor for Razorpay or Mock checkout.
 * 
 * @param {Object} order - Order record { id, order_number, total_amount, user_id }
 * @returns {Promise<Object>} Payment order descriptor
 */
async function createPaymentOrder(order) {
  const amountInPaise = Math.round(Number(order.total_amount) * 100);
  const currency = 'INR';

  if (isMockMode()) {
    const mockOrderId = `order_mock_${order.id}_${Date.now()}`;
    return {
      is_mock: true,
      payment_mode: 'MOCK',
      razorpay_order_id: mockOrderId,
      amount: amountInPaise,
      currency: currency,
      key_id: 'rzp_test_mock'
    };
  }

  const rzp = getRazorpayInstance();
  try {
    const receipt = `rcpt_${order.order_number || order.id}`.slice(0, 40);
    const rzpOrder = await rzp.orders.create({
      amount: amountInPaise,
      currency: currency,
      receipt: receipt,
      notes: {
        order_id: String(order.id),
        order_number: String(order.order_number || order.id),
        user_id: String(order.user_id || '')
      }
    });

    return {
      is_mock: false,
      payment_mode: 'RAZORPAY',
      razorpay_order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key_id: (config.razorpay?.keyId || process.env.RAZORPAY_KEY_ID || '').trim()
    };
  } catch (error) {
    const errMsg = error?.error?.description || error?.message || 'Gateway connection issue';
    console.warn(`[PaymentService.createPaymentOrder] Razorpay API: ${errMsg}. Using fallback payment descriptor.`);
    const mockOrderId = `order_mock_${order.id}_${Date.now()}`;
    return {
      is_mock: true,
      payment_mode: 'MOCK',
      razorpay_order_id: mockOrderId,
      amount: amountInPaise,
      currency: currency,
      key_id: (config.razorpay?.keyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_mock').trim()
    };
  }
}

/**
 * Verify Razorpay payment signature or Mock payment token.
 * 
 * @param {Object} params
 * @param {string} params.razorpay_order_id - Razorpay Order ID
 * @param {string} params.razorpay_payment_id - Razorpay Payment ID
 * @param {string} params.razorpay_signature - Payment Signature
 * @returns {boolean} True if verification succeeds
 */
function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false;
  }

  // 1. Mock Signatures: Accepted ONLY for simulated mock tokens in mock mode
  const isMockToken = 
    razorpay_signature === 'mock_signature' ||
    razorpay_signature.startsWith('mock_') ||
    razorpay_order_id.startsWith('order_mock_') ||
    razorpay_payment_id.startsWith('pay_mock_');

  if (isMockMode() && isMockToken) {
    return true;
  }

  // 2. Cryptographic HMAC SHA-256 Verification
  try {
    const keySecret = (config.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!keySecret) {
      return isMockMode() && isMockToken;
    }

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(razorpay_signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (error) {
    console.error('[PaymentService.verifyPaymentSignature Error]', error.message);
    return false;
  }
}

/**
 * Validate Razorpay Webhook signature using RAZORPAY_WEBHOOK_SECRET.
 * 
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signature - x-razorpay-signature header
 * @returns {boolean} True if signature matches
 */
function verifyWebhookSignature(rawBody, signature) {
  const webhookSecret = (config.razorpay?.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    console.warn('[PaymentService.verifyWebhookSignature] RAZORPAY_WEBHOOK_SECRET is not configured.');
    return false;
  }

  if (!rawBody || !signature) {
    return false;
  }

  try {
    const bodyStr = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyStr)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (error) {
    console.error('[PaymentService.verifyWebhookSignature Error]', error.message);
    return false;
  }
}

/**
 * Idempotently process Razorpay webhook events (payment.captured, payment.failed, order.paid).
 * Prevents duplicate state transitions or duplicate records.
 * 
 * @param {Object} event - Webhook event payload
 * @returns {Promise<Object>} Processing summary
 */
async function processWebhookEvent(event) {
  if (!event || !event.event) {
    return { status: 'ignored', reason: 'invalid_event_structure' };
  }

  const eventType = event.event;
  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;

  const rzpOrderId = paymentEntity?.order_id || orderEntity?.id;
  const rzpPaymentId = paymentEntity?.id;

  if (!rzpOrderId && !rzpPaymentId) {
    return { status: 'ignored', reason: 'missing_identifiers' };
  }

  return await db.transaction(async (tx) => {
    // Look up existing payment record
    let payment = null;
    if (rzpOrderId) {
      payment = await tx.get(
        'SELECT * FROM payments WHERE razorpay_order_id = ?',
        [rzpOrderId]
      );
    }
    if (!payment && rzpPaymentId) {
      payment = await tx.get(
        'SELECT * FROM payments WHERE razorpay_payment_id = ?',
        [rzpPaymentId]
      );
    }

    if (!payment) {
      // Check notes for internal order_id if present
      const internalOrderId = paymentEntity?.notes?.order_id || orderEntity?.notes?.order_id;
      if (internalOrderId) {
        payment = await tx.get(
          'SELECT * FROM payments WHERE order_id = ?',
          [Number(internalOrderId)]
        );
      }
    }

    if (!payment) {
      return { status: 'skipped', reason: 'no_matching_payment_record' };
    }

    // 1. Payment Captured / Order Paid
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      if (payment.status === 'SUCCESS') {
        return { status: 'idempotent_duplicate', message: 'Payment already marked SUCCESS', payment_id: payment.id };
      }

      await tx.run(
        `UPDATE payments
         SET status = 'SUCCESS',
             razorpay_payment_id = COALESCE(?, razorpay_payment_id),
             payment_method = 'RAZORPAY',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [rzpPaymentId || null, payment.id]
      );

      // Verify order is in active PLACED state
      await tx.run(
        `UPDATE orders
         SET status = CASE WHEN status = 'INITIATED' THEN 'PLACED' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [payment.order_id]
      );

      return { status: 'processed', action: 'marked_success', payment_id: payment.id, order_id: payment.order_id };
    }

    // 2. Payment Failed
    if (eventType === 'payment.failed') {
      // Do NOT overwrite SUCCESS (e.g. if a subsequent retry succeeded before delayed failure webhook)
      if (payment.status === 'SUCCESS') {
        return { status: 'ignored', message: 'Order is already successfully paid' };
      }

      await tx.run(
        `UPDATE payments
         SET status = 'FAILED',
             razorpay_payment_id = COALESCE(?, razorpay_payment_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [rzpPaymentId || null, payment.id]
      );

      return { status: 'processed', action: 'marked_failed', payment_id: payment.id };
    }

    return { status: 'ignored', event: eventType };
  });
}

/**
 * Generate a fresh payment order descriptor for safe retry on an existing order.
 * 
 * @param {number} orderId - Internal Order ID
 * @param {number} userId - Authenticated User ID
 * @returns {Promise<Object>} Fresh payment descriptor
 */
async function retryPaymentOrder(orderId, userId) {
  const numOrderId = Number(orderId);
  if (!numOrderId || isNaN(numOrderId)) {
    throw new ValidationError('Valid order ID is required for payment retry.');
  }

  const order = await db.get('SELECT * FROM orders WHERE id = ?', [numOrderId]);
  if (!order) {
    throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
  }

  if (order.user_id !== userId) {
    throw new AppError('You are not authorized to retry payment for this order.', 403, 'FORBIDDEN');
  }

  if (order.status === 'CANCELLED') {
    throw new AppError('Cannot pay for a cancelled order. Please place a new order.', 400, 'ORDER_CANCELLED');
  }

  const payment = await db.get('SELECT * FROM payments WHERE order_id = ?', [numOrderId]);
  if (payment && payment.status === 'SUCCESS') {
    throw new AppError('Payment for this order has already succeeded.', 400, 'ALREADY_PAID');
  }

  // Generate fresh payment order descriptor
  const newDescriptor = await createPaymentOrder(order);

  // Update existing payment row with the new razorpay_order_id and reset status to PENDING
  if (payment) {
    await db.run(
      `UPDATE payments 
       SET razorpay_order_id = ?, 
           status = 'PENDING', 
           payment_method = ?,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newDescriptor.razorpay_order_id, newDescriptor.payment_mode, payment.id]
    );
  } else {
    await db.run(
      `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, razorpay_order_id, status)
       VALUES (?, ?, ?, 'INR', ?, ?, 'PENDING')`,
      [order.id, userId, order.total_amount, newDescriptor.payment_mode, newDescriptor.razorpay_order_id]
    );
  }

  return {
    order_id: order.id,
    order_number: order.order_number,
    total_amount: order.total_amount,
    payment: newDescriptor
  };
}

module.exports = {
  isMockMode,
  createPaymentOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  processWebhookEvent,
  retryPaymentOrder
};
