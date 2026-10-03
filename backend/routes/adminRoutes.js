/**
 * Campus Canteen Express - Admin Order & Analytics Routes
 * File: backend/routes/adminRoutes.js
 */

const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const menuController = require('../controllers/menuController');
const slotController = require('../controllers/slotController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateVerifyToken, validateMenuItem } = require('../middleware/validator');

// All admin routes require token authentication and ADMIN/CANTEEN_STAFF role
router.use(verifyToken, requireAdmin);

// Order lifecycle and tracking
router.get('/orders', adminController.getAllOrders);
router.get('/orders/:id', adminController.getOrderById);
router.patch('/orders/:id/status', adminController.updateOrderStatus);
router.post('/orders/verify-token', validateVerifyToken, adminController.verifyPickupToken);

// Analytics dashboard
router.get('/analytics', adminController.getAnalyticsDashboard);
router.get('/analytics/dashboard', adminController.getAnalyticsDashboard);

// Admin catalog & slot mutations
router.post('/menu', validateMenuItem, menuController.createMenuItem);
router.put('/menu/:id', validateMenuItem, menuController.updateMenuItem);
router.delete('/menu/:id', menuController.deleteMenuItem);
router.patch('/slots/:id', slotController.updateSlotCapacity);

module.exports = router;
