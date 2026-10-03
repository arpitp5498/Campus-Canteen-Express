const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 1: Authentication & Authorization (Feature Coverage)', () => {
  let app;
  let db;
  let dbPath;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();
  });

  beforeEach(async () => {
    await db.run("DELETE FROM users WHERE email = 'arjun.student@campus.edu'");
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T1-AUTH-01: Student Registration with Valid Credentials', async () => {
    const payload = {
      name: 'Arjun Sharma',
      email: 'arjun.student@campus.edu',
      password: 'Password@123',
      role: 'STUDENT'
    };

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const token = res.body.token || res.body.data?.token;
    const user = res.body.user || res.body.data?.user;

    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
    expect(user.id).toBeGreaterThan(0);
    expect(user.name).toBe('Arjun Sharma');
    expect(user.email).toBe('arjun.student@campus.edu');
    expect(user.role).toBe('STUDENT');
    expect(user.password).toBeUndefined();
    expect(user.password_hash).toBeUndefined();

    // Verify in DB
    const dbUser = await db.prepare('SELECT * FROM users WHERE email = ?').get('arjun.student@campus.edu');
    expect(dbUser).toBeDefined();
    expect(dbUser.password_hash).toMatch(/^\$2[aby]\$/);
    expect(dbUser.password_hash).not.toBe('Password@123');
  });

  it('T1-AUTH-02: Registration Rejection on Duplicate Email', async () => {
    const payload = {
      name: 'Duplicate User',
      email: 'student@campus.edu',
      password: 'Password@123'
    };

    const res = await request(app)
      .post('/api/auth/register')
      .send(payload);

    expect([400, 409]).toContain(res.status);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/already registered|already exists|duplicate|registered/i);

    const userCount = await db.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?').get('student@campus.edu');
    expect(Number(userCount.count)).toBe(1);
  });

  it('T1-AUTH-03: Successful Student Login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'student@campus.edu',
        password: 'Student@12345'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const token = res.body.token || res.body.data?.token;
    const user = res.body.user || res.body.data?.user;

    expect(typeof token).toBe('string');
    expect(user.email).toBe('student@campus.edu');
    expect(user.role).toBe('STUDENT');
  });

  it('T1-AUTH-04: Successful Admin Login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@canteen.local',
        password: 'Admin@123'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const token = res.body.token || res.body.data?.token;
    const user = res.body.user || res.body.data?.user;

    expect(typeof token).toBe('string');
    expect(user.role).toBe('ADMIN');
  });

  it('T1-AUTH-05: Login Rejection on Incorrect Password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'student@campus.edu',
        password: 'WrongPassword!999'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.token).toBeUndefined();
    expect(res.body.message || res.body.error).toMatch(/invalid.*credentials|invalid.*password|incorrect/i);
  });

  it('T1-AUTH-06: Login Rejection on Unregistered Email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'ghost.unregistered.999@campus.edu',
        password: 'SomePassword@123'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/invalid.*credentials|user not found|not found|unregistered/i);
  });

  it('T1-AUTH-07: Retrieve Authenticated User Profile via /api/auth/me', async () => {
    const studentAuth = await getAuthenticatedStudent(app);

    const res = await request(app)
      .get('/api/auth/me')
      .set(studentAuth.headers);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const user = res.body.user || res.body.data?.user;
    expect(user.email).toBe(studentAuth.user.email);
    expect(user.role).toBe('STUDENT');
    expect(user.password).toBeUndefined();
    expect(user.password_hash).toBeUndefined();
  });

  it('T1-AUTH-08: Unauthenticated Request to Protected Route Rejected with 401', async () => {
    const res = await request(app)
      .get('/api/orders/my-orders');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/token.*required|unauthorized|no token|not authenticated/i);
  });

  it('T1-AUTH-09: Student Token Access to Admin Endpoint Rejected with 403', async () => {
    const studentAuth = await getAuthenticatedStudent(app);

    const res = await request(app)
      .get('/api/admin/orders')
      .set(studentAuth.headers);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/forbidden|admin|access denied|permission/i);
  });
});
