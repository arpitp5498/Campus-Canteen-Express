const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 3: Item Availability Toggle vs Active Cart & Checkout Rejection', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  let adminAuth;
  let slotId;
  let springRollItem;

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
    springRollItem = items.find(i => i.name === 'Spring Roll');
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T3-AVAIL-01: Checkout fails when an item in cart is toggled unavailable by admin', async () => {
    // 1. Admin disables Spring Roll
    const toggleOffRes = await request(app)
      .patch(`/api/menu/${springRollItem.id}/availability`)
      .set(adminAuth.headers)
      .send({ is_available: 0 });

    expect(toggleOffRes.status).toBe(200);

    // 2. Student attempts checkout with disabled item
    const checkoutFailRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [{ item_id: springRollItem.id, quantity: 1 }]
      });

    expect(checkoutFailRes.status).toBe(400);
    expect(checkoutFailRes.body.success).toBe(false);
    expect(checkoutFailRes.body.message || checkoutFailRes.body.error).toMatch(/unavailable|not available/i);

    // 3. Admin re-enables Spring Roll
    const toggleOnRes = await request(app)
      .patch(`/api/menu/${springRollItem.id}/availability`)
      .set(adminAuth.headers)
      .send({ is_available: 1 });

    expect(toggleOnRes.status).toBe(200);

    // 4. Student checkout now succeeds
    const checkoutSuccessRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: slotId,
        items: [{ item_id: springRollItem.id, quantity: 1 }]
      });

    expect(checkoutSuccessRes.status).toBe(201);
    expect(checkoutSuccessRes.body.success).toBe(true);
  });
});
