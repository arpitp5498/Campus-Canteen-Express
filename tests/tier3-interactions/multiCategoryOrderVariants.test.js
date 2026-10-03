const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 3: Multi-Category Order with Variants & Express Fee Calculation', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  let slotId;
  let menuItems;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    studentAuth = await getAuthenticatedStudent(app);

    const slotRes = await request(app).get('/api/slots/available');
    const slots = slotRes.body.slots || slotRes.body.data?.slots;
    slotId = slots[0].id;

    const menuRes = await request(app).get('/api/menu');
    menuItems = menuRes.body.items || menuRes.body.data?.items;
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T3-VAR-01: Multi-category order with sizing variants calculates subtotal and snapshots correctly', async () => {
    const cheeseSandwich = menuItems.find(i => i.name === 'Cheese Grilled Sandwich'); // ₹80 (Sandwiches)
    const coldCoffee = menuItems.find(i => i.name === 'Cold Coffee'); // ₹50 (Drinks)
    const chilliPotato = menuItems.find(i => i.name === 'Chilli Potato'); // Full variant ₹120 (Snacks)
    const thali = menuItems.find(i => i.name === 'Thali'); // ₹100 (Meals)

    // Variant ID 2 is Chilli Potato Full
    const orderPayload = {
      slot_id: slotId,
      items: [
        { item_id: cheeseSandwich.id, quantity: 1 },
        { item_id: coldCoffee.id, quantity: 2 },
        { item_id: chilliPotato.id, variant_id: 2, quantity: 1 },
        { item_id: thali.id, quantity: 1 }
      ]
    };

    // Subtotal: (80*1) + (50*2) + (120*1) + (100*1) = 80 + 100 + 120 + 100 = 400
    // Total = 400 + 3 = 403

    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send(orderPayload);

    expect(res.status).toBe(201);
    const order = res.body.order || res.body.data?.order;
    expect(Number(order.subtotal)).toBe(400);
    expect(Number(order.express_fee)).toBe(3);
    expect(Number(order.total_amount)).toBe(403);
    expect(order.pickup_token).toMatch(/^[A-Z0-9]{4}$/);

    // Verify snapshots in order details
    const orderDetailsRes = await request(app)
      .get(`/api/orders/${order.id}`)
      .set(studentAuth.headers);

    expect(orderDetailsRes.status).toBe(200);
    const details = orderDetailsRes.body.order || orderDetailsRes.body.data?.order;
    expect(details.items.length).toBe(4);
  });
});
