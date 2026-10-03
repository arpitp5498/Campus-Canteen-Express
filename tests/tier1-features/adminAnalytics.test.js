const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedAdmin, getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 1: Admin Analytics & Dashboard Reporting (Feature Coverage)', () => {
  let app;
  let db;
  let dbPath;
  let adminAuth;
  let studentAuth;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    adminAuth = await getAuthenticatedAdmin(app);
    studentAuth = await getAuthenticatedStudent(app);

    await db.run('UPDATE pickup_slots SET current_orders = 0');

    // Seed 3 orders for analytics
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: i, quantity: 1 }]
        });
    }
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T1-ANLY-01: Admin Can Retrieve Dashboard Analytics', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/dashboard')
      .set(adminAuth.headers);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const stats = res.body.stats || res.body.data?.stats;
    expect(stats).toBeDefined();
    expect(stats.today_orders).toBeGreaterThanOrEqual(3);
    expect(Number(stats.today_revenue)).toBeGreaterThan(0);
    expect(stats.status_breakdown).toBeDefined();
  });

  it('T1-ANLY-02: Student Access to Admin Analytics is Rejected with 403', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/dashboard')
      .set(studentAuth.headers);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('T1-ANLY-03: Admin Orders List Fetch', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set(adminAuth.headers);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const orders = res.body.orders || res.body.data?.orders;
    expect(Array.isArray(orders)).toBe(true);
    expect(orders.length).toBeGreaterThanOrEqual(3);
  });

  it('T1-ANLY-04: Admin Orders Filter by Status', async () => {
    const res = await request(app)
      .get('/api/admin/orders?status=PLACED')
      .set(adminAuth.headers);

    expect(res.status).toBe(200);
    const orders = res.body.orders || res.body.data?.orders;
    orders.forEach(o => {
      expect(o.status).toBe('PLACED');
    });
  });
});
