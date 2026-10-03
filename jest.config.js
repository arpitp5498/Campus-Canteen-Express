/**
 * Campus Canteen Express - Jest Configuration
 * Optimized for Node.js backend integration and E2E testing with SQLite
 */

module.exports = {
  // Use Node environment for backend API testing
  testEnvironment: 'node',

  // Verbose test output with individual test reporting
  verbose: true,

  // Root directory for test discovery
  rootDir: './',

  // Pattern matching all test files
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],

  // Exclude node_modules and temporary database directories
  testPathIgnorePatterns: [
    '/node_modules/',
    '/database/test/'
  ],

  // Global setup file executed before each test suite
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Enforce single worker execution to prevent SQLite database lock contention
  maxWorkers: 1,

  // Global test timeout (15 seconds) to accommodate bcrypt and chained HTTP requests
  testTimeout: 15000,

  // Detect open handles (unclosed servers, database connections, timers)
  detectOpenHandles: true,

  // Force exit after all tests complete
  forceExit: false,

  // Clear / reset mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
