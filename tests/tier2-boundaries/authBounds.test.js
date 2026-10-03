const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');

describe('Tier 2: Authentication Boundary & Input Bounds', () => {
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

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T2-AUTH-01: Password with 5 Characters is Rejected (< 6 min length)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Short Pass User',
        email: 'shortpass@campus.edu',
        password: 'Aa1@1' // 5 chars
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/password.*(6|short|length|at least)/i);
  });

  it('T2-AUTH-02: Password with Exactly 6 Characters is Accepted (Boundary Min)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Exact Pass User',
        email: 'exact6pass@campus.edu',
        password: 'Aa1@12' // 6 chars
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('T2-AUTH-03: Email with Leading/Trailing Whitespace is Trimmed & Normalized', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Whitespace User',
        email: '   trimmed_user@campus.edu   ',
        password: 'Password@123'
      });

    expect(res.status).toBe(201);
    const user = res.body.user || res.body.data?.user;
    expect(user.email).toBe('trimmed_user@campus.edu');

    // Login with untrimmed string also works
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: '   trimmed_user@campus.edu   ',
        password: 'Password@123'
      });

    expect(loginRes.status).toBe(200);
  });

  it('T2-AUTH-04: Email Case-Insensitivity (Uppercase Registration -> Lowercase Login)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Case User',
        email: 'UPPERCASE_USER@CAMPUS.EDU',
        password: 'Password@123'
      });

    expect(res.status).toBe(201);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'uppercase_user@campus.edu',
        password: 'Password@123'
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
  });

  it('T2-AUTH-05: Passwords with Complex Special Characters are Preserved and Hashed Accurately', async () => {
    const complexPass = 'P@$$w0rd!#%^&*()_+~`-={}[]|:";\'<>?,./';
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Special Char User',
        email: 'specialchar@campus.edu',
        password: complexPass
      });

    expect(res.status).toBe(201);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'specialchar@campus.edu',
        password: complexPass
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
  });
});
