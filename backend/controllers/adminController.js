/**
 * Campus Canteen Express - Admin Order & Analytics Controller
 * File: backend/controllers/adminController.js
 */

const orderService = require('../services/orderService');
const { successResponse } = require('../utils/response');
const { ValidationError } = require('../middleware/errorHandler');

/**
 * GET /api/admin/orders
 * Fetch all orders with optional status, date filters and pagination.
 */
async function getAllOrders(req, res, next) {
  try {
    const { status, date, limit, offset } = req.query;
    const orders = await orderService.getAdminOrders({ status, date, limit, offset });

    return successResponse(res, { orders }, 'Admin orders retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/orders/:id/status
 * Transition order status through strict deterministic state machine.
 */
async function updateOrderStatus(req, res, next) {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    if (!status || typeof status !== 'string') {
      throw new ValidationError('Target order status is required.');
    }

    const order = await orderService.advanceOrderStatus(orderId, status);

    return successResponse(res, { order }, `Order status updated to ${order.status}`, 200);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/orders/verify-token
 * Verify manual 4-character pickup token entry at the Express Pickup Counter.
 */
async function verifyPickupToken(req, res, next) {
  try {
    const rawToken = req.body.pickup_token || req.body.token;

    if (!rawToken || typeof rawToken !== 'string') {
      throw new ValidationError('Pickup token is required for counter verification.');
    }

    const order = await orderService.verifyPickupToken(rawToken);

    return successResponse(res, { order }, 'Pickup token verified successfully. Order is READY for collection.', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/analytics/dashboard
 * Retrieve executive metrics, revenue, status breakdown, popular items, and peak slots.
 */
async function getAnalyticsDashboard(req, res, next) {
  try {
    const { date } = req.query;
    const stats = await orderService.getAdminAnalytics(date);

    return successResponse(res, { stats }, 'Dashboard analytics retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/orders/:id
 * Retrieve a single order detail for admin (strictly excludes pickup_token).
 */
async function getOrderById(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await orderService.getOrderById(orderId, req.user?.id, true);

    return successResponse(res, { order }, 'Admin order detail retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  verifyPickupToken,
  getAnalyticsDashboard
};


