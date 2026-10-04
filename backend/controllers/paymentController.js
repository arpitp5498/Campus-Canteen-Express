/**
 * Campus Canteen Express - Payment Controller
 * File: backend/controllers/paymentController.js
 */

const paymentService = require('../services/paymentService');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * POST /api/payments/webhook
 * Handle asynchronous Razorpay webhook events with signature validation and idempotency.
 */
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!signature) {
      return errorResponse(res, 'Missing x-razorpay-signature header', 400, 'INVALID_SIGNATURE');
    }

    const isValid = paymentService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn('[Webhook] Rejected webhook request: Invalid HMAC signature.');
      return errorResponse(res, 'Invalid webhook signature', 400, 'INVALID_SIGNATURE');
    }

    const result = await paymentService.processWebhookEvent(req.body);
    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      result
    });
  } catch (error) {
    console.error('[Webhook Error]', error);
    next(error);
  }
}

/**
 * POST /api/payments/retry
 * Generate fresh payment order descriptor for an existing unpaid order.
 */
async function retryPayment(req, res, next) {
  try {
    const userId = req.user.id;
    const orderId = req.body.order_id || req.body.orderId;

    const result = await paymentService.retryPaymentOrder(orderId, userId);
    return successResponse(res, result, 'Payment retry descriptor created', 200);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleWebhook,
  retryPayment
};
