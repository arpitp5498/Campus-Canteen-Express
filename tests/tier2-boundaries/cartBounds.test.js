const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 2: Cart & Quantity Boundary Limits', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    studentAuth = await getAuthenticatedStudent(app);
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T2-CART-01: Quantity = 1 Lower Bound Sizing is Valid', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 1 }] // Burger ₹40
      });

    expect(res.status).toBe(201);
    const order = res.body.order || res.body.data?.order;
    expect(Number(order.subtotal)).toBe(40);
    expect(Number(order.total_amount)).toBe(43);
  });

  it('T2-CART-02: Quantity = 99 High Volume Order Calculates Correctly', async () => {
    // Burger: 99 x ₹40 = ₹3960 + ₹3 Fee = ₹3963
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 99 }]
      });

    expect(res.status).toBe(201);
    const order = res.body.order || res.body.data?.order;
    expect(Number(order.subtotal)).toBe(3960);
    expect(Number(order.total_amount)).toBe(3963);
  });

  it('T2-CART-03: Quantity = 0 is Rejected with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 0 }]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/quantity.*(least|positive|greater|invalid|1)/i);
  });

  it('T2-CART-04: Negative Quantity is Rejected with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: -5 }]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('T2-CART-05: Non-Integer Floating Point Quantity is Rejected', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 1.5 }]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('T2-CART-06: Empty Items Array is Rejected with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: []
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/items.*empty|no items|at least 1 item/i);
  });
});
