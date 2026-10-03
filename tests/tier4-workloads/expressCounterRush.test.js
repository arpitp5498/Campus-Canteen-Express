const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 4 - Scenario 3: Express Counter Rush (Token Verification & Collection)', () => {
  let app;
  let db;
  let dbPath;
  let adminAuth;
  let studentAuth;
  let slotId;
  let itemId;
  let readyOrders = [];
  let preparingOrder;

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

    // Create 5 orders to advance to READY
    for (let i = 0; i < 5; i++) {
      const o = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({ slot_id: slotId, items: [{ item_id: itemId, quantity: 1 }] });
      
      const order = o.body.order || o.body.data?.order;
      const id = order.id;
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'READY' });
      readyOrders.push(order);
    }

    // Create 1 order left in PREPARING
    const pOrder = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({ slot_id: slotId, items: [{ item_id: itemId, quantity: 1 }] });
    const pData = pOrder.body.order || pOrder.body.data?.order;
    await request(app).patch(`/api/admin/orders/${pData.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/admin/orders/${pData.id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
    preparingOrder = pData;
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T4-CTR-01: Counter staff verifies valid tokens, collects orders, and double collection is blocked', async () => {
    // 1. Verify token for order still in PREPARING returns error
    const prepVerify = await request(app)
      .post('/api/admin/orders/verify-token')
      .set(adminAuth.headers)
      .send({ pickup_token: preparingOrder.pickup_token });

    expect(prepVerify.status).toBe(400);
    expect(prepVerify.body.message || prepVerify.body.error).toMatch(/not ready/i);

    // 2. Rapidly verify and collect the 5 READY orders (case-insensitive)
    for (const order of readyOrders) {
      const lowerToken = order.pickup_token.toLowerCase();
      const verifyRes = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: lowerToken });

      expect(verifyRes.status).toBe(200);
      const verified = verifyRes.body.order || verifyRes.body.data?.order;
      expect(verified.id).toBe(order.id);

      // Mark COLLECTED
      const collectRes = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'COLLECTED' });

      expect(collectRes.status).toBe(200);
    }

    // 3. Prevent Double Collection
    const reVerify = await request(app)
      .post('/api/admin/orders/verify-token')
      .set(adminAuth.headers)
      .send({ pickup_token: readyOrders[0].pickup_token });

    expect(reVerify.status).toBe(400);
    expect(reVerify.body.message || reVerify.body.error).toMatch(/already collected|collected/i);
  });
});
