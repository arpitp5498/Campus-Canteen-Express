/**
 * Campus Canteen Express - Structured Console Logger
 * File: backend/utils/logger.js
 */

const config = require('../config');

const isTest = config.isTest && !process.env.VERBOSE_LOGS;

function format(level, msg) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${msg}`;
}

const logger = {
  info: (msg, ...args) => {
    if (!isTest) console.log(format('info', msg), ...args);
  },
  warn: (msg, ...args) => {
    if (!isTest) console.warn(format('warn', msg), ...args);
  },
  error: (msg, ...args) => {
    // Only suppress in test mode when DEBUG is false
    if (!config.isTest || process.env.DEBUG) {
      console.error(format('error', msg), ...args);
    }
  },
  debug: (msg, ...args) => {
    if (config.isDevelopment && process.env.DEBUG) {
      console.log(format('debug', msg), ...args);
    }
  }
};

module.exports = logger;
