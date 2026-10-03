/**
 * Campus Canteen Express - Rate Limiting Middleware
 * File: backend/middleware/rateLimiter.js
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');

const isTest = config.isTest;

/**
 * Auth Rate Limiter: 10 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again in 15 minutes.'
    }
  }
});

/**
 * Order Creation Rate Limiter: 20 requests per 15 minutes per IP.
 */
const orderLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.orderMax,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many order requests. Please wait a few minutes before placing more orders.',
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many order requests. Please wait a few minutes before placing more orders.'
    }
  }
});

/**
 * General API Rate Limiter: 100 requests per 15 minutes per IP.
 */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.apiMax,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'API rate limit exceeded. Please try again later.',
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'API rate limit exceeded. Please try again later.'
    }
  }
});

module.exports = {
  authLimiter,
  orderLimiter,
  apiLimiter
};
