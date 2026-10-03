const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 1: Payment Integration & Mock Fallback (Feature Coverage)', () => {
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

  beforeEach(async () => {
    await db.run('UPDATE pickup_slots SET current_orders = 0');
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T1-PAY-01: Order Creation Returns Mock Payment Data When Keys Are Unset', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 9, quantity: 1 }] // Burger ₹40
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const payment = res.body.payment || res.body.data?.payment;
    expect(payment).toBeDefined();
    expect(payment.is_mock).toBe(true);
    expect(payment.razorpay_order_id).toBeDefined();
  });

  it('T1-PAY-02: Verify Mock Payment Successfully Confirms Order', async () => {
    // 1. Create order
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 8, quantity: 1 }] // Maggi ₹50
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const payment = orderRes.body.payment || orderRes.body.data?.payment;

    // 2. Verify payment
    const verifyRes = await request(app)
      .post('/api/orders/verify-payment')
      .set(studentAuth.headers)
      .send({
        order_id: order.id,
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_signature: 'mock_signature'
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);

    // Verify DB payment record
    const dbPayment = await db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id);
    expect(dbPayment).toBeDefined();
    expect(dbPayment.status).toMatch(/SUCCESS|PAID/);
  });

  it('T1-PAY-03: Rejection of Payment Verification with Non-Existent Order ID', async () => {
    const res = await request(app)
      .post('/api/orders/verify-payment')
      .set(studentAuth.headers)
      .send({
        order_id: 999999,
        razorpay_order_id: 'order_mock_999999',
        razorpay_payment_id: 'pay_mock_999999',
        razorpay_signature: 'mock_signature'
      });

    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('T1-PAY-04: Duplicate Payment Verification Is Handled Idempotently', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 11, quantity: 1 }] // Tea
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const paymentPayload = {
      order_id: order.id,
      razorpay_order_id: `order_mock_${Date.now()}`,
      razorpay_payment_id: `pay_mock_${Date.now()}`,
      razorpay_signature: 'mock_signature'
    };

    const firstRes = await request(app)
      .post('/api/orders/verify-payment')
      .set(studentAuth.headers)
      .send(paymentPayload);

    expect(firstRes.status).toBe(200);

    const secondRes = await request(app)
      .post('/api/orders/verify-payment')
      .set(studentAuth.headers)
      .send(paymentPayload);

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.success).toBe(true);
  });
});
