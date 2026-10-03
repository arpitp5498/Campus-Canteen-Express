const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 2: Order Pricing Invariants & Calculation Bounds', () => {
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

  it('T2-ORDR-01: Express Pickup Fee is Strictly ₹3 Invariant Regardless of Subtotal Size', async () => {
    // Low value order: Tea ₹15 -> Total: ₹18 (Fee: ₹3)
    const lowRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 11, quantity: 1 }]
      });

    expect(lowRes.status).toBe(201);
    const lowOrder = lowRes.body.order || lowRes.body.data?.order;
    expect(Number(lowOrder.express_fee)).toBe(3);
    expect(Number(lowOrder.total_amount)).toBe(18);

    // High value order: 5 x Thali (5 x 100 = ₹500) -> Total: ₹503 (Fee: ₹3)
    const highRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 15, quantity: 5 }]
      });

    expect(highRes.status).toBe(201);
    const highOrder = highRes.body.order || highRes.body.data?.order;
    expect(Number(highOrder.express_fee)).toBe(3);
    expect(Number(highOrder.total_amount)).toBe(503);
  });

  it('T2-ORDR-02: Price Snapshot Immunity Across Multiple Admin Catalogue Edits', async () => {
    // Place order for Cold Coffee @ ₹50
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 20, quantity: 2 }] // Cold Coffee: 2 x 50 = 100 + 3 = 103
      });

    const order = res.body.order || res.body.data?.order;
    const orderId = order.id;

    // Admin edits price to ₹75
    await request(app)
      .put('/api/menu/20')
      .set(adminAuth.headers)
      .send({ name: 'Cold Coffee', description: 'Updated coffee', category: 'Drinks', price: 75, preparation_time: 5, is_available: 1 });

    // Admin edits price again to ₹90
    await request(app)
      .put('/api/menu/20')
      .set(adminAuth.headers)
      .send({ name: 'Cold Coffee Supreme', description: 'Updated coffee supreme', category: 'Drinks', price: 90, preparation_time: 5, is_available: 1 });

    // Verify original order still has subtotal 100, total 103, unit_price 50
    const checkRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(studentAuth.headers);

    expect(checkRes.status).toBe(200);
    const historical = checkRes.body.order || checkRes.body.data?.order;
    expect(Number(historical.total_amount)).toBe(103);
    expect(Number(historical.items[0].unit_price || historical.items[0].unit_price_snapshot)).toBe(50);
  });
});
