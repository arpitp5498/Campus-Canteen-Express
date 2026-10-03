const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 3: Slot Capacity Decrement & Cancellation Restoration', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  let adminAuth;
  let slotId;
  let itemId;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    studentAuth = await getAuthenticatedStudent(app);
    adminAuth = await getAuthenticatedAdmin(app);

    const slotsRes = await request(app).get('/api/slots/available');
    const slots = slotsRes.body.slots || slotsRes.body.data?.slots;
    slotId = slots[0].id;

    const menuRes = await request(app).get('/api/menu');
    const items = menuRes.body.items || menuRes.body.data?.items;
    itemId = items[0].id;
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T3-SLOT-01: Placing an order increments slot current_orders and decrements remaining capacity; cancellation restores it', async () => {
    const initialSlot = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slotId);
    const initialOrders = initialSlot.current_orders;

    // Place order
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [{ item_id: itemId, quantity: 1 }]
      });

    expect(orderRes.status).toBe(201);
    const order = orderRes.body.order || orderRes.body.data?.order;
    const orderId = order.id;

    // Verify slot capacity decrement (current_orders + 1)
    const updatedSlot = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slotId);
    expect(updatedSlot.current_orders).toBe(initialOrders + 1);

    // Cancel order in PLACED status
    const cancelRes = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(studentAuth.headers);

    expect(cancelRes.status).toBe(200);

    // Verify slot capacity restored
    const restoredSlot = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slotId);
    expect(restoredSlot.current_orders).toBe(initialOrders);
  });

  test('T3-SLOT-02: Cancelling order in ACCEPTED status restores slot capacity', async () => {
    const initialSlot = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slotId);

    // Place order
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [{ item_id: itemId, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const orderId = order.id;

    // Admin accepts order
    await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(adminAuth.headers)
      .send({ status: 'ACCEPTED' });

    // Student cancels order in ACCEPTED state
    const cancelRes = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(studentAuth.headers);

    expect(cancelRes.status).toBe(200);

    // Verify restored capacity
    const slotAfterCancel = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slotId);
    expect(slotAfterCancel.current_orders).toBe(initialSlot.current_orders);
  });

  test('T3-SLOT-03: Cancellation is REJECTED in PREPARING status and slot count is NOT restored', async () => {
    // Place order
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [{ item_id: itemId, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const orderId = order.id;

    // Admin advances to ACCEPTED then PREPARING
    await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(adminAuth.headers)
      .send({ status: 'ACCEPTED' });

    await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(adminAuth.headers)
      .send({ status: 'PREPARING' });

    const slotBeforeCancel = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slotId);

    // Attempt cancellation
    const cancelRes = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(studentAuth.headers);

    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.success).toBe(false);
    expect(cancelRes.body.message || cancelRes.body.error).toMatch(/cannot.*cancel|preparation/i);

    // Verify slot count remains occupied
    const slotAfterCancel = await db.prepare('SELECT * FROM pickup_slots WHERE id = ?').get(slotId);
    expect(slotAfterCancel.current_orders).toBe(slotBeforeCancel.current_orders);
  });
});
