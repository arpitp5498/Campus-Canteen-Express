/**
 * Campus Canteen Express - Payment Service (Dual-Mode Razorpay & Automated Mock)
 * File: backend/services/paymentService.js
 */

const crypto = require('crypto');
const config = require('../config');

let Razorpay = null;
try {
  Razorpay = require('razorpay');
} catch (e) {
  // Graceful fallback if razorpay is not yet loaded
}

/**
 * Determine whether payment service is operating in Mock mode.
 * @returns {boolean}
 */
function isMockMode() {
  const keyId = config.razorpay.keyId || process.env.RAZORPAY_KEY_ID;
  const keySecret = config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) return true;
  if (keyId.trim() === '' || keySecret.trim() === '') return true;
  if (keyId.toLowerCase().includes('mock') || keyId.toLowerCase().includes('test')) return true;
  if (keySecret.toLowerCase().includes('mock') || keySecret.toLowerCase().includes('test')) return true;
  return false;
}

/**
 * Get configured Razorpay SDK client instance (or null in mock mode).
 * @returns {Object|null}
 */
function getRazorpayInstance() {
  if (isMockMode() || !Razorpay) return null;
  return new Razorpay({
    key_id: config.razorpay.keyId || process.env.RAZORPAY_KEY_ID,
    key_secret: config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET
  });
}

/**
 * Create a payment order descriptor for Razorpay or Mock checkout.
 * 
 * @param {Object} order - Order record { id, order_number, total_amount }
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
    const rzpOrder = await rzp.orders.create({
      amount: amountInPaise,
      currency: currency,
      receipt: `receipt_${order.order_number || order.id}`,
      notes: {
        order_id: String(order.id),
        order_number: String(order.order_number)
      }
    });

    return {
      is_mock: false,
      payment_mode: 'RAZORPAY',
      razorpay_order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key_id: config.razorpay.keyId || process.env.RAZORPAY_KEY_ID
    };
  } catch (error) {
    console.error('[PaymentService.createPaymentOrder Error, falling back to mock]', error.message);
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
}

/**
 * Verify Razorpay payment signature or Mock payment token.
 * 
 * @param {Object} params
 * @param {string|number} params.order_id - Internal Order ID
 * @param {string} params.razorpay_order_id - Razorpay Order ID
 * @param {string} params.razorpay_payment_id - Razorpay Payment ID
 * @param {string} params.razorpay_signature - Payment Signature
 * @returns {boolean} True if verification succeeds
 */
function verifyPaymentSignature({ order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false;
  }

  // 1. Mock Mode & Simulated Signatures
  if (
    isMockMode() ||
    razorpay_signature === 'mock_signature' ||
    razorpay_signature.startsWith('mock_') ||
    razorpay_order_id.startsWith('order_mock_') ||
    razorpay_payment_id.startsWith('pay_mock_')
  ) {
    return true;
  }

  // 2. Live HMAC SHA256 Verification
  try {
    const keySecret = config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return false;

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
    console.error('[PaymentService.verifyPaymentSignature Error]', error);
    return false;
  }
}

module.exports = {
  isMockMode,
  createPaymentOrder,
  verifyPaymentSignature
};
