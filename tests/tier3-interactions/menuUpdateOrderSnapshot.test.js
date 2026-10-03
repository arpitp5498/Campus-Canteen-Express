const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 3: Menu Price Update vs Existing Order Price Snapshot', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  let adminAuth;
  let slotId;
  let burgerItem;

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
    burgerItem = items.find(i => i.name === 'Burger'); // Base price ₹40
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T3-PRICE-01: Order freezes item price in snapshot; admin price change does NOT alter historical order', async () => {
    // 1. Student places order for Burger at initial price ₹40
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [{ item_id: burgerItem.id, quantity: 2 }]
      });

    expect(orderRes.status).toBe(201);
    const order1 = orderRes.body.order || orderRes.body.data?.order;
    const order1Id = order1.id;
    // Expected: 2 * 40 + 3 = 83
    expect(Number(order1.subtotal)).toBe(80);
    expect(Number(order1.total_amount)).toBe(83);

    // 2. Admin updates Burger price from ₹40 to ₹60
    const updateRes = await request(app)
      .put(`/api/menu/${burgerItem.id}`)
      .set(adminAuth.headers)
      .send({
        name: 'Burger',
        description: 'Updated premium burger',
        category: 'Snacks',
        price: 60,
        preparation_time: 10,
        is_available: 1
      });

    expect(updateRes.status).toBe(200);

    // 3. Historical order must still reflect original snapshot price (₹40, subtotal ₹80, total ₹83)
    const historicalRes = await request(app)
      .get(`/api/orders/${order1Id}`)
      .set(studentAuth.headers);

    expect(historicalRes.status).toBe(200);
    const historicalOrder = historicalRes.body.order || historicalRes.body.data?.order;
    expect(Number(historicalOrder.total_amount)).toBe(83);
    expect(Number(historicalOrder.items[0].unit_price || historicalOrder.items[0].unit_price_snapshot)).toBe(40);
    expect(historicalOrder.items[0].item_name || historicalOrder.items[0].item_name_snapshot).toBe('Burger');

    // 4. New order placed after price hike must calculate with ₹60
    const order2Res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [{ item_id: burgerItem.id, quantity: 2 }]
      });

    expect(order2Res.status).toBe(201);
    const order2 = order2Res.body.order || order2Res.body.data?.order;
    // Expected: 2 * 60 + 3 = 123
    expect(Number(order2.subtotal)).toBe(120);
    expect(Number(order2.total_amount)).toBe(123);
  });
});
