const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedAdmin, getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 1: Pickup Token Generation & Express Counter Verification (Feature Coverage)', () => {
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

  async function createOrderInReadyStatus() {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 11, quantity: 1 }] // Tea
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const id = order.id;

    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'READY' });

    return order;
  }

  it('T1-TOKN-01: Token Generation Matches 4-Character Unambiguous Format', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 8, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    expect(order.pickup_token).toBeDefined();
    expect(order.pickup_token).toHaveLength(4);
    // Alphabet: ABCDEFGHJKMNPQRSTUVWXY3456789
    expect(order.pickup_token).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXY3456789]{4}$/);
    // Excludes ambiguous chars: 0, O, 1, I, l
    expect(order.pickup_token).not.toMatch(/[0O1Il]/);
  });

  it('T1-TOKN-02: Counter Verification Matches READY Order Successfully', async () => {
    const order = await createOrderInReadyStatus();

    const verifyRes = await request(app)
      .post('/api/admin/orders/verify-token')
      .set(adminAuth.headers)
      .send({ pickup_token: order.pickup_token });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    const verifiedOrder = verifyRes.body.order || verifyRes.body.data?.order;
    expect(verifiedOrder.id).toBe(order.id);
    expect(verifiedOrder.order_number).toBe(order.order_number);
  });

  it('T1-TOKN-03: Case-Insensitive Token Matching at Counter', async () => {
    const order = await createOrderInReadyStatus();
    const lowerToken = order.pickup_token.toLowerCase();

    const verifyRes = await request(app)
      .post('/api/admin/orders/verify-token')
      .set(adminAuth.headers)
      .send({ pickup_token: lowerToken });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    const verifiedOrder = verifyRes.body.order || verifyRes.body.data?.order;
    expect(verifiedOrder.id).toBe(order.id);
  });

  it('T1-TOKN-04: Rejection of Token Verification for PREPARING Order', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 12, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });

    const verifyRes = await request(app)
      .post('/api/admin/orders/verify-token')
      .set(adminAuth.headers)
      .send({ pickup_token: order.pickup_token });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.message || verifyRes.body.error).toMatch(/not ready/i);
  });

  it('T1-TOKN-05: Rejection of Token Verification for Already COLLECTED Order', async () => {
    const order = await createOrderInReadyStatus();
    await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'COLLECTED' });

    const verifyRes = await request(app)
      .post('/api/admin/orders/verify-token')
      .set(adminAuth.headers)
      .send({ pickup_token: order.pickup_token });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.message || verifyRes.body.error).toMatch(/already collected|collected/i);
  });

  it('T1-TOKN-06: Non-Existent Token Lookup Returns 404/400 Error', async () => {
    const verifyRes = await request(app)
      .post('/api/admin/orders/verify-token')
      .set(adminAuth.headers)
      .send({ pickup_token: 'ZZZZ' });

    expect([400, 404]).toContain(verifyRes.status);
    expect(verifyRes.body.success).toBe(false);
  });
});
