/**
 * Campus Canteen Express - Payment Routes
 * File: backend/routes/paymentRoutes.js
 */

const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/auth');

// Public Webhook route (authenticated by cryptographic HMAC signature header)
router.post('/webhook', paymentController.handleWebhook);

// Protected payment retry route
router.post('/retry', verifyToken, paymentController.retryPayment);

module.exports = router;
