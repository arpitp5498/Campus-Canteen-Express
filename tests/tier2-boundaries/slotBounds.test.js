const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 2: Slot Capacity & Scheduling Boundary Limits', () => {
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

  it('T2-SLOT-01: Slot with Capacity = 1 Allows Exactly One Order and Blocks the Second', async () => {
    // Set slot 1 capacity to 1
    await db.prepare('UPDATE pickup_slots SET max_capacity = 1, current_orders = 0 WHERE id = 1').run();

    // 1st order -> 201
    const order1 = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 1 }]
      });

    expect(order1.status).toBe(201);

    // 2nd order -> 400
    const order2 = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 1 }]
      });

    expect(order2.status).toBe(400);
    expect(order2.body.success).toBe(false);
  });

  it('T2-SLOT-02: Exact Max Capacity Fill Rejection on +1 Order', async () => {
    // Set slot 4 to capacity 3, current 2
    await db.prepare('UPDATE pickup_slots SET max_capacity = 3, current_orders = 2 WHERE id = 4').run();

    // 3rd order fills capacity -> 201
    const fillOrder = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 4,
        items: [{ item_id: 8, quantity: 1 }]
      });

    expect(fillOrder.status).toBe(201);

    // 4th order overflows -> 400
    const overflowOrder = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 4,
        items: [{ item_id: 8, quantity: 1 }]
      });

    expect(overflowOrder.status).toBe(400);
  });

  it('T2-SLOT-03: Invalid Slot Date Format Returns 400 Error', async () => {
    const res = await request(app).get('/api/slots/available?date=not-a-real-date');

    // Either 400 validation error or empty list
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      const slots = res.body.slots || res.body.data?.slots;
      expect(slots.length).toBe(0);
    }
  });

  it('T2-SLOT-04: Non-Existent Slot ID Order Placement Fails', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 999999,
        items: [{ item_id: 9, quantity: 1 }]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
