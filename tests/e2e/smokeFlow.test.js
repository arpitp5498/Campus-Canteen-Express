const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');

describe('Scripted E2E Smoke Test Flow (Full User Journey)', () => {
  let app;
  let db;
  let dbPath;
  let studentToken, adminToken;
  let selectedSlot, chosenItem, orderId, orderNumber, pickupToken;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  test('Step 1: Student Registration (POST /api/auth/register)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Alex Rivera',
        email: `alex.rivera_${Date.now()}@campus.edu`,
        password: 'Password@123'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const token = res.body.token || res.body.data?.token;
    expect(token).toBeDefined();
    studentToken = token;
  });

  test('Step 2: Student Login (POST /api/auth/login)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'student@campus.edu',
        password: 'Student@12345'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    studentToken = res.body.token || res.body.data?.token;
    const user = res.body.user || res.body.data?.user;
    expect(user.role).toBe('STUDENT');
  });

  test('Step 3: Browse Menu, Search, & Filter (GET /api/menu)', async () => {
    // Fetch all
    const menuRes = await request(app).get('/api/menu');
    expect(menuRes.status).toBe(200);
    const items = menuRes.body.items || menuRes.body.data?.items;
    expect(items.length).toBeGreaterThanOrEqual(23);

    // Search for "Maggi"
    const searchRes = await request(app).get('/api/menu?search=Maggi');
    expect(searchRes.status).toBe(200);
    const searchItems = searchRes.body.items || searchRes.body.data?.items;
    expect(searchItems.some(i => i.name === 'Cheese Maggi')).toBe(true);

    // Filter by Snacks
    const filterRes = await request(app).get('/api/menu?category=Snacks');
    expect(filterRes.status).toBe(200);
    const filterItems = filterRes.body.items || filterRes.body.data?.items;
    chosenItem = filterItems.find(i => i.name === 'Cheese Maggi'); // ₹80
    expect(chosenItem).toBeDefined();
  });

  test('Step 4: Select Pickup Time Slot (GET /api/slots/available)', async () => {
    const slotRes = await request(app).get('/api/slots/available');
    expect(slotRes.status).toBe(200);
    const slots = slotRes.body.slots || slotRes.body.data?.slots;
    expect(slots.length).toBeGreaterThan(0);
    selectedSlot = slots[0];
  });

  test('Step 5: Place Order with Server-Calculated Totals (POST /api/orders)', async () => {
    // 2 x Cheese Maggi (₹80) = ₹160 + ₹3 Express Fee = ₹163
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        slot_id: selectedSlot.id,
        items: [{ item_id: chosenItem.id, quantity: 2 }]
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.success).toBe(true);
    const order = orderRes.body.order || orderRes.body.data?.order;
    orderId = order.id;
    orderNumber = order.order_number;
    pickupToken = order.pickup_token;

    expect(orderNumber).toMatch(/^CCE-\d+$/);
    expect(pickupToken).toMatch(/^[A-Z0-9]{4}$/);
    expect(Number(order.subtotal)).toBe(160);
    expect(Number(order.express_fee)).toBe(3);
    expect(Number(order.total_amount)).toBe(163);
  });

  test('Step 6: Payment Verification Simulation (POST /api/orders/verify-payment)', async () => {
    const payRes = await request(app)
      .post('/api/orders/verify-payment')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        order_id: orderId,
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_order_id: `order_mock_${Date.now()}`,
        razorpay_signature: 'mock_signature'
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.success).toBe(true);
  });

  test('Step 7: Admin Login (POST /api/auth/login)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@canteen.local',
        password: 'Admin@123'
      });

    expect(res.status).toBe(200);
    adminToken = res.body.token || res.body.data?.token;
    const user = res.body.user || res.body.data?.user;
    expect(user.role).toBe('ADMIN');
  });

  test('Step 8: Admin Views Order in Incoming Orders (GET /api/admin/orders)', async () => {
    const listRes = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const orders = listRes.body.orders || listRes.body.data?.orders;
    const found = orders.find(o => o.id === orderId);
    expect(found).toBeDefined();
    expect(found.status).toBe('PLACED');
  });

  test('Step 9: Admin Transitions PLACED -> ACCEPTED', async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACCEPTED' });

    expect(res.status).toBe(200);
    const order = res.body.order || res.body.data?.order;
    expect(order.status).toBe('ACCEPTED');
  });

  test('Step 10: Admin Transitions ACCEPTED -> PREPARING', async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' });

    expect(res.status).toBe(200);
    const order = res.body.order || res.body.data?.order;
    expect(order.status).toBe('PREPARING');
  });

  test('Step 11: Admin Transitions PREPARING -> READY', async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'READY' });

    expect(res.status).toBe(200);
    const order = res.body.order || res.body.data?.order;
    expect(order.status).toBe('READY');
  });

  test('Step 12: Manual Pickup Token Entry Verification at Express Counter (POST /api/admin/orders/verify-token)', async () => {
    const verifyRes = await request(app)
      .post('/api/admin/orders/verify-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pickup_token: pickupToken });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    const order = verifyRes.body.order || verifyRes.body.data?.order;
    expect(order.id).toBe(orderId);
    expect(order.order_number).toBe(orderNumber);
  });

  test('Step 13: Admin Transitions READY -> COLLECTED', async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COLLECTED' });

    expect(res.status).toBe(200);
    const order = res.body.order || res.body.data?.order;
    expect(order.status).toBe('COLLECTED');
  });

  test('Step 14: Student Verifies Final COLLECTED Status on Order Tracking (GET /api/orders/:id)', async () => {
    const studentView = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(studentView.status).toBe(200);
    const order = studentView.body.order || studentView.body.data?.order;
    expect(order.status).toBe('COLLECTED');
  });

  test('Step 15: Admin Analytics Dashboard Reflects Final Status', async () => {
    const analyticsRes = await request(app)
      .get('/api/admin/analytics/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(analyticsRes.status).toBe(200);
    const stats = analyticsRes.body.stats || analyticsRes.body.data?.stats;
    expect(stats.status_breakdown.COLLECTED).toBeGreaterThanOrEqual(1);
  });
});
