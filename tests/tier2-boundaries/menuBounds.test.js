const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 2: Menu Catalog & Price Boundary Limits', () => {
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

  it('T2-MENU-01: Lowest Price Item (Tea ₹15) Calculates Exactly with ₹3 Express Fee (₹18)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 11, quantity: 1 }] // Tea: ₹15
      });

    expect(res.status).toBe(201);
    const order = res.body.order || res.body.data?.order;
    expect(Number(order.subtotal)).toBe(15);
    expect(Number(order.express_fee)).toBe(3);
    expect(Number(order.total_amount)).toBe(18);
  });

  it('T2-MENU-02: Highest Price Item (Cheese Medium Pizza ₹120) Calculates Exactly (₹123)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 19, quantity: 1 }] // Cheese Medium Pizza: ₹120
      });

    expect(res.status).toBe(201);
    const order = res.body.order || res.body.data?.order;
    expect(Number(order.subtotal)).toBe(120);
    expect(Number(order.express_fee)).toBe(3);
    expect(Number(order.total_amount)).toBe(123);
  });

  it('T2-MENU-03: Zero Prep Time Item is Accepted and Supported', async () => {
    const res = await request(app)
      .post('/api/menu')
      .set(adminAuth.headers)
      .send({
        name: 'Instant Candy Bar',
        description: 'Ready to serve',
        category: 'Desserts',
        price: 25.00,
        preparation_time: 0,
        is_available: 1
      });

    expect(res.status).toBe(201);
    const item = res.body.item || res.body.data?.item;
    expect(item.name).toBe('Instant Candy Bar');
  });

  it('T2-MENU-04: Multi-Variant Highest Sizing (Noodles Full ₹120 vs Half ₹70)', async () => {
    const fullRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 13, variant_id: 8, quantity: 1 }] // Noodles Full ₹120
      });

    expect(fullRes.status).toBe(201);
    const fullOrder = fullRes.body.order || fullRes.body.data?.order;
    expect(Number(fullOrder.subtotal)).toBe(120);
    expect(Number(fullOrder.total_amount)).toBe(123);
  });

  it('T2-MENU-05: Negative Menu Item Price is Rejected by Admin Validation', async () => {
    const res = await request(app)
      .post('/api/menu')
      .set(adminAuth.headers)
      .send({
        name: 'Invalid Price Item',
        description: 'Negative price test',
        category: 'Snacks',
        price: -50.00,
        preparation_time: 5,
        is_available: 1
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
