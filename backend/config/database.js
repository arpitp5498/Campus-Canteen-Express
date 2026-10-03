/**
 * Campus Canteen Express - Database Connection & Abstraction Layer (MySQL)
 * File: backend/config/database.js
 * 
 * Provides a standardized, Promise-wrapped query and transaction interface
 * over high-performance mysql2 connection pool with InnoDB ACID transactions,
 * parameterized query execution, and connection pooling.
 */

const mysql = require('mysql2/promise');
const config = require('./index');

// 1. Initialize MySQL Connection Pool
const isDev = config.isDevelopment;
const isVerbose = isDev && process.env.DEBUG_SQL === 'true';

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 20,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  multipleStatements: true,
  dateStrings: true,
  charset: 'utf8mb4_unicode_ci'
});

/**
 * Execute a SQL query and return all matching rows.
 * @param {string} sql - Parameterized SQL query string
 * @param {Array} [params=[]] - Query parameters
 * @returns {Promise<Array<Object>>}
 */
async function query(sql, params = []) {
  try {
    if (isVerbose) console.log(`[SQL Query] ${sql} | Params:`, params);
    const [rows] = await pool.query(sql, params);
    return Array.isArray(rows) ? rows : [rows];
  } catch (error) {
    if (process.env.NODE_ENV !== 'test' || process.env.DEBUG) {
      console.error(`[DB Query Error] SQL: ${sql}`, error);
    }
    throw error;
  }
}

/**
 * Execute a SQL query and return the first matching row or null.
 * @param {string} sql - Parameterized SQL query string
 * @param {Array} [params=[]] - Query parameters
 * @returns {Promise<Object|null>}
 */
async function get(sql, params = []) {
  try {
    if (isVerbose) console.log(`[SQL Get] ${sql} | Params:`, params);
    const [rows] = await pool.query(sql, params);
    if (!rows || rows.length === 0) {
      return null;
    }
    return rows[0];
  } catch (error) {
    if (process.env.NODE_ENV !== 'test' || process.env.DEBUG) {
      console.error(`[DB Get Error] SQL: ${sql}`, error);
    }
    throw error;
  }
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement.
 * @param {string} sql - Parameterized SQL query string
 * @param {Array} [params=[]] - Query parameters
 * @returns {Promise<{ lastInsertRowid: number, changes: number }>}
 */
async function run(sql, params = []) {
  try {
    if (isVerbose) console.log(`[SQL Run] ${sql} | Params:`, params);
    const [result] = await pool.query(sql, params);
    return {
      lastInsertRowid: result.insertId,
      changes: result.affectedRows
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test' || process.env.DEBUG) {
      console.error(`[DB Run Error] SQL: ${sql}`, error);
    }
    throw error;
  }
}

/**
 * Execute a raw multi-statement SQL script (e.g. schema creation / migrations).
 * @param {string} sql - Raw SQL script
 * @returns {Promise<void>}
 */
async function exec(sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test' || process.env.DEBUG) {
      console.error('[DB Exec Error]', error);
    }
    throw error;
  }
}

/**
 * Execute a series of database operations inside an atomic ACID transaction.
 * Automatically handles BEGIN, COMMIT, or ROLLBACK and returns connection to pool.
 * 
 * @template T
 * @param {function(tx: { query: Function, get: Function, run: Function, exec: Function }): Promise<T>} callback
 * @returns {Promise<T>}
 */
async function transaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params = []) => {
        const [rows] = await conn.query(sql, params);
        return Array.isArray(rows) ? rows : [rows];
      },
      get: async (sql, params = []) => {
        const [rows] = await conn.query(sql, params);
        if (!rows || rows.length === 0) return null;
        return rows[0];
      },
      run: async (sql, params = []) => {
        const [result] = await conn.query(sql, params);
        return {
          lastInsertRowid: result.insertId,
          changes: result.affectedRows
        };
      },
      exec: async (sql) => {
        await conn.query(sql);
      }
    };

    const result = await callback(tx);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    if (process.env.NODE_ENV !== 'test' || process.env.DEBUG) {
      console.error('[DB Transaction Failed - Rolled Back]', error);
    }
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Gracefully close database connection pool.
 */
async function close() {
  try {
    await pool.end();
    if (isDev) console.log('[DB] MySQL connection pool closed cleanly.');
  } catch (err) {
    console.error('[DB] Error during pool close:', err);
  }
}

/**
 * Check connection health / ping.
 * @returns {Promise<boolean>}
 */
async function ping() {
  try {
    const [rows] = await pool.query('SELECT 1 as alive');
    return Boolean(rows && rows[0] && rows[0].alive === 1);
  } catch {
    return false;
  }
}

/**
 * Compatibility wrapper for SQLite-style db.prepare(sql) calls
 */
function prepare(sql) {
  return {
    get: async (...params) => {
      const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return await get(sql, flattened);
    },
    all: async (...params) => {
      const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return await query(sql, flattened);
    },
    run: async (...params) => {
      const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return await run(sql, flattened);
    }
  };
}

// Register process exit listeners for clean shutdown
if (process.env.NODE_ENV !== 'test') {
  process.once('SIGINT', async () => { await close(); process.exit(0); });
  process.once('SIGTERM', async () => { await close(); process.exit(0); });
}

module.exports = {
  query,
  get,
  run,
  exec,
  transaction,
  prepare,
  close,
  ping,
  pool,
  dbPath: `mysql://${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`
};
