/**
 * Campus Canteen Express - Database Test Helper (MySQL Compatible)
 * Manages test database lifecycle, schema initialization,
 * 23-item menu and slot seeding, truncation, and clean teardown.
 */

const db = require('../../backend/config/database');
const { initDb } = require('../../database/init');
const { seedDb } = require('../../database/seed');

let isInitialized = false;

/**
 * Initializes the MySQL test database connection.
 * 
 * @returns {{ db: Object, dbPath: string }}
 */
function initTestDb() {
  if (!isInitialized) {
    try {
      initDb();
      isInitialized = true;
    } catch (e) {
      // In case init is already run
    }
  }

  return { db, dbPath: 'mysql:campus_canteen' };
}

/**
 * Seeds the database with all 23 confirmed menu items, variants,
 * pickup slots, and default student/admin accounts.
 * 
 * @param {Object} [targetDb]
 * @param {Object} [options]
 * @returns {Promise<void>}
 */
async function seedTestDb(targetDb, options = {}) {
  return await seedDb();
}

/**
 * Cleans dynamic transaction data (orders, items, payments) while preserving menu/users.
 * 
 * @param {Object} [targetDb]
 * @returns {Promise<void>}
 */
async function cleanTestDb(targetDb) {
  const d = targetDb || db;
  try {
    await d.run('SET FOREIGN_KEY_CHECKS = 0');
    await d.run('DELETE FROM payments');
    await d.run('DELETE FROM order_items');
    await d.run('DELETE FROM orders');
    await d.run('UPDATE pickup_slots SET current_orders = 0');
    await d.run('SET FOREIGN_KEY_CHECKS = 1');
  } catch (e) {}
}

/**
 * Resets and re-seeds the database.
 * 
 * @param {Object} [targetDb]
 * @param {Object} [options]
 * @returns {Promise<void>}
 */
async function resetTestDb(targetDb, options = {}) {
  await cleanTestDb(targetDb);
  return await seedTestDb(targetDb, options);
}

/**
 * Teardown helper for test suites.
 */
function closeAndRemoveTestDb(targetDb, dbPath) {
  // MySQL connection pool remains open for other test suites in Jest
}

/**
 * Legacy aliases for backwards compatibility
 */
function createTestDatabase() {
  const { db } = initTestDb();
  seedTestDb(db);
  return db;
}

function cleanupTestDatabase() {
  closeAndRemoveTestDb(db, 'mysql:campus_canteen');
}

module.exports = {
  TEST_DB_DIR: null,
  initTestDb,
  seedTestDb,
  cleanTestDb,
  resetTestDb,
  closeAndRemoveTestDb,
  createTestDatabase,
  cleanupTestDatabase,
  getTestDb: () => db
};
