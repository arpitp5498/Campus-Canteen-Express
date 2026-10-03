const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 4 - Scenario 2: Kitchen State Progression (Batch Lifecycle)', () => {
  let app;
  let db;
  let dbPath;
  let adminAuth;
  let studentAuth;
  let slotId;
  let itemId;
  let orderIds = [];

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    studentAuth = await getAuthenticatedStudent(app);
    adminAuth = await getAuthenticatedAdmin(app);

    const slotRes = await request(app).get('/api/slots/available');
    const slots = slotRes.body.slots || slotRes.body.data?.slots;
    slotId = slots[0].id;

    const menuRes = await request(app).get('/api/menu');
    const items = menuRes.body.items || menuRes.body.data?.items;
    itemId = items[0].id;

    // Create 10 orders
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({ slot_id: slotId, items: [{ item_id: itemId, quantity: 1 }] });
      const order = res.body.order || res.body.data?.order;
      orderIds.push(order.id);
    }
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T4-KITCHEN-01: Admin batch advances 10 orders from PLACED -> ACCEPTED -> PREPARING -> READY', async () => {
    // 1. Verify 10 orders in PLACED
    const listPlaced = await request(app)
      .get('/api/admin/orders?status=PLACED')
      .set(adminAuth.headers);
    const orders = listPlaced.body.orders || listPlaced.body.data?.orders;
    expect(orders.length).toBeGreaterThanOrEqual(10);

    // 2. Batch transition to ACCEPTED
    for (const id of orderIds) {
      const res = await request(app)
        .patch(`/api/admin/orders/${id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'ACCEPTED' });
      expect(res.status).toBe(200);
    }

    // 3. Batch transition to PREPARING
    for (const id of orderIds) {
      const res = await request(app)
        .patch(`/api/admin/orders/${id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'PREPARING' });
      expect(res.status).toBe(200);
    }

    // 4. Batch transition to READY
    for (const id of orderIds) {
      const res = await request(app)
        .patch(`/api/admin/orders/${id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'READY' });
      expect(res.status).toBe(200);
    }

    // 5. Verify admin dashboard shows ready orders
    const analytics = await request(app)
      .get('/api/admin/analytics/dashboard')
      .set(adminAuth.headers);

    const stats = analytics.body.stats || analytics.body.data?.stats;
    expect(stats.status_breakdown.READY).toBeGreaterThanOrEqual(10);
  });
});
