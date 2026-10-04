/**
 * Campus Canteen Express - Empirical Concurrency, State Machine & Token Adversarial Test Suite
 * File: tests/adversarial_concurrency_state.test.js
 * 
 * Adversarial challenger tests covering:
 * 1. Slot Concurrency & Overbooking (20 concurrent order placement requests against a slot with 2 capacity)
 * 2. Strict State Machine Violations (All illegal transitions rejected with HTTP 400)
 * 3. Order Cancellation Rules (Allowed in PLACED/ACCEPTED with atomic slot decrement; rejected in PREPARING/READY/COLLECTED)
 * 4. Express Counter Token Verification (Case-insensitivity, whitespace sanitization, status guardrails)
 * 5. Payment Signature Verification (HMAC-SHA256 validation, forged/tampered signature rejection)
 */

const crypto = require('crypto');
const config = require('../backend/config');
const { request, getApp } = require('./helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('./helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin, registerTestUser } = require('./helpers/authHelper');

describe('Adversarial Challenge: Concurrency, State Machine & Token Integrity', () => {
  let app;
  let db;
  let dbPath;
  let adminAuth;
  let studentAuth;
  let studentTokens = [];
  let testSlotId;
  let testMenuItemId;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    adminAuth = await getAuthenticatedAdmin(app);
    studentAuth = await getAuthenticatedStudent(app);

    // Register 20 distinct students for concurrent traffic testing
    for (let i = 1; i <= 20; i++) {
      const reg = await registerTestUser({
        name: `Adversarial Student ${i}`,
        email: `adv_student_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@campus.edu`,
        password: 'Password@123'
      }, app);
      studentTokens.push(reg.token);
    }

    // Ensure slot 1 has high capacity for general tests
    await db.prepare('UPDATE pickup_slots SET max_capacity = 100, current_orders = 0 WHERE id = 1').run();
    testSlotId = 1;

    const menuItem = await db.prepare('SELECT id FROM menu_items WHERE is_available = 1 LIMIT 1').get();
    testMenuItemId = menuItem.id;
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  // =========================================================================
  // 1. Slot Concurrency & Overbooking
  // =========================================================================
  describe('1. Slot Concurrency & Overbooking Under High Contention', () => {
    let raceSlotId;

    beforeEach(async () => {
      // Create a dedicated slot with capacity 2 and 0 current orders
      const todayStr = new Date().toISOString().split('T')[0];
      const slotTime = `19:${Math.floor(10 + Math.random() * 40)}:00`;
      const slotEndTime = `19:${Math.floor(50 + Math.random() * 9)}:00`;
      
      const insert = await db.prepare(`
        INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
        VALUES (?, ?, ?, 2, 0, 1)
      `).run(todayStr, slotTime, slotEndTime);

      raceSlotId = insert.lastInsertRowid;
    });

    test('Spawn 20 concurrent order placement requests against slot with capacity 2 -> Exactly 2 succeed (201), 18 fail (400/409 SLOT_FULL)', async () => {
      // Verify initial slot capacity is 2 and current_orders is 0
      const initialSlot = await db.prepare('SELECT max_capacity, current_orders FROM pickup_slots WHERE id = ?').get(raceSlotId);
      expect(initialSlot.max_capacity).toBe(2);
      expect(initialSlot.current_orders).toBe(0);

      // Launch 20 concurrent requests simultaneously via Promise.all
      const orderPromises = studentTokens.map((token) =>
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${token}`)
          .send({
            slot_id: raceSlotId,
            items: [{ item_id: testMenuItemId, quantity: 1 }]
          })
      );

      const results = await Promise.all(orderPromises);

      const succeeded = results.filter(r => r.status === 201);
      const failed = results.filter(r => r.status === 400 || r.status === 409);

      // Verify exact count of successes and rejections
      expect(succeeded.length).toBe(2);
      expect(failed.length).toBe(18);
      expect(results.length).toBe(20);

      // Verify each failed request returned appropriate error code
      for (const res of failed) {
        expect(res.body.success).toBe(false);
        expect(res.body.code || res.body.message).toMatch(/SLOT_FULL|capacity|full/i);
      }

      // Verify database state: current_orders must be exactly 2 (never overbooked)
      const finalSlot = await db.prepare('SELECT current_orders, max_capacity FROM pickup_slots WHERE id = ?').get(raceSlotId);
      expect(finalSlot.current_orders).toBe(2);
      expect(finalSlot.current_orders).toBeLessThanOrEqual(finalSlot.max_capacity);

      // Verify orders table: exactly 2 orders exist for this slot
      const ordersInDb = await db.prepare('SELECT id, order_number, pickup_token, status FROM orders WHERE pickup_slot_id = ?').all(raceSlotId);
      expect(ordersInDb.length).toBe(2);

      // Verify distinct order numbers and tokens
      const orderNumbers = new Set(ordersInDb.map(o => o.order_number));
      const tokens = new Set(ordersInDb.map(o => o.pickup_token));
      expect(orderNumbers.size).toBe(2);
      expect(tokens.size).toBe(2);
    });
  });

  // =========================================================================
  // 2. Strict State Machine Violations
  // =========================================================================
  describe('2. State Machine Violations & Illegal Transitions', () => {
    async function createFreshOrder() {
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: testSlotId,
          items: [{ item_id: testMenuItemId, quantity: 1 }]
        });
      expect(res.status).toBe(201);
      return res.body.order || res.body.data?.order;
    }

    test('Rejects illegal jump PLACED -> COLLECTED with HTTP 400', async () => {
      const order = await createFreshOrder();
      const res = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'COLLECTED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code || res.body.message).toMatch(/INVALID_STATE_TRANSITION|invalid/i);
    });

    test('Rejects illegal jump PLACED -> PREPARING with HTTP 400', async () => {
      const order = await createFreshOrder();
      const res = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'PREPARING' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code || res.body.message).toMatch(/INVALID_STATE_TRANSITION|invalid/i);
    });

    test('Rejects illegal jump ACCEPTED -> COLLECTED with HTTP 400', async () => {
      const order = await createFreshOrder();
      // Advance to ACCEPTED
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });

      const res = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'COLLECTED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code || res.body.message).toMatch(/INVALID_STATE_TRANSITION|invalid/i);
    });

    test('Rejects illegal backward jump READY -> PREPARING with HTTP 400', async () => {
      const order = await createFreshOrder();
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'READY' });

      const res = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'PREPARING' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code || res.body.message).toMatch(/INVALID_STATE_TRANSITION|invalid/i);
    });

    test('Rejects illegal mutation COLLECTED -> READY with HTTP 400', async () => {
      const order = await createFreshOrder();
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'READY' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'COLLECTED' });

      const res = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'READY' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code || res.body.message).toMatch(/INVALID_STATE_TRANSITION|invalid/i);
    });

    test('Rejects resurrection CANCELLED -> PLACED or CANCELLED -> ACCEPTED with HTTP 400', async () => {
      const order = await createFreshOrder();
      await request(app).post(`/api/orders/${order.id}/cancel`).set(studentAuth.headers);

      // Verify order is CANCELLED
      const cancelledOrder = await db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id);
      expect(cancelledOrder.status).toBe('CANCELLED');

      // Attempt CANCELLED -> PLACED
      const resPlaced = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'PLACED' });

      expect(resPlaced.status).toBe(400);
      expect(resPlaced.body.success).toBe(false);

      // Attempt CANCELLED -> ACCEPTED
      const resAccepted = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(adminAuth.headers)
        .send({ status: 'ACCEPTED' });

      expect(resAccepted.status).toBe(400);
      expect(resAccepted.body.success).toBe(false);
    });

    test('Rejects invalid status values (gibberish, empty, non-string) with HTTP 400', async () => {
      const order = await createFreshOrder();

      const invalidValues = ['COOKING', 'DELIVERED', 'COMPLETED', '', 12345, null];
      for (const val of invalidValues) {
        const res = await request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set(adminAuth.headers)
          .send({ status: val });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });
  });

  // =========================================================================
  // 3. Order Cancellation Rules & Atomic Slot Capacity Restoration
  // =========================================================================
  describe('3. Order Cancellation Rules & Slot Restoration', () => {
    let cancelSlotId;

    beforeEach(async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const randId = `${Date.now() % 10000}_${Math.floor(Math.random() * 1000)}`;
      const slotTime = `20:${String(Math.floor(Math.random() * 50)).padStart(2, '0')}:${String(Math.floor(Math.random() * 59)).padStart(2, '0')}`;
      const slotEndTime = `21:${String(Math.floor(Math.random() * 50)).padStart(2, '0')}:${String(Math.floor(Math.random() * 59)).padStart(2, '0')}`;
      
      const insert = await db.prepare(`
        INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
        VALUES (?, ?, ?, 50, 0, 1)
        ON DUPLICATE KEY UPDATE current_orders = 0
      `).run(todayStr, slotTime, slotEndTime);

      cancelSlotId = insert.lastInsertRowid;
    });

    async function createTestOrderForSlot(slotId) {
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: slotId,
          items: [{ item_id: testMenuItemId, quantity: 1 }]
        });
      expect(res.status).toBe(201);
      return res.body.order || res.body.data?.order;
    }

    test('Cancellation in PLACED status succeeds (200) and atomically decrements slot current_orders', async () => {
      const initialSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = ?').get(cancelSlotId);
      const order = await createTestOrderForSlot(cancelSlotId);

      // Verify slot incremented
      const occupiedSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = ?').get(cancelSlotId);
      expect(occupiedSlot.current_orders).toBe(initialSlot.current_orders + 1);

      // Cancel order
      const cancelRes = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(studentAuth.headers)
        .send({ cancellation_reason: 'Student change of mind' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);

      // Verify status in DB
      const dbOrder = await db.prepare('SELECT status, cancellation_reason FROM orders WHERE id = ?').get(order.id);
      expect(dbOrder.status).toBe('CANCELLED');
      expect(dbOrder.cancellation_reason).toBe('Student change of mind');

      // Verify slot count decremented
      const restoredSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = ?').get(cancelSlotId);
      expect(restoredSlot.current_orders).toBe(initialSlot.current_orders);
    });

    test('Cancellation in ACCEPTED status succeeds (200) and atomically decrements slot current_orders', async () => {
      const initialSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = ?').get(cancelSlotId);
      const order = await createTestOrderForSlot(cancelSlotId);

      // Advance to ACCEPTED
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });

      // Cancel order
      const cancelRes = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(studentAuth.headers);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);

      const dbOrder = await db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id);
      expect(dbOrder.status).toBe('CANCELLED');

      // Verify slot restored
      const restoredSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = ?').get(cancelSlotId);
      expect(restoredSlot.current_orders).toBe(initialSlot.current_orders);
    });

    test('Cancellation in PREPARING status fails with HTTP 400 and preserves slot count', async () => {
      const initialSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = ?').get(cancelSlotId);
      const order = await createTestOrderForSlot(cancelSlotId);

      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      await request(app).patch(`/api/admin/orders/${order.id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });

      const occupiedSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = ?').get(cancelSlotId);

      // Attempt cancellation
      const cancelRes = await request(app)
        .post(`/api/orders/${order.id}/cancel`)
        .set(studentAuth.headers);

      expect(cancelRes.status).toBe(400);
      expect(cancelRes.body.success).toBe(false);
      expect(cancelRes.body.code || cancelRes.body.message).toMatch(/CANNOT_CANCEL_PREPARING|preparation|cannot.*cancel/i);

      // Verify status and slot count unchanged
      const dbOrder = await db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id);
      expect(dbOrder.status).toBe('PREPARING');

      const finalSlot = await db.prepare('SELECT current_orders FROM pickup_slots WHERE id = ?').get(cancelSlotId);
      expect(finalSlot.current_orders).toBe(occupiedSlot.current_orders);
    });

    test('Cancellation in READY and COLLECTED status fails with HTTP 400', async () => {
      // 1. Test in READY
      const order1 = await createTestOrderForSlot(cancelSlotId);
      await request(app).patch(`/api/admin/orders/${order1.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      await request(app).patch(`/api/admin/orders/${order1.id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order1.id}/status`).set(adminAuth.headers).send({ status: 'READY' });

      const cancelReady = await request(app).post(`/api/orders/${order1.id}/cancel`).set(studentAuth.headers);
      expect(cancelReady.status).toBe(400);
      expect(cancelReady.body.success).toBe(false);

      // 2. Test in COLLECTED
      const order2 = await createTestOrderForSlot(cancelSlotId);
      await request(app).patch(`/api/admin/orders/${order2.id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      await request(app).patch(`/api/admin/orders/${order2.id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
      await request(app).patch(`/api/admin/orders/${order2.id}/status`).set(adminAuth.headers).send({ status: 'READY' });
      await request(app).patch(`/api/admin/orders/${order2.id}/status`).set(adminAuth.headers).send({ status: 'COLLECTED' });

      const cancelCollected = await request(app).post(`/api/orders/${order2.id}/cancel`).set(studentAuth.headers);
      expect(cancelCollected.status).toBe(400);
      expect(cancelCollected.body.success).toBe(false);
    });

    test('Re-cancelling already CANCELLED order fails with HTTP 400', async () => {
      const order = await createTestOrderForSlot(cancelSlotId);
      await request(app).post(`/api/orders/${order.id}/cancel`).set(studentAuth.headers);

      const reCancel = await request(app).post(`/api/orders/${order.id}/cancel`).set(studentAuth.headers);
      expect(reCancel.status).toBe(400);
      expect(reCancel.body.success).toBe(false);
      expect(reCancel.body.code || reCancel.body.message).toMatch(/ALREADY_CANCELLED|already/i);
    });
  });

  // =========================================================================
  // 4. Express Counter Token Verification
  // =========================================================================
  describe('4. Express Counter Token Verification & Edge Cases', () => {
    let tokenSlotId;

    beforeAll(async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const insert = await db.prepare(`
        INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
        VALUES (?, '21:00:00', '21:30:00', 100, 0, 1)
      `).run(todayStr);
      tokenSlotId = insert.lastInsertRowid;
    });

    async function createOrderInStatus(status) {
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: tokenSlotId,
          items: [{ item_id: testMenuItemId, quantity: 1 }]
        });
      const order = res.body.order || res.body.data?.order;
      const id = order.id;

      if (status === 'ACCEPTED' || status === 'PREPARING' || status === 'READY' || status === 'COLLECTED') {
        await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'ACCEPTED' });
      }
      if (status === 'PREPARING' || status === 'READY' || status === 'COLLECTED') {
        await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'PREPARING' });
      }
      if (status === 'READY' || status === 'COLLECTED') {
        await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'READY' });
      }
      if (status === 'COLLECTED') {
        await request(app).patch(`/api/admin/orders/${id}/status`).set(adminAuth.headers).send({ status: 'COLLECTED' });
      }

      return order;
    }

    test('Token verification is case-insensitive (e.g., lower vs upper vs mixed)', async () => {
      const order = await createOrderInStatus('READY');
      const token = order.pickup_token;
      expect(token).toBeDefined();

      // Test lowercase
      const lowerRes = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: token.toLowerCase() });

      expect(lowerRes.status).toBe(200);
      expect(lowerRes.body.success).toBe(true);
      expect((lowerRes.body.order || lowerRes.body.data?.order).id).toBe(order.id);

      // Test uppercase
      const upperRes = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: token.toUpperCase() });

      expect(upperRes.status).toBe(200);
      expect((upperRes.body.order || upperRes.body.data?.order).id).toBe(order.id);
    });

    test('Token verification trims leading and trailing whitespace and newlines', async () => {
      const order = await createOrderInStatus('READY');
      const token = order.pickup_token;

      const spaceRes = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: `   ${token}   ` });

      expect(spaceRes.status).toBe(200);
      expect((spaceRes.body.order || spaceRes.body.data?.order).id).toBe(order.id);

      const newlineRes = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: `\t${token.toLowerCase()}\n` });

      expect(newlineRes.status).toBe(200);
      expect((newlineRes.body.order || newlineRes.body.data?.order).id).toBe(order.id);
    });

    test('Token verification fails with 400 ORDER_NOT_READY for PLACED, ACCEPTED, and PREPARING orders', async () => {
      // 1. PLACED
      const placedOrder = await createOrderInStatus('PLACED');
      const placedVerify = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: placedOrder.pickup_token });

      expect(placedVerify.status).toBe(400);
      expect(placedVerify.body.success).toBe(false);
      expect(placedVerify.body.code || placedVerify.body.message).toMatch(/ORDER_NOT_READY|not ready/i);

      // 2. ACCEPTED
      const acceptedOrder = await createOrderInStatus('ACCEPTED');
      const acceptedVerify = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: acceptedOrder.pickup_token });

      expect(acceptedVerify.status).toBe(400);
      expect(acceptedVerify.body.code || acceptedVerify.body.message).toMatch(/ORDER_NOT_READY|not ready/i);

      // 3. PREPARING
      const prepOrder = await createOrderInStatus('PREPARING');
      const prepVerify = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: prepOrder.pickup_token });

      expect(prepVerify.status).toBe(400);
      expect(prepVerify.body.code || prepVerify.body.message).toMatch(/ORDER_NOT_READY|not ready/i);
    });

    test('Re-verification of COLLECTED order fails with 400 (TOKEN/ORDER_ALREADY_COLLECTED)', async () => {
      const collectedOrder = await createOrderInStatus('COLLECTED');

      const reVerify = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: collectedOrder.pickup_token });

      expect(reVerify.status).toBe(400);
      expect(reVerify.body.success).toBe(false);
      expect(reVerify.body.code || reVerify.body.message).toMatch(/ORDER_ALREADY_COLLECTED|ALREADY_COLLECTED|collected/i);
    });

    test('Verification of non-existent token fails with 400/404', async () => {
      const nonExistent = await request(app)
        .post('/api/admin/orders/verify-token')
        .set(adminAuth.headers)
        .send({ pickup_token: 'ZZZZ' });

      expect([400, 404]).toContain(nonExistent.status);
      expect(nonExistent.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 5. Payment Signature Verification
  // =========================================================================
  describe('5. Payment Signature Verification & Tamper Resistance', () => {
    const LIVE_KEY = 'rzp_live_production_998877';
    const LIVE_SECRET = 'live_secret_key_hmac_sha256_production_value';

    let paySlotId;

    beforeAll(async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const insert = await db.prepare(`
        INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
        VALUES (?, '22:00:00', '22:30:00', 100, 0, 1)
      `).run(todayStr);
      paySlotId = insert.lastInsertRowid;

      // Configure live secrets on process.env and config object
      process.env.RAZORPAY_KEY_ID = LIVE_KEY;
      process.env.RAZORPAY_KEY_SECRET = LIVE_SECRET;
      config.razorpay.keyId = LIVE_KEY;
      config.razorpay.keySecret = LIVE_SECRET;
      config.razorpay.isMockMode = false;
    });

    afterAll(() => {
      process.env.RAZORPAY_KEY_ID = '';
      process.env.RAZORPAY_KEY_SECRET = '';
      config.razorpay.keyId = '';
      config.razorpay.keySecret = '';
      config.razorpay.isMockMode = true;
    });

    test('Legitimate HMAC-SHA256 signature verifies successfully with 200 OK', async () => {
      const orderRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: paySlotId,
          items: [{ item_id: testMenuItemId, quantity: 1 }]
        });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.order || orderRes.body.data?.order;
      const orderId = order.id;
      const razorpayOrderId = `order_live_${orderId}_${Date.now()}`;
      const razorpayPaymentId = `pay_live_${orderId}_${Date.now()}`;

      // Update payment record with live order ID for accurate verification
      await db.prepare('UPDATE payments SET razorpay_order_id = ? WHERE order_id = ?').run(razorpayOrderId, orderId);

      // Generate genuine HMAC signature using test secret
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const genuineSignature = crypto
        .createHmac('sha256', LIVE_SECRET)
        .update(payload)
        .digest('hex');

      const verifyRes = await request(app)
        .post('/api/orders/verify-payment')
        .set(studentAuth.headers)
        .send({
          order_id: orderId,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: genuineSignature
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      const dbPayment = await db.prepare('SELECT status, razorpay_signature FROM payments WHERE order_id = ?').get(orderId);
      expect(dbPayment.status).toBe('SUCCESS');
      expect(dbPayment.razorpay_signature).toBe(genuineSignature);
    });

    test('Forged or tampered Razorpay signatures are rejected with HTTP 400', async () => {
      const orderRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: paySlotId,
          items: [{ item_id: testMenuItemId, quantity: 1 }]
        });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.order || orderRes.body.data?.order;
      const orderId = order.id;
      const razorpayOrderId = `order_live_${orderId}_${Date.now()}`;
      const razorpayPaymentId = `pay_live_${orderId}_${Date.now()}`;

      await db.prepare('UPDATE payments SET razorpay_order_id = ? WHERE order_id = ?').run(razorpayOrderId, orderId);

      // 1. Completely forged signature hex string
      const forgedSignature = crypto.randomBytes(32).toString('hex');

      const forgedRes = await request(app)
        .post('/api/orders/verify-payment')
        .set(studentAuth.headers)
        .send({
          order_id: orderId,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: forgedSignature
        });

      expect(forgedRes.status).toBe(400);
      expect(forgedRes.body.success).toBe(false);
      expect(forgedRes.body.message || forgedRes.body.error).toMatch(/signature.*failed|invalid.*signature/i);

      // 2. Signature generated with a different / attacker secret key
      const attackerSignature = crypto
        .createHmac('sha256', 'attacker_fake_secret_key')
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      const attackerRes = await request(app)
        .post('/api/orders/verify-payment')
        .set(studentAuth.headers)
        .send({
          order_id: orderId,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: attackerSignature
        });

      expect(attackerRes.status).toBe(400);
      expect(attackerRes.body.success).toBe(false);

      // 3. Tampered payment ID with valid signature of another payload
      const otherPayloadSig = crypto
        .createHmac('sha256', LIVE_SECRET)
        .update(`${razorpayOrderId}|pay_other_12345`)
        .digest('hex');

      const tamperedIdRes = await request(app)
        .post('/api/orders/verify-payment')
        .set(studentAuth.headers)
        .send({
          order_id: orderId,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId, // Does not match pay_other_12345
          razorpay_signature: otherPayloadSig
        });

      expect(tamperedIdRes.status).toBe(400);
      expect(tamperedIdRes.body.success).toBe(false);
    });

    test('Missing or null signature in request is rejected with HTTP 400', async () => {
      const orderRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: paySlotId,
          items: [{ item_id: testMenuItemId, quantity: 1 }]
        });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.order || orderRes.body.data?.order;
      const orderId = order.id;

      const missingSigRes = await request(app)
        .post('/api/orders/verify-payment')
        .set(studentAuth.headers)
        .send({
          order_id: orderId,
          razorpay_order_id: `order_live_${orderId}`,
          razorpay_payment_id: `pay_live_${orderId}`
          // Missing razorpay_signature
        });

      expect(missingSigRes.status).toBe(400);
      expect(missingSigRes.body.success).toBe(false);
    });
  });
});
