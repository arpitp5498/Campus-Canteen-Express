/**
 * Campus Canteen Express - Database Initialization & Schema Runner (MySQL)
 * File: database/init.js
 * 
 * Initializes the MySQL database and applies the 7-table schema idempotently.
 */

const fs = require('fs');
const path = require('path');
const db = require('../backend/config/database');
require('dotenv').config();

const SCHEMA_PATH = path.join(__dirname, 'schema.mysql.sql');

async function initDb() {
  try {
    if (!fs.existsSync(SCHEMA_PATH)) {
      throw new Error(`Schema file not found at: ${SCHEMA_PATH}`);
    }

    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    await db.exec(schemaSql);

    console.log(`[Database Init] MySQL database schema successfully initialized.`);
  } catch (error) {
    console.error(`[Database Init Error] Failed to initialize MySQL schema:`, error.message);
    throw error;
  }
}

// Allow CLI invocation
if (require.main === module) {
  initDb()
    .then(async () => {
      await db.close();
      console.log('[Database Init] Initialization completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Database Init] Migration aborted due to error.');
      process.exit(1);
    });
}

module.exports = { initDb };
