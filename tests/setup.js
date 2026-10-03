/**
 * Campus Canteen Express - Global Test Setup
 * Configures environment variables and test lifecycle defaults
 */

// 1. Force test environment
process.env.NODE_ENV = 'test';

// 2. Set default test secrets and configurations
process.env.PORT = process.env.PORT || '0';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_super_secret_key_canteen_express_2026';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
process.env.EXPRESS_PICKUP_FEE = process.env.EXPRESS_PICKUP_FEE || '3';

// 3. Clear Razorpay credentials to force Mock Payment mode
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';

// 4. Suppress console output during tests unless DEBUG=true
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error logging for debugging genuine failures
    error: console.error
  };
}

// 5. Global timeout setting
jest.setTimeout(15000);

// 6. Global DB initialization & seeding before test suites run
const { initDb } = require('../database/init');
const { seedDb } = require('../database/seed');
const db = require('../backend/config/database');

beforeAll(async () => {
  await initDb();
  await seedDb();
});

afterAll(async () => {
  await db.close();
});

