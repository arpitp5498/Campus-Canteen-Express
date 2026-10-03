/**
 * Campus Canteen Express - Order Controller
 * File: backend/controllers/orderController.js
 */

const orderService = require('../services/orderService');
const { successResponse } = require('../utils/response');

/**
 * POST /api/orders
 * Place a new food pre-order with atomic slot reservation & server-side price recalculation.
 */
async function createOrder(req, res, next) {
  try {
    const userId = req.user.id;
    const { slot_id, pickup_slot_id, items, order_type } = req.body;

    const result = await orderService.createOrder(userId, { slot_id, pickup_slot_id, items, order_type });

    return successResponse(res, result, 'Order placed successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/verify-payment
 * Verify Razorpay payment signature or automated Mock token.
 */
async function verifyPayment(req, res, next) {
  try {
    const userId = req.user ? req.user.id : null;
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const result = await orderService.verifyPayment(userId, {
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    return successResponse(res, result, result.message || 'Payment verified successfully', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/orders/my-orders
 * Retrieve list of orders placed by authenticated student.
 */
async function getMyOrders(req, res, next) {
  try {
    const userId = req.user.id;
    const orders = await orderService.getUserOrders(userId);

    return successResponse(res, { orders }, 'Orders retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/orders/:id
 * Retrieve single order details by ID for student or admin.
 */
async function getOrderById(req, res, next) {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'CANTEEN_STAFF';

    const order = await orderService.getOrderById(orderId, userId, isAdmin);

    return successResponse(res, { order }, 'Order retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/orders/:id/cancel
 * Cancel order if in PLACED or ACCEPTED status and release pickup slot count.
 */
async function cancelOrder(req, res, next) {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'CANTEEN_STAFF';
    const reason = req.body ? req.body.cancellation_reason : null;

    const order = await orderService.cancelOrder(orderId, userId, isAdmin, reason);

    return successResponse(res, { order }, 'Order cancelled successfully', 200);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  getMyOrders,
  getOrderById,
  cancelOrder
};
