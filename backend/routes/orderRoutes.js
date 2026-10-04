/**
 * Campus Canteen Express - Student Order Routes
 * File: backend/routes/orderRoutes.js
 */

const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimiter');
const { validateCreateOrder, validateVerifyPayment } = require('../middleware/validator');

router.post('/', verifyToken, orderLimiter, validateCreateOrder, orderController.createOrder);
router.post('/verify-payment', verifyToken, validateVerifyPayment, orderController.verifyPayment);
router.post('/:id/retry-payment', verifyToken, orderController.retryPayment);
router.post('/:id/payment-failed', verifyToken, orderController.recordPaymentFailure);
router.post('/:id/switch-to-cash', verifyToken, orderController.switchToCash);
router.post('/:id/simulate-test-payment', verifyToken, orderController.simulateTestPayment);
router.get('/my-orders', verifyToken, orderController.getMyOrders);
router.get('/:id', verifyToken, orderController.getOrderById);
router.post('/:id/cancel', verifyToken, orderController.cancelOrder);

module.exports = router;
