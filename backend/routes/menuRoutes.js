/**
 * Campus Canteen Express - Menu Routes
 * File: backend/routes/menuRoutes.js
 */

const express = require('express');
const router = express.Router();

const menuController = require('../controllers/menuController');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validateMenuItem, validateToggleAvailability } = require('../middleware/validator');

// Public catalog routes
router.get('/', menuController.getMenu);
router.get('/:id', menuController.getMenuItemById);

// Admin management routes
router.post('/', verifyToken, requireAdmin, validateMenuItem, menuController.createMenuItem);
router.put('/:id', verifyToken, requireAdmin, validateMenuItem, menuController.updateMenuItem);
router.patch('/:id/availability', verifyToken, requireAdmin, validateToggleAvailability, menuController.toggleAvailability);
router.patch('/:id/toggle', verifyToken, requireAdmin, validateToggleAvailability, menuController.toggleAvailability);
router.delete('/:id', verifyToken, requireAdmin, menuController.deleteMenuItem);

module.exports = router;
