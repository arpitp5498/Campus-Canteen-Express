const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedAdmin, getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 1: Order State Machine Transitions & Cancellation Window (Feature Coverage)', () => {
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
  });

  beforeEach(async () => {
    await db.run('UPDATE pickup_slots SET current_orders = 0');
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  async function createTestOrder() {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 1, quantity: 1 }]
      });
    return res.body.order || res.body.data?.order;
  }

  it('T1-STAT-01: Full Sequential Transition: PLACED -> ACCEPTED -> PREPARING -> READY -> COLLECTED', async () => {
    const order = await createTestOrder();
    const orderId = order.id;

    // 1. PLACED -> ACCEPTED
    const step1 = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(adminAuth.headers)
      .send({ status: 'ACCEPTED' });

    expect(step1.status).toBe(200);
    expect((step1.body.order || step1.body.data?.order).status).toBe('ACCEPTED');

    // 2. ACCEPTED -> PREPARING
    const step2 = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(adminAuth.headers)
      .send({ status: 'PREPARING' });

    expect(step2.status).toBe(200);
    expect((step2.body.order || step2.body.data?.order).status).toBe('PREPARING');

    // 3. PREPARING -> READY
    const step3 = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(adminAuth.headers)
      .send({ status: 'READY' });

    expect(step3.status).toBe(200);
    expect((step3.body.order || step3.body.data?.order).status).toBe('READY');

    // 4. READY -> COLLECTED
    const step4 = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(adminAuth.headers)
      .send({ status: 'COLLECTED' });

    expect(step4.status).toBe(200);
    expect((step4.body.order || step4.body.data?.order).status).toBe('COLLECTED');
  });

  it('T1-STAT-02: Reject Illegal Forward Jump (PLACED -> READY)', async () => {
    const order = await createTestOrder();

    const res = await request(app)
      .patch(`/api/admin/orders/${order.id}/status`)
      .set(adminAuth.headers)
      .send({ status: 'READY' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/invalid.*transition|cannot transition/i);
  });

  it('T1-STAT-03: Reject Illegal Backward Transition (READY -> ACCEPTED)', async () => {
    const order = await createTestOrder();
    const id = order.id;

    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'READY' });

    const backRes = await request(app)
      .patch(`/api/admin/orders/${id}/status`)
      .set(adminAuth.headers)
      .send({ status: 'ACCEPTED' });

    expect(backRes.status).toBe(400);
    expect(backRes.body.success).toBe(false);
  });

  it('T1-STAT-04: Student Can Cancel Order in PLACED Status', async () => {
    const order = await createTestOrder();

    const cancelRes = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set(studentAuth.headers);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);

    const dbOrder = await db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id);
    expect(dbOrder.status).toBe('CANCELLED');
  });

  it('T1-STAT-05: Student Can Cancel Order in ACCEPTED Status', async () => {
    const order = await createTestOrder();
    await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });

    const cancelRes = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set(studentAuth.headers);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
  });

  it('T1-STAT-06: Student Cancellation REJECTED in PREPARING Status', async () => {
    const order = await createTestOrder();
    await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });

    const cancelRes = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set(studentAuth.headers);

    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.success).toBe(false);
    expect(cancelRes.body.message || cancelRes.body.error).toMatch(/cannot.*cancel|preparation/i);
  });

  it('T1-STAT-07: Status Modification on COLLECTED Final State is Rejected', async () => {
    const order = await createTestOrder();
    const id = order.id;

    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'READY' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'COLLECTED' });

    const res = await request(app)
      .patch(`/api/admin/orders/${id}/status`)
      .set(adminAuth.headers)
      .send({ status: 'PREPARING' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
