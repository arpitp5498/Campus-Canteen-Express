/**
 * Campus Canteen Express - Server Entry Point & Lifecycle Manager
 * File: backend/server.js
 */

const app = require('./app');
const config = require('./config');
const db = require('./config/database');
const logger = require('./utils/logger');

let server = null;

async function startServer() {
  // 1. Verify Database Health
  const isDbAlive = await db.ping();
  if (!isDbAlive) {
    logger.error('CRITICAL: Database connection check failed on startup.');
    process.exit(1);
  }
  logger.info(`Database connected and healthy at: ${db.dbPath}`);

  // 2. Start HTTP Listener with Port Fallback
  const targetPort = config.port;
  function tryListen(currentPort, retriesLeft = 3) {
    return new Promise((resolve, reject) => {
      const s = app.listen(currentPort, () => {
        logger.info(`Campus Canteen Express Server running in ${config.env} mode on port ${currentPort}`);
        logger.info(`REST API accessible at: http://localhost:${currentPort}/api`);
        logger.info(`Health check: http://localhost:${currentPort}/api/health`);
        if (config.razorpay.isMockMode) {
          logger.info('Payment Service: Operating in Automated Mock Mode (Keys unset or mock)');
        } else {
          logger.info('Payment Service: Operating in Live Razorpay Mode');
        }
        resolve(s);
      });
      s.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
          logger.warn(`Port ${currentPort} is currently in use. Attempting fallback port ${currentPort + 1}...`);
          resolve(tryListen(currentPort + 1, retriesLeft - 1));
        } else {
          reject(err);
        }
      });
    });
  }

  server = await tryListen(targetPort);

  // 3. Graceful Shutdown Handlers
  function handleGracefulShutdown(signal) {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    if (server) {
      server.close(() => {
        logger.info('HTTP server closed.');
        db.close();
        process.exit(0);
      });

      // Force close if graceful termination hangs
      setTimeout(() => {
        logger.error('Forced shutdown timeout exceeded. Exiting immediately.');
        process.exit(1);
      }, 5000).unref();
    } else {
      db.close();
      process.exit(0);
    }
  }

  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  get server() {
    return server;
  }
};
