const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 1: Pickup Slots & Capacity Rules (Feature Coverage)', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  let todayStr;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db, { slotCapacity: 5 });
    app = getApp();
    studentAuth = await getAuthenticatedStudent(app);
    todayStr = new Date().toISOString().split('T')[0];
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T1-SLOT-01: Fetch Available Slots for Today', async () => {
    const res = await request(app).get(`/api/slots/available?date=${todayStr}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const slots = res.body.slots || res.body.data?.slots;
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeGreaterThanOrEqual(6);

    const slot1 = slots[0];
    expect(slot1.slot_date || slot1.date).toBe(todayStr);
    expect(slot1.start_time).toBeDefined();
    expect(slot1.end_time).toBeDefined();
    expect(slot1.max_capacity || slot1.capacity).toBeDefined();
  });

  it('T1-SLOT-02: Slot Capacity Tracks Order Placement Increment', async () => {
    const slotRow = await db.prepare('SELECT id, current_orders FROM pickup_slots WHERE id = 1').get();
    const initialOrders = Number(slotRow.current_orders);

    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 1 }] // Burger
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.success).toBe(true);

    const updatedSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = 1').get();
    expect(Number(updatedSlot.current_orders)).toBe(initialOrders + 1);
  });

  it('T1-SLOT-03: Slot Reaching Capacity Displays as Full', async () => {
    // Set slot 2 current_orders to max_capacity
    await db.prepare('UPDATE pickup_slots SET current_orders = max_capacity WHERE id = 2').run();

    const res = await request(app).get(`/api/slots/available?date=${todayStr}`);
    expect(res.status).toBe(200);
    const slots = res.body.slots || res.body.data?.slots;
    const slot2 = slots.find(s => s.id === 2);

    expect(slot2).toBeDefined();
    const isFull = Number(slot2.current_orders) >= Number(slot2.max_capacity || slot2.capacity) || slot2.is_full === true || slot2.remaining_capacity === 0;
    expect(isFull).toBe(true);
  });

  it('T1-SLOT-04: Order Placement Rejected When Slot is Full', async () => {
    // Attempt order on slot 2 which is at full capacity
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 2,
        items: [{ item_id: 9, quantity: 1 }]
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toMatch(/slot.*full|capacity.*exceeded|unavailable|no capacity/i);
  });

  it('T1-SLOT-05: Slot Capacity Restored on Order Cancellation', async () => {
    // 1. Place order on slot 3
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 3,
        items: [{ item_id: 8, quantity: 1 }]
      });

    expect(orderRes.status).toBe(201);
    const order = orderRes.body.order || orderRes.body.data?.order;
    const orderId = order.id;

    const slotBeforeCancel = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = 3').get();

    // 2. Cancel order
    const cancelRes = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(studentAuth.headers);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);

    const slotAfterCancel = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = 3').get();
    expect(Number(slotAfterCancel.current_orders)).toBe(Number(slotBeforeCancel.current_orders) - 1);
  });
});
