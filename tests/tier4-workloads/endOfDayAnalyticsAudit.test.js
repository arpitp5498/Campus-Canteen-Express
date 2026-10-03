const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 4 - Scenario 5: End-of-Day Operations & Analytics Audit', () => {
  let app;
  let db;
  let dbPath;
  let adminAuth;
  let studentAuth;
  let slotId;
  let items;

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
    items = menuRes.body.items || menuRes.body.data?.items;

    // Create 10 varied orders:
    // 5 to become COLLECTED
    // 2 to become READY
    // 1 to become PREPARING
    // 1 to remain PLACED
    // 1 to become CANCELLED
    const orders = [];
    for (let i = 0; i < 10; i++) {
      const itm = items[i % items.length];
      const o = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({ slot_id: slotId, items: [{ item_id: itm.id, quantity: 1 }] });
      const order = o.body.order || o.body.data?.order;
      orders.push(order);
    }

    // 5 -> COLLECTED
    for (let i = 0; i < 5; i++) {
      const id = orders[i].id;
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'READY' });
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'COLLECTED' });
    }

    // 2 -> READY
    for (let i = 5; i < 7; i++) {
      const id = orders[i].id;
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'READY' });
    }

    // 1 -> PREPARING
    const idPrep = orders[7].id;
    await request(app).patch(`/api/admin/orders/${idPrep}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/admin/orders/${idPrep}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });

    // 1 -> PLACED (orders[8] left as is)

    // 1 -> CANCELLED (orders[9])
    const idCancel = orders[9].id;
    await request(app).post(`/api/orders/${idCancel}/cancel`).set(studentAuth.headers);
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T4-AUDIT-01: Admin analytics dashboard numbers match exact SQL aggregate calculations', async () => {
    const analyticsRes = await request(app)
      .get('/api/admin/analytics/dashboard')
      .set(adminAuth.headers);

    expect(analyticsRes.status).toBe(200);
    const stats = analyticsRes.body.stats || analyticsRes.body.data?.stats;

    // Compute expected tallies directly from DB
    const nonCancelled = await db.prepare("SELECT COUNT(*) as count, SUM(total_amount) as revenue FROM orders WHERE status != 'CANCELLED'").get();

    expect(stats.today_orders).toBe(nonCancelled.count);
    expect(Number(stats.today_revenue)).toBe(Number(nonCancelled.revenue));
    expect(stats.status_breakdown.COLLECTED).toBe(5);
    expect(stats.status_breakdown.READY).toBe(2);
    expect(stats.status_breakdown.PREPARING).toBe(1);
    expect(stats.status_breakdown.PLACED).toBe(1);
    expect(stats.status_breakdown.CANCELLED).toBe(1);
  });
});
