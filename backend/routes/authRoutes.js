/**
 * Campus Canteen Express - Authentication Routes
 * File: backend/routes/authRoutes.js
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validateRegister, validateLogin } = require('../middleware/validator');

router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
