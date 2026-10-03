const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 2: Pickup Token Format & Input Boundaries', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  let adminAuth;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    studentAuth = await getAuthenticatedStudent(app);
    adminAuth = await getAuthenticatedAdmin(app);
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T2-TOKN-01: Generated Pickup Tokens Across Multiple Orders Never Contain Ambiguous Characters (0, O, 1, I, l)', async () => {
    const tokens = [];

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 11, quantity: 1 }]
        });

      const order = res.body.order || res.body.data?.order;
      tokens.push(order.pickup_token);
    }

    tokens.forEach(tok => {
      expect(tok).toHaveLength(4);
      // Valid alphabet: ABCDEFGHJKMNPQRSTUVWXY3456789
      expect(tok).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXY3456789]{4}$/);
      expect(tok).not.toMatch(/[0O1Il]/);
    });
  });

  it('T2-TOKN-02: Counter Token Lookup Trims Leading and Trailing Whitespace', async () => {
    // 1. Create order and move to READY
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 12, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const id = order.id;
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
    await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'READY' });

    // 2. Staff enters token with extra spaces: "  A7K4  "
    const spacedToken = `  ${order.pickup_token}  `;
    const verifyRes = await request(app)
      .post('/api/admin/orders/verify-token')
      .set(adminAuth.headers)
      .send({ pickup_token: spacedToken });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect((verifyRes.body.order || verifyRes.body.data?.order).id).toBe(id);
  });
});
