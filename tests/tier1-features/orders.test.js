const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 1: Order Placement & Server-Side Pricing Integrity (Feature Coverage)', () => {
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

  beforeEach(async () => {
    await db.run('UPDATE pickup_slots SET current_orders = 0');
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T1-ORDR-01: Single Item Order Calculation with ₹3 Express Fee', async () => {
    // Maggi: ₹50 -> Subtotal: 50, Fee: 3, Total: 53
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 8, quantity: 1 }]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const order = res.body.order || res.body.data?.order;
    expect(order.id).toBeDefined();
    expect(order.order_number).toMatch(/^CCE-\d+$/);
    expect(order.pickup_token).toMatch(/^[A-Z0-9]{4}$/);
    expect(Number(order.subtotal)).toBe(50);
    expect(Number(order.express_fee)).toBe(3);
    expect(Number(order.total_amount)).toBe(53);
    expect(order.status).toBe('PLACED');
  });

  it('T1-ORDR-02: Multi-Item Multi-Quantity Order Calculation', async () => {
    // Tea: 2 x ₹15 = ₹30
    // Burger: 1 x ₹40 = ₹40
    // Subtotal: 70, Fee: 3, Total: 73
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [
          { item_id: 11, quantity: 2 },
          { item_id: 9, quantity: 1 }
        ]
      });

    expect(res.status).toBe(201);
    const order = res.body.order || res.body.data?.order;
    expect(Number(order.subtotal)).toBe(70);
    expect(Number(order.express_fee)).toBe(3);
    expect(Number(order.total_amount)).toBe(73);
  });

  it('T1-ORDR-03: Multi-Variant Item Pricing Calculation', async () => {
    // Chilli Potato Full variant: ₹120 -> Subtotal: 120, Fee: 3, Total: 123
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [
          { item_id: 5, variant_id: 2, quantity: 1 }
        ]
      });

    expect(res.status).toBe(201);
    const order = res.body.order || res.body.data?.order;
    expect(Number(order.subtotal)).toBe(120);
    expect(Number(order.total_amount)).toBe(123);
  });

  it('T1-ORDR-04: Server Discards Client-Supplied Totals and Enforces Server Sum', async () => {
    // Thali: ₹100. Client passes fake amounts subtotal: 10, total: 10
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 15, quantity: 1 }],
        subtotal: 10,
        express_fee: 0,
        total_amount: 10
      });

    expect(res.status).toBe(201);
    const order = res.body.order || res.body.data?.order;
    expect(Number(order.subtotal)).toBe(100);
    expect(Number(order.express_fee)).toBe(3);
    expect(Number(order.total_amount)).toBe(103);

    // Verify directly in DB
    const dbOrder = await db.prepare('SELECT subtotal, express_fee, total_amount FROM orders WHERE id = ?').get(order.id);
    expect(Number(dbOrder.subtotal)).toBe(100);
    expect(Number(dbOrder.express_fee)).toBe(3);
    expect(Number(dbOrder.total_amount)).toBe(103);
  });

  it('T1-ORDR-05: Historical Item Price & Name Freeze in Database Snapshot', async () => {
    // 1. Place order for Burger @ ₹40
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const orderId = order.id;

    // 2. Admin updates Burger price to ₹60
    await request(app)
      .put('/api/menu/9')
      .set(adminAuth.headers)
      .send({
        name: 'Burger Deluxe',
        description: 'New burger',
        category: 'Snacks',
        price: 60,
        preparation_time: 10,
        is_available: 1
      });

    // 3. Inspect historical order
    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(studentAuth.headers);

    expect(getRes.status).toBe(200);
    const historicalOrder = getRes.body.order || getRes.body.data?.order;
    expect(Number(historicalOrder.total_amount)).toBe(43);
    expect(Number(historicalOrder.items[0].unit_price || historicalOrder.items[0].unit_price_snapshot)).toBe(40);
  });

  it('T1-ORDR-06: Student Retrieves My Orders List', async () => {
    const res = await request(app)
      .get('/api/orders/my-orders')
      .set(studentAuth.headers);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const orders = res.body.orders || res.body.data?.orders;
    expect(Array.isArray(orders)).toBe(true);
    expect(orders.length).toBeGreaterThan(0);
  });

  it('T1-ORDR-07: Rejection of Order with Non-Existent Menu Item ID', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 999999, quantity: 1 }]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/item.*not found|invalid item/i);
  });
});
