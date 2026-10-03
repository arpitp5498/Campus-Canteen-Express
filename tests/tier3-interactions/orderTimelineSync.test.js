const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin } = require('../helpers/authHelper');

describe('Tier 3: Student Order Tracking Timeline Synchronization Across Admin Progression', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  let adminAuth;
  let slotId;
  let itemId;
  let orderId;

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
    itemId = items[0].id;

    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({ slot_id: slotId, items: [{ item_id: itemId, quantity: 1 }] });
    const order = orderRes.body.order || orderRes.body.data?.order;
    orderId = order.id;
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('T3-SYNC-01: Visual timeline steps sync deterministically through PLACED -> ACCEPTED -> PREPARING -> READY -> COLLECTED', async () => {
    const states = ['ACCEPTED', 'PREPARING', 'READY', 'COLLECTED'];

    // Initial student view: PLACED
    let check = await request(app).get(`/api/orders/${orderId}`).set(studentAuth.headers);
    expect((check.body.order || check.body.data?.order).status).toBe('PLACED');

    for (const nextState of states) {
      // Admin advances status
      const adminPatch = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set(adminAuth.headers)
        .send({ status: nextState });

      expect(adminPatch.status).toBe(200);
      expect((adminPatch.body.order || adminPatch.body.data?.order).status).toBe(nextState);

      // Student checks timeline
      check = await request(app).get(`/api/orders/${orderId}`).set(studentAuth.headers);
      expect((check.body.order || check.body.data?.order).status).toBe(nextState);
    }
  });
});
