const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 4 - Scenario 4: Mid-Service Menu & Price Update', () => {
  let app;
  let db;
  let dbPath;
  let adminAuth;
  let studentAuth;
  let slotId;
  let pizzaItem;
  let teaItem;

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
    pizzaItem = items.find(i => i.name === 'Mini Pizza'); // ₹50
    teaItem = items.find(i => i.name === 'Tea'); // ₹15
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T4-MID-01: Mid-service catalog updates cleanly isolate active orders while immediately constraining new checkouts', async () => {
    // 1. Student places Order A with Tea (₹15) and Mini Pizza (₹50) -> total ₹68
    const orderARes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [
          { item_id: teaItem.id, quantity: 1 },
          { item_id: pizzaItem.id, quantity: 1 }
        ]
      });

    expect(orderARes.status).toBe(201);
    const orderA = orderARes.body.order || orderARes.body.data?.order;
    expect(Number(orderA.total_amount)).toBe(68);

    // 2. Admin performs 3 mid-service actions:
    // a. Update Tea price from ₹15 to ₹20
    await request(app)
      .put(`/api/menu/${teaItem.id}`)
      .set(adminAuth.headers)
      .send({ name: 'Tea', description: 'Hot Ginger Tea', category: 'Drinks', price: 20, preparation_time: 5, is_available: 1 });

    // b. Mark Mini Pizza unavailable (sold out)
    await request(app)
      .patch(`/api/menu/${pizzaItem.id}/availability`)
      .set(adminAuth.headers)
      .send({ is_available: 0 });

    // c. Add new lunch special item
    const newItemRes = await request(app)
      .post('/api/menu')
      .set(adminAuth.headers)
      .send({
        name: 'Special Paneer Wrap',
        description: 'Fresh grilled paneer roll',
        category: 'Rolls',
        price: 90,
        preparation_time: 8,
        is_available: 1
      });

    expect(newItemRes.status).toBe(201);
    const wrapItem = newItemRes.body.item || newItemRes.body.data?.item;
    const wrapId = wrapItem.id;

    // 3. Verify Order A is intact (Tea ₹15, Pizza ₹50, Total ₹68)
    const checkOrderA = await request(app).get(`/api/orders/${orderA.id}`).set(studentAuth.headers);
    const checkedA = checkOrderA.body.order || checkOrderA.body.data?.order;
    expect(Number(checkedA.total_amount)).toBe(68);

    // 4. Attempt new order with now-unavailable Mini Pizza -> REJECTED
    const failOrder = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({ slot_id: slotId, items: [{ item_id: pizzaItem.id, quantity: 1 }] });
    expect(failOrder.status).toBe(400);

    // 5. New order with updated Tea (₹20) and new Special Wrap (₹90) -> Subtotal 110 + 3 = ₹113
    const newOrderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [
          { item_id: teaItem.id, quantity: 1 },
          { item_id: wrapId, quantity: 1 }
        ]
      });

    expect(newOrderRes.status).toBe(201);
    const newOrder = newOrderRes.body.order || newOrderRes.body.data?.order;
    expect(Number(newOrder.subtotal)).toBe(110);
    expect(Number(newOrder.total_amount)).toBe(113);
  });
});
