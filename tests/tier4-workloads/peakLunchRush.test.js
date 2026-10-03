const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { registerTestUser } = require('../helpers/authHelper');

describe('Tier 4 - Scenario 1: Peak Lunch Rush (20+ Concurrent Orders & Saturation)', () => {
  let app;
  let db;
  let dbPath;
  let studentTokens = [];
  let slot1Id;
  let slot2Id;
  let burgerItem;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    // Register 25 distinct students
    for (let i = 1; i <= 25; i++) {
      const reg = await registerTestUser({
        name: `Rush Student ${i}`,
        email: `rush_student_${i}_${Date.now()}@campus.edu`,
        password: 'Password@123'
      }, app);
      studentTokens.push(reg.token);
    }

    // Configure Slot 1 capacity = 10, Slot 2 capacity = 15
    const slots = await db.prepare('SELECT * FROM pickup_slots LIMIT 2').all();
    slot1Id = slots[0].id;
    slot2Id = slots[1].id;
    await db.prepare('UPDATE pickup_slots SET max_capacity = 10, current_orders = 0 WHERE id = ?').run(slot1Id);
    await db.prepare('UPDATE pickup_slots SET max_capacity = 15, current_orders = 0 WHERE id = ?').run(slot2Id);

    const menuRes = await request(app).get('/api/menu');
    const items = menuRes.body.items || menuRes.body.data?.items;
    burgerItem = items.find(i => i.name === 'Burger');
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T4-RUSH-01: Concurrent orders saturate Slot 1 to exactly 10/10, overflow safely redirects to Slot 2', async () => {
    // 15 students order Slot 1 (capacity 10)
    const slot1Promises = studentTokens.slice(0, 15).map((token) =>
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slot_id: slot1Id,
          items: [{ item_id: burgerItem.id, quantity: 1 }]
        })
    );

    const results = await Promise.all(slot1Promises);
    const successfulOrders = results.filter(r => r.status === 201);
    const rejectedOrders = results.filter(r => r.status === 400);

    expect(successfulOrders.length).toBe(10);
    expect(rejectedOrders.length).toBe(5);

    // Verify Slot 1 database state is saturated at 10/10
    const slot1State = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slot1Id);
    expect(slot1State.current_orders).toBe(10);

    // 15 students order Slot 2 (capacity 15)
    const remainingTokens = studentTokens.slice(10, 25);
    const slot2Promises = remainingTokens.map((token) =>
      request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          slot_id: slot2Id,
          items: [{ item_id: burgerItem.id, quantity: 1 }]
        })
    );

    const slot2Results = await Promise.all(slot2Promises);
    const slot2Success = slot2Results.filter(r => r.status === 201);
    expect(slot2Success.length).toBe(15);

    const slot2State = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slot2Id);
    expect(slot2State.current_orders).toBe(15);
  });
});
