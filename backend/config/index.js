/**
 * Campus Canteen Express - Global Application Configuration
 * File: backend/config/index.js
 */

require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const isDevelopment = nodeEnv === 'development' || !process.env.NODE_ENV;

const port = parseInt(process.env.PORT, 10) || 5000;
const databaseUrl = process.env.DATABASE_URL || '';

// MySQL connection parameters
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT, 10) || 3306;
const dbUser = process.env.DB_USER || 'campuscanteen';
const dbPassword = process.env.DB_PASSWORD || 'campuscanteen';
const dbName = process.env.DB_NAME || (isTest ? 'campus_canteen_test' : 'campus_canteen');

const jwtSecret = process.env.JWT_SECRET || (
  isTest
    ? 'test_jwt_super_secret_key_canteen_express_2026'
    : 'campus_canteen_express_jwt_secret_key_dev_2026_secure'
);

const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
const expressPickupFee = parseFloat(process.env.EXPRESS_PICKUP_FEE) || 3.00;
const expressFeeToday = parseFloat(process.env.EXPRESS_FEE_TODAY) || 3.00;
const expressFeeTomorrow = parseFloat(process.env.EXPRESS_FEE_TOMORROW) || 1.00;

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const isMockPayment = !razorpayKeyId || !razorpayKeySecret || 
  razorpayKeyId.toLowerCase().includes('mock') || 
  razorpayKeyId.toLowerCase().includes('test');

const config = {
  env: nodeEnv,
  NODE_ENV: nodeEnv,
  isProduction,
  isTest,
  isDevelopment,

  port,
  PORT: port,

  databaseUrl,
  DATABASE_URL: databaseUrl,

  db: {
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    connectionUrl: databaseUrl
  },

  jwtSecret,
  JWT_SECRET: jwtSecret,
  jwtExpiresIn,
  JWT_EXPIRES_IN: jwtExpiresIn,

  expressPickupFee,
  EXPRESS_PICKUP_FEE: expressPickupFee,
  expressFeeToday,
  EXPRESS_FEE_TODAY: expressFeeToday,
  expressFeeTomorrow,
  EXPRESS_FEE_TOMORROW: expressFeeTomorrow,

  razorpay: {
    keyId: razorpayKeyId,
    keySecret: razorpayKeySecret,
    isMockMode: isMockPayment
  },
  RAZORPAY_KEY_ID: razorpayKeyId,
  RAZORPAY_KEY_SECRET: razorpayKeySecret,

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 10,
    orderMax: parseInt(process.env.RATE_LIMIT_ORDER_MAX, 10) || 20,
    apiMax: parseInt(process.env.RATE_LIMIT_API_MAX, 10) || 100
  },

  corsOrigin: process.env.CORS_ORIGIN || '*'
};

module.exports = config;
