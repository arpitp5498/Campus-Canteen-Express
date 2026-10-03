/**
 * Campus Canteen Express - Authentication Test Helper
 * Provides automated user registration, token acquisition, and HTTP header factories.
 */

const jwt = require('jsonwebtoken');
const { request } = require('./appHelper');

const DEFAULT_JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_super_secret_key_canteen_express_2026';

// Pre-seeded credentials matching dbHelper fixtures
const DEFAULT_CREDENTIALS = {
  student: {
    email: 'student@campus.edu',
    password: 'Student@12345',
    name: 'Demo Student',
    role: 'STUDENT'
  },
  admin: {
    email: 'admin@canteen.local',
    password: 'Admin@123',
    name: 'Canteen Admin',
    role: 'ADMIN'
  },
  adminAlt: {
    email: 'admin@campus.edu',
    password: 'Admin@12345',
    name: 'Canteen Admin Alt',
    role: 'ADMIN'
  }
};

/**
 * Formats a Bearer token authorization header object.
 * 
 * @param {string} token - The raw JWT token string
 * @returns {Object} { Authorization: 'Bearer <token>' }
 */
function createAuthHeader(token) {
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

/**
 * Logs in a user via the API and returns the JWT token and user profile.
 * 
 * @param {Object} [credentials] - Login credentials { email, password }
 * @param {Express.Application} [app] - Optional custom app
 * @returns {Promise<{ token: string, user: Object, headers: Object }>}
 */
async function loginUser(credentials, app) {
  const res = await request(app)
    .post('/api/auth/login')
    .send(credentials);

  if (res.status !== 200 || !res.body.success) {
    throw new Error(
      `[authHelper.loginUser] Login failed for ${credentials.email} with status ${res.status}: ` +
      `${JSON.stringify(res.body)}`
    );
  }

  const token = res.body.token || res.body.data?.token;
  const user = res.body.user || res.body.data?.user;

  return {
    token,
    user,
    headers: createAuthHeader(token)
  };
}

/**
 * Registers a new test user via the API.
 * 
 * @param {Object} [userData] - User details { name, email, password, role }
 * @param {Express.Application} [app] - Optional custom app
 * @returns {Promise<{ token: string, user: Object, credentials: Object, headers: Object }>}
 */
async function registerTestUser(userData = {}, app) {
  const uniqueId = Math.random().toString(36).substring(2, 8);
  const payload = {
    name: userData.name || `Test User ${uniqueId}`,
    email: userData.email || `user_${uniqueId}_${Date.now()}@campus.edu`,
    password: userData.password || 'TestPass@123',
    role: userData.role || 'STUDENT'
  };

  const res = await request(app)
    .post('/api/auth/register')
    .send(payload);

  if (res.status !== 201 || !res.body.success) {
    throw new Error(
      `[authHelper.registerTestUser] Registration failed for ${payload.email} with status ${res.status}: ` +
      `${JSON.stringify(res.body)}`
    );
  }

  const token = res.body.token || res.body.data?.token;
  const user = res.body.user || res.body.data?.user;

  return {
    token,
    user,
    credentials: payload,
    headers: createAuthHeader(token)
  };
}

/**
 * Obtains an authenticated student session (token, user, headers).
 * 
 * @param {Express.Application} [app]
 * @param {Object} [customCreds]
 * @returns {Promise<{ token: string, user: Object, headers: Object }>}
 */
async function getAuthenticatedStudent(app, customCreds) {
  const creds = customCreds || DEFAULT_CREDENTIALS.student;
  try {
    return await loginUser(creds, app);
  } catch (err) {
    if (creds.password === 'Student@123') {
      try {
        return await loginUser({ ...creds, password: 'Student@12345' }, app);
      } catch (e) {}
    } else if (creds.password === 'Student@12345') {
      try {
        return await loginUser({ ...creds, password: 'Student@123' }, app);
      } catch (e) {}
    }
    // If user is not present in test DB, register a fresh test user
    const uniqueEmail = `student_${Math.random().toString(36).substring(2, 8)}_${Date.now()}@campus.edu`;
    return await registerTestUser({ ...creds, email: uniqueEmail }, app);
  }
}

/**
 * Obtains an authenticated admin session (token, user, headers).
 * 
 * @param {Express.Application} [app]
 * @param {Object} [customCreds]
 * @returns {Promise<{ token: string, user: Object, headers: Object }>}
 */
async function getAuthenticatedAdmin(app, customCreds) {
  const creds = customCreds || DEFAULT_CREDENTIALS.admin;
  try {
    return await loginUser(creds, app);
  } catch (err) {
    try {
      return await loginUser(DEFAULT_CREDENTIALS.adminAlt, app);
    } catch (altErr) {
      const uniqueEmail = `admin_${Math.random().toString(36).substring(2, 8)}_${Date.now()}@canteen.local`;
      return await registerTestUser({ ...creds, email: uniqueEmail, role: 'ADMIN' }, app);
    }
  }
}

/**
 * Convenience helper to get just the Student JWT string.
 */
async function getStudentToken(app, customCreds) {
  const auth = await getAuthenticatedStudent(app, customCreds);
  return auth.token;
}

/**
 * Convenience helper to get just the Admin JWT string.
 */
async function getAdminToken(app, customCreds) {
  const auth = await getAuthenticatedAdmin(app, customCreds);
  return auth.token;
}

/**
 * Generates a signed JWT directly without API call (useful for negative/tamper tests).
 * 
 * @param {Object} payload - Token payload (userId, email, role, etc.)
 * @param {string} [secret] - JWT secret key
 * @param {Object} [options] - JWT sign options (expiresIn, algorithm)
 * @returns {string} Signed JWT token
 */
function generateDirectToken(payload, secret = DEFAULT_JWT_SECRET, options = { expiresIn: '1h' }) {
  return jwt.sign(payload, secret, options);
}

module.exports = {
  DEFAULT_CREDENTIALS,
  createAuthHeader,
  loginUser,
  registerTestUser,
  getAuthenticatedStudent,
  getAuthenticatedAdmin,
  getStudentToken,
  getAdminToken,
  generateDirectToken
};
