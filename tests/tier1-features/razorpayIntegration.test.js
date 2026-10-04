const crypto = require('crypto');
const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedStudent } = require('../helpers/authHelper');
const paymentService = require('../../backend/services/paymentService');
const config = require('../../backend/config');

describe('Tier 1: Razorpay Test Mode & Webhook Integration', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  const testSecret = 'rzp_test_secret_for_hmac_sha256_verification_key_123';
  const webhookSecret = 'whsec_test_webhook_secret_key_456';

  let origKeyId;
  let origKeySecret;
  let origWebhookSecret;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    studentAuth = await getAuthenticatedStudent(app);

    // Save original configs
    origKeyId = config.razorpay.keyId;
    origKeySecret = config.razorpay.keySecret;
    origWebhookSecret = config.razorpay.webhookSecret;

    // Set configuration secrets for testing HMAC verification
    config.razorpay.keyId = 'rzp_test_testkey123';
    config.razorpay.keySecret = testSecret;
    config.razorpay.webhookSecret = webhookSecret;
  });

  afterAll(async () => {
    config.razorpay.keyId = origKeyId;
    config.razorpay.keySecret = origKeySecret;
    config.razorpay.webhookSecret = origWebhookSecret;
    closeAndRemoveTestDb(db, dbPath);
  });

  it('RZP-01: Cryptographic HMAC-SHA256 signature verification accepts valid signatures', () => {
    const orderId = 'order_test_998877';
    const paymentId = 'pay_test_112233';
    const payload = `${orderId}|${paymentId}`;
    const validSignature = crypto.createHmac('sha256', testSecret).update(payload).digest('hex');

    const isValid = paymentService.verifyPaymentSignature({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature
    });

    expect(isValid).toBe(true);
  });

  it('RZP-02: Cryptographic signature verification strictly rejects invalid signatures', () => {
    const orderId = 'order_test_998877';
    const paymentId = 'pay_test_112233';
    const forgedSignature = 'forged_deadbeef1234567890abcdef1234567890abcdef1234567890abcdef1234';

    const isValid = paymentService.verifyPaymentSignature({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: forgedSignature
    });

    expect(isValid).toBe(false);
  });

  it('RZP-03: Webhook endpoint rejects requests with missing or invalid x-razorpay-signature', async () => {
    // 1. Missing header
    const resNoSig = await request(app)
      .post('/api/payments/webhook')
      .send({ event: 'payment.captured' });

    expect(resNoSig.status).toBe(400);
    expect(resNoSig.body.success).toBe(false);

    // 2. Invalid signature
    const resBadSig = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', 'invalid_signature_hex')
      .send({ event: 'payment.captured' });

    expect(resBadSig.status).toBe(400);
    expect(resBadSig.body.success).toBe(false);
  });

  it('RZP-04: Webhook endpoint processes payment.captured and updates status idempotently', async () => {
    // Create an order first
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 1,
        items: [{ item_id: 1, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const payment = orderRes.body.payment || orderRes.body.data?.payment;
    const rzpOrderId = payment.razorpay_order_id;
    const rzpPaymentId = `pay_rzp_live_${Date.now()}`;

    // Prepare webhook payload
    const eventPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId,
            order_id: rzpOrderId,
            amount: 3300,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    };

    const rawBodyStr = JSON.stringify(eventPayload);
    const validSignature = crypto.createHmac('sha256', webhookSecret).update(rawBodyStr).digest('hex');

    // Send valid webhook
    const whRes = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawBodyStr);

    expect(whRes.status).toBe(200);
    expect(whRes.body.success).toBe(true);

    // Verify DB update
    const dbPayment = await db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id);
    expect(dbPayment.status).toBe('SUCCESS');
    expect(dbPayment.razorpay_payment_id).toBe(rzpPaymentId);

    // Idempotent test: Send same webhook again
    const whDuplicate = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawBodyStr);

    expect(whDuplicate.status).toBe(200);
    expect(whDuplicate.body.success).toBe(true);
  });

  it('RZP-05: Webhook handles payment.failed event without breaking order state', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 2,
        items: [{ item_id: 2, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const payment = orderRes.body.payment || orderRes.body.data?.payment;
    const rzpOrderId = payment.razorpay_order_id;
    const rzpPaymentId = `pay_rzp_failed_${Date.now()}`;

    const eventPayload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId,
            order_id: rzpOrderId,
            status: 'failed',
            error_description: 'Card declined by issuer'
          }
        }
      }
    };

    const rawBodyStr = JSON.stringify(eventPayload);
    const validSignature = crypto.createHmac('sha256', webhookSecret).update(rawBodyStr).digest('hex');

    const whRes = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawBodyStr);

    expect(whRes.status).toBe(200);

    const dbPayment = await db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id);
    expect(dbPayment.status).toBe('FAILED');
  });

  it('RZP-06: Safe payment retry creates fresh payment descriptor for unpaid order', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 3,
        items: [{ item_id: 3, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;

    // Retry payment via POST /api/orders/:id/retry-payment
    const retryRes = await request(app)
      .post(`/api/orders/${order.id}/retry-payment`)
      .set(studentAuth.headers);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.success).toBe(true);
    const retryData = retryRes.body.data || retryRes.body;
    expect(retryData.payment).toBeDefined();
    expect(retryData.payment.razorpay_order_id).toBeDefined();

    // Also test POST /api/payments/retry
    const directRetryRes = await request(app)
      .post('/api/payments/retry')
      .set(studentAuth.headers)
      .send({ order_id: order.id });

    expect(directRetryRes.status).toBe(200);
    expect(directRetryRes.body.success).toBe(true);
  });

  it('RZP-07: Safe payment retry is rejected if order is already paid', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 3,
        items: [{ item_id: 4, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;
    const payment = orderRes.body.payment || orderRes.body.data?.payment;

    // Confirm payment with valid cryptographic signature
    const paymentId = `pay_valid_${Date.now()}`;
    const payload = `${payment.razorpay_order_id}|${paymentId}`;
    const validSig = crypto.createHmac('sha256', testSecret).update(payload).digest('hex');

    const verifyRes = await request(app)
      .post('/api/orders/verify-payment')
      .set(studentAuth.headers)
      .send({
        order_id: order.id,
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSig
      });

    expect(verifyRes.status).toBe(200);

    // Attempt retry on paid order should now be rejected with 400
    const retryRes = await request(app)
      .post(`/api/orders/${order.id}/retry-payment`)
      .set(studentAuth.headers);

    expect(retryRes.status).toBe(400);
    expect(retryRes.body.success).toBe(false);
  });

  it('RZP-08: Recording payment failure endpoint sets payment status to FAILED', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(studentAuth.headers)
      .send({
        slot_id: 4,
        items: [{ item_id: 5, quantity: 1 }]
      });

    const order = orderRes.body.order || orderRes.body.data?.order;

    const failRes = await request(app)
      .post(`/api/orders/${order.id}/payment-failed`)
      .set(studentAuth.headers)
      .send({
        reason: 'User closed payment window'
      });

    expect(failRes.status).toBe(200);
    expect(failRes.body.success).toBe(true);

    const dbPayment = await db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id);
    expect(dbPayment.status).toBe('FAILED');
  });
});
