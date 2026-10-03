/**
 * Campus Canteen Express - Application Test Helper
 * Manages Express application instantiation and Supertest HTTP wrapper
 * without port conflicts or hanging listeners.
 */

const supertest = require('supertest');
const path = require('path');

let cachedApp = null;

/**
 * Retrieves or instantiates the Express application.
 * Ensures the app is loaded in test mode without binding to an external port.
 * 
 * @param {Object} [options] - Configuration overrides
 * @param {boolean} [options.fresh=false] - If true, reloads a fresh app instance
 * @returns {Express.Application} The configured Express app instance
 */
function getApp(options = {}) {
  if (options.fresh || !cachedApp) {
    // Ensure test environment
    process.env.NODE_ENV = 'test';

    // Clear require cache for app and routes if fresh instance requested
    if (options.fresh) {
      const appPath = path.resolve(__dirname, '../../backend/app.js');
      try {
        delete require.cache[require.resolve(appPath)];
      } catch (e) {}
    }

    try {
      // Primary: backend/app.js
      const appModule = require('../../backend/app');
      cachedApp = appModule.app || appModule;
    } catch (error) {
      try {
        // Fallback: backend/server.js
        const serverModule = require('../../backend/server');
        cachedApp = serverModule.app || serverModule;
      } catch (serverError) {
        throw new Error(
          `[appHelper] Failed to load Express app from backend/app.js or backend/server.js.\n` +
          `Error: ${error.message}`
        );
      }
    }
  }

  return cachedApp;
}

/**
 * Creates a Supertest request instance bound to the Express app.
 * 
 * @param {Express.Application} [customApp] - Optional custom Express app instance
 * @returns {supertest.SuperTest<supertest.Test>} Supertest request instance
 */
function request(customApp) {
  const targetApp = customApp || getApp();
  return supertest(targetApp);
}

/**
 * Creates a Supertest persistent agent for session/cookie persistence across requests.
 * 
 * @param {Express.Application} [customApp] - Optional custom Express app instance
 * @returns {supertest.SuperAgentTest} Supertest persistent agent
 */
function createSessionAgent(customApp) {
  const targetApp = customApp || getApp();
  return supertest.agent(targetApp);
}

/**
 * Cleanly teardown any cached app or background resources.
 */
function closeApp() {
  cachedApp = null;
}

module.exports = {
  getApp,
  request,
  createSessionAgent,
  closeApp
};
