/**
 * Campus Canteen Express - Pickup Slot Routes
 * File: backend/routes/slotRoutes.js
 */

const express = require('express');
const router = express.Router();

const slotController = require('../controllers/slotController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// Public slot discovery
router.get('/', slotController.getAvailableSlots);
router.get('/available', slotController.getAvailableSlots);
router.get('/:id', slotController.getSlotById);

// Admin slot capacity update
router.patch('/:id', verifyToken, requireAdmin, slotController.updateSlotCapacity);

module.exports = router;
