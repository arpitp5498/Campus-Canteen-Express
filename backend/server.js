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
    const err = db.getLastPingError();
    logger.error('CRITICAL: Database connection check failed on startup.');
    if (err) {
      if (err.code === 'ECONNREFUSED') {
        logger.error(`Could not connect to MySQL server at ${config.db.host}:${config.db.port} (Connection Refused).`);
        logger.error(`Please verify that MySQL is running. You can start it with: npm run db:start`);
      } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
        logger.error(`MySQL authentication failed for user '${config.db.user}'. Please check DB_USER and DB_PASSWORD in .env.`);
      } else if (err.code === 'ER_BAD_DB_ERROR') {
        logger.error(`Database '${config.db.database}' does not exist on MySQL server.`);
      } else {
        logger.error(`MySQL Error [${err.code || 'UNKNOWN'}]: ${err.message}`);
      }
    }
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
