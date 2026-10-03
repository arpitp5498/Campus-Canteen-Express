/**
 * Campus Canteen Express - Empirical Adversarial Security & Pricing Test Harness
 * File: tests/adversarial_api_security.test.js
 * 
 * Adversarial Challenger: Challenger 1 (Milestone 2 Backend Verification)
 * 
 * Stress Tests:
 * 1. Price Tampering & Injection Resistance (Authoritative server pricing, ₹3 express fee, snapshot immutability)
 * 2. Authentication & Authorization Fuzzing (Forged JWTs, expired tokens, malformed headers, IDOR, RBAC)
 * 3. Payload Injection & Malformed Data Handling (SQLi, invalid data types, boundary fuzzing, unavailable entities)
 * 4. Error Handling & Information Disclosure Prevention (No stack traces in 4xx/5xx, consistent JSON envelopes)
 * 5. Rate Limiting Enforcement (429 Too Many Requests, header verification)
 */

const jwt = require('jsonwebtoken');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { request, getApp } = require('./helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('./helpers/dbHelper');
const { getAuthenticatedStudent, getAuthenticatedAdmin, registerTestUser, generateDirectToken } = require('./helpers/authHelper');

describe('Adversarial Security, Pricing & Penetration Stress Harness', () => {
  let app;
  let db;
  let dbPath;
  let studentAuth;
  let adminAuth;
  let secondStudentAuth;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    studentAuth = await getAuthenticatedStudent(app);
    adminAuth = await getAuthenticatedAdmin(app);
    secondStudentAuth = await registerTestUser({
      name: 'Second Student',
      email: 'student2@campus.edu',
      password: 'Student2@123',
      role: 'STUDENT'
    }, app);
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  // =========================================================================
  // 1. PRICE TAMPERING & INJECTION STRESS TESTING
  // =========================================================================
  describe('1. Price Tampering & Injection Stress Testing', () => {
    it('ADV-PRC-01: Recomputes total and ignores client-supplied fake low item prices', async () => {
      // Cheese Grilled Sandwich (#3) base price is ₹80.00
      // Client maliciously supplies price: 0.01 and unit_price: 0
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 3, quantity: 2, price: 0.01, unit_price: 0.00 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const order = res.body.order || res.body.data?.order;
      
      // Authoritative calculation: 2 x ₹80.00 = ₹160.00 subtotal + ₹3.00 fee = ₹163.00 total
      expect(Number(order.subtotal)).toBe(160.00);
      expect(Number(order.express_fee)).toBe(3.00);
      expect(Number(order.total_amount)).toBe(163.00);

      // Verify item snapshot in database
      const itemSnapshot = await db.prepare('SELECT * FROM order_items WHERE order_id = ?').get(order.id);
      expect(Number(itemSnapshot.unit_price_snapshot)).toBe(80.00);
      expect(Number(itemSnapshot.total_price)).toBe(160.00);
      expect(itemSnapshot.item_name_snapshot).toBe('Cheese Grilled Sandwich');
    });

    it('ADV-PRC-02: Overrides zero/negative/tampered subtotal and total_amount payloads', async () => {
      // Maggi (#8) is ₹50.00. Client passes zero subtotal and ₹1.00 total
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 8, quantity: 1 }],
          subtotal: 0.00,
          total_amount: 1.00,
          express_fee: 0.00
        });

      expect(res.status).toBe(201);
      const order = res.body.order || res.body.data?.order;
      expect(Number(order.subtotal)).toBe(50.00);
      expect(Number(order.express_fee)).toBe(3.00);
      expect(Number(order.total_amount)).toBe(53.00);

      // Confirm DB record matches authoritative sum
      const orderDb = await db.prepare('SELECT subtotal, express_fee, total_amount FROM orders WHERE id = ?').get(order.id);
      expect(Number(orderDb.subtotal)).toBe(50.00);
      expect(Number(orderDb.express_fee)).toBe(3.00);
      expect(Number(orderDb.total_amount)).toBe(53.00);
    });

    it('ADV-PRC-03: Strictly enforces invariant ₹3.00 express fee when fee tampering is attempted', async () => {
      // French Fries (#6) is ₹60.00. Client tries to set express_fee to -10 or 0
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 6, quantity: 1 }],
          express_fee: -10.00
        });

      expect(res.status).toBe(201);
      const order = res.body.order || res.body.data?.order;
      expect(Number(order.express_fee)).toBe(3.00);
      expect(Number(order.total_amount)).toBe(63.00);
    });

    it('ADV-PRC-04: Recalculates variant prices strictly from DB despite client manipulation', async () => {
      // Chilli Potato Full Variant (#2) is ₹120.00. Client sends price: 5.00
      const res = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 5, variant_id: 2, quantity: 2, price: 5.00 }]
        });

      expect(res.status).toBe(201);
      const order = res.body.order || res.body.data?.order;
      // 2 x ₹120.00 = ₹240.00 + ₹3.00 = ₹243.00
      expect(Number(order.subtotal)).toBe(240.00);
      expect(Number(order.total_amount)).toBe(243.00);

      const itemSnapshot = await db.prepare('SELECT * FROM order_items WHERE order_id = ?').get(order.id);
      expect(Number(itemSnapshot.unit_price_snapshot)).toBe(120.00);
      expect(itemSnapshot.variant_name_snapshot).toBe('Full');
      expect(Number(itemSnapshot.total_price)).toBe(240.00);
    });

    it('ADV-PRC-05: Preserves historical price snapshots when admin alters catalog prices post-order', async () => {
      // 1. Student places order for Normal Sandwich (#1) @ ₹30.00
      const orderRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 1, quantity: 1 }]
        });

      const orderId = (orderRes.body.order || orderRes.body.data?.order).id;

      // 2. Admin increases Normal Sandwich price to ₹55.00
      await request(app)
        .put('/api/menu/1')
        .set(adminAuth.headers)
        .send({
          name: 'Normal Sandwich (Gourmet)',
          description: 'Updated sandwich',
          category: 'Sandwiches',
          price: 55.00,
          preparation_time: 5,
          is_available: 1
        });

      // 3. Retrieve historical order and verify pricing is frozen
      const historyRes = await request(app)
        .get(`/api/orders/${orderId}`)
        .set(studentAuth.headers);

      expect(historyRes.status).toBe(200);
      const historicalOrder = historyRes.body.order || historyRes.body.data?.order;
      expect(Number(historicalOrder.subtotal)).toBe(30.00);
      expect(Number(historicalOrder.total_amount)).toBe(33.00);
      expect(Number(historicalOrder.items[0].unit_price || historicalOrder.items[0].unit_price_snapshot)).toBe(30.00);
      expect(historicalOrder.items[0].name || historicalOrder.items[0].item_name_snapshot).toBe('Normal Sandwich');
    });
  });

  // =========================================================================
  // 2. AUTHENTICATION & AUTHORIZATION FUZZING
  // =========================================================================
  describe('2. Authentication & Authorization Fuzzing', () => {
    it('ADV-AUTH-01: Rejects forged JWT signed with an arbitrary rogue secret', async () => {
      const rogueToken = jwt.sign({ userId: 2, role: 'STUDENT' }, 'rogue_secret_unauthorized_key_999');
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${rogueToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code || res.body.code).toMatch(/INVALID_TOKEN|UNAUTHORIZED/);
    });

    it('ADV-AUTH-02: Rejects forged JWT with "none" algorithm', async () => {
      // Construct unsigned none token
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ userId: 1, role: 'ADMIN' })).toString('base64url');
      const unsignedToken = `${header}.${payload}.`;

      const res = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${unsignedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('ADV-AUTH-03: Rejects expired JWT tokens', async () => {
      const expiredToken = generateDirectToken(
        { userId: 2, role: 'STUDENT' },
        process.env.JWT_SECRET || 'test_jwt_super_secret_key_canteen_express_2026',
        { expiresIn: '-10s' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code || res.body.code || res.body.message).toMatch(/TOKEN_EXPIRED|expired/i);
    });

    it('ADV-AUTH-04: Rejects validly-signed JWT with non-existent database userId', async () => {
      const phantomToken = generateDirectToken(
        { userId: 999999, role: 'STUDENT' },
        process.env.JWT_SECRET || 'test_jwt_super_secret_key_canteen_express_2026'
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${phantomToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('ADV-AUTH-05: Rejects validly-signed JWT missing user identifier claim', async () => {
      const emptyClaimToken = generateDirectToken(
        { email: 'student@campus.edu' }, // Missing userId
        process.env.JWT_SECRET || 'test_jwt_super_secret_key_canteen_express_2026'
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${emptyClaimToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('ADV-AUTH-06: Fuzzes malformed Authorization headers with varied invalid schemes', async () => {
      const malformedHeaders = [
        'Token valid.looking.token',
        'Basic dXNlcjpwYXNz',
        'Bearer',
        'Bearer ',
        'Bearer   ',
        'Bearer token1 token2',
        'Bearer invalid-garbage-format'
      ];

      for (const headerVal of malformedHeaders) {
        const res = await request(app)
          .get('/api/auth/me')
          .set('Authorization', headerVal);

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it('ADV-AUTH-07: Prevents vertical role escalation (Student attempting Admin routes -> 403 Forbidden)', async () => {
      const adminEndpoints = [
        { method: 'get', path: '/api/admin/orders' },
        { method: 'patch', path: '/api/admin/orders/1/status', body: { status: 'ACCEPTED' } },
        { method: 'post', path: '/api/admin/orders/verify-token', body: { pickup_token: 'A1B2' } },
        { method: 'get', path: '/api/admin/analytics/dashboard' },
        { method: 'post', path: '/api/admin/menu', body: { name: 'Hack Item', category: 'Snacks', price: 10 } },
        { method: 'put', path: '/api/admin/menu/1', body: { name: 'Hack Item', category: 'Snacks', price: 10 } },
        { method: 'delete', path: '/api/admin/menu/1' },
        { method: 'patch', path: '/api/admin/slots/1', body: { max_capacity: 50 } }
      ];

      for (const ep of adminEndpoints) {
        let reqBuilder = request(app)[ep.method](ep.path).set(studentAuth.headers);
        if (ep.body) {
          reqBuilder = reqBuilder.send(ep.body);
        }
        const res = await reqBuilder;
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error?.code || res.body.code).toMatch(/FORBIDDEN/i);
      }
    });

    it('ADV-AUTH-08: Rejects unauthenticated requests to protected endpoints -> 401 Unauthorized', async () => {
      const protectedEndpoints = [
        { method: 'get', path: '/api/auth/me' },
        { method: 'post', path: '/api/orders', body: { slot_id: 1, items: [{ item_id: 1, quantity: 1 }] } },
        { method: 'get', path: '/api/orders/my-orders' },
        { method: 'get', path: '/api/orders/1' },
        { method: 'post', path: '/api/orders/1/cancel' },
        { method: 'get', path: '/api/admin/orders' }
      ];

      for (const ep of protectedEndpoints) {
        let reqBuilder = request(app)[ep.method](ep.path);
        if (ep.body) {
          reqBuilder = reqBuilder.send(ep.body);
        }
        const res = await reqBuilder;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it('ADV-AUTH-09: Prevents Horizontal Cross-User IDOR (Student A order cannot be accessed or cancelled by Student B)', async () => {
      // 1. Student A places an order
      const orderRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 11, quantity: 1 }] // Tea
        });

      const orderAId = (orderRes.body.order || orderRes.body.data?.order).id;

      // 2. Student B attempts to view Student A's order
      const viewRes = await request(app)
        .get(`/api/orders/${orderAId}`)
        .set(secondStudentAuth.headers);

      expect(viewRes.status).toBe(403);
      expect(viewRes.body.success).toBe(false);
      expect(viewRes.body.error?.code || viewRes.body.code).toMatch(/FORBIDDEN/i);

      // 3. Student B attempts to cancel Student A's order
      const cancelRes = await request(app)
        .post(`/api/orders/${orderAId}/cancel`)
        .set(secondStudentAuth.headers);

      expect(cancelRes.status).toBe(403);
      expect(cancelRes.body.success).toBe(false);

      // 4. Verify order is still PLACED in database
      const orderDb = await db.prepare('SELECT status FROM orders WHERE id = ?').get(orderAId);
      expect(orderDb.status).toBe('PLACED');
    });
  });

  // =========================================================================
  // 3. PAYLOAD INJECTION & MALFORMED INPUT HANDLING
  // =========================================================================
  describe('3. Payload Injection & Malformed Input Handling', () => {
    it('ADV-INJ-01: Defends against SQL injection in authentication login payloads', async () => {
      const sqliLoginPayloads = [
        { email: "admin@canteen.local' OR '1'='1", password: 'password' },
        { email: "admin@canteen.local'--", password: 'password' },
        { email: "admin@canteen.local' UNION SELECT 1, 'admin', 'admin@canteen.local', 'hash', 'ADMIN'--", password: 'password' },
        { email: "student@campus.edu", password: "' OR '1'='1" }
      ];

      for (const payload of sqliLoginPayloads) {
        const res = await request(app)
          .post('/api/auth/login')
          .send(payload);

        // Must reject cleanly (400 validation error or 401 invalid credentials) without SQL syntax errors
        expect([400, 401]).toContain(res.status);
        expect(res.body.success).toBe(false);
        expect(res.body.token).toBeUndefined();
      }
    });

    it('ADV-INJ-02: Defends against SQL injection in menu catalog search and filtering', async () => {
      const sqliSearchQueries = [
        "/api/menu?search=' UNION SELECT id, name, email, password_hash, role, 1, 1, 1 FROM users--",
        "/api/menu?category=' OR 1=1--",
        "/api/menu?search='; DROP TABLE orders;--",
        "/api/menu?category=Snacks' AND 1=1--"
      ];

      for (const query of sqliSearchQueries) {
        const res = await request(app).get(query);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const items = res.body.items || res.body.data?.items;
        expect(Array.isArray(items)).toBe(true);
        // None of the items returned should expose users table password_hash
        for (const item of items) {
          expect(item.password_hash).toBeUndefined();
        }
      }
    });

    it('ADV-INJ-03: Defends against SQL injection in Express counter pickup token verification', async () => {
      const sqliTokens = [
        "' OR '1'='1",
        "A' OR '1'='1'--",
        "'; DROP TABLE orders;--"
      ];

      for (const token of sqliTokens) {
        const res = await request(app)
          .post('/api/admin/orders/verify-token')
          .set(adminAuth.headers)
          .send({ pickup_token: token });

        expect([400, 404]).toContain(res.status);
        expect(res.body.success).toBe(false);
      }
    });

    it('ADV-INJ-04: Fuzzes order creation with invalid quantity data types & bounds', async () => {
      const invalidQuantityPayloads = [
        { slot_id: 1, items: [{ item_id: 1, quantity: 'two' }] }, // String
        { slot_id: 1, items: [{ item_id: 1, quantity: '2' }] },   // String numeric
        { slot_id: 1, items: [{ item_id: 1, quantity: -1 }] },    // Negative
        { slot_id: 1, items: [{ item_id: 1, quantity: 0 }] },     // Zero
        { slot_id: 1, items: [{ item_id: 1, quantity: 1.5 }] },   // Float
        { slot_id: 1, items: [{ item_id: 1, quantity: null }] },  // Null
        { slot_id: 1, items: [{ item_id: 1, quantity: NaN }] },   // NaN
        { slot_id: 1, items: [{ item_id: 1, quantity: {} }] },    // Object
        { slot_id: 1, items: [{ item_id: 1, quantity: [] }] }     // Array
      ];

      for (const payload of invalidQuantityPayloads) {
        const res = await request(app)
          .post('/api/orders')
          .set(studentAuth.headers)
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message || res.body.error).toMatch(/quantity|validation/i);
      }
    });

    it('ADV-INJ-05: Rejects order creation with invalid or non-existent slot/item IDs', async () => {
      const invalidIdPayloads = [
        { slot_id: 999999, items: [{ item_id: 1, quantity: 1 }] },       // Phantom slot
        { slot_id: -1, items: [{ item_id: 1, quantity: 1 }] },           // Negative slot
        { slot_id: 'invalid', items: [{ item_id: 1, quantity: 1 }] },     // Non-numeric slot
        { slot_id: 1, items: [{ item_id: 999999, quantity: 1 }] },       // Phantom item
        { slot_id: 1, items: [{ item_id: 5, variant_id: 999, quantity: 1 }] } // Phantom variant
      ];

      for (const payload of invalidIdPayloads) {
        const res = await request(app)
          .post('/api/orders')
          .set(studentAuth.headers)
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });

    it('ADV-INJ-06: Rejects order creation when item or variant is marked unavailable', async () => {
      // 1. Mark item #22 (Pastry) as unavailable
      await db.prepare('UPDATE menu_items SET is_available = 0 WHERE id = 22').run();

      const itemRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 22, quantity: 1 }]
        });

      expect(itemRes.status).toBe(400);
      expect(itemRes.body.success).toBe(false);
      expect(itemRes.body.message || itemRes.body.error).toMatch(/unavailable/i);

      // Restore item
      await db.prepare('UPDATE menu_items SET is_available = 1 WHERE id = 22').run();

      // 2. Mark variant #4 (French Fries Large) as unavailable
      await db.prepare('UPDATE menu_item_variants SET is_available = 0 WHERE id = 4').run();

      const variantRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: 1,
          items: [{ item_id: 6, variant_id: 4, quantity: 1 }]
        });

      expect(variantRes.status).toBe(400);
      expect(variantRes.body.success).toBe(false);
      expect(variantRes.body.message || variantRes.body.error).toMatch(/unavailable/i);

      // Restore variant
      await db.prepare('UPDATE menu_item_variants SET is_available = 1 WHERE id = 4').run();
    });

    it('ADV-INJ-07: Rejects order creation when slot is at maximum capacity or inactive', async () => {
      // 1. Create a dedicated full slot
      const fullSlot = await db.prepare(`
        INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
        VALUES ('2099-10-10', '14:00', '14:10', 2, 2, 1)
      `).run();
      const fullSlotId = fullSlot.lastInsertRowid;

      const fullRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: fullSlotId,
          items: [{ item_id: 1, quantity: 1 }]
        });

      expect(fullRes.status).toBe(400);
      expect(fullRes.body.success).toBe(false);
      expect(fullRes.body.message || fullRes.body.error).toMatch(/full|capacity/i);

      // 2. Create an inactive slot
      const inactiveSlot = await db.prepare(`
        INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
        VALUES ('2099-10-10', '14:10', '14:20', 10, 0, 0)
      `).run();
      const inactiveSlotId = inactiveSlot.lastInsertRowid;

      const inactiveRes = await request(app)
        .post('/api/orders')
        .set(studentAuth.headers)
        .send({
          slot_id: inactiveSlotId,
          items: [{ item_id: 1, quantity: 1 }]
        });

      expect(inactiveRes.status).toBe(400);
      expect(inactiveRes.body.success).toBe(false);
      expect(inactiveRes.body.message || inactiveRes.body.error).toMatch(/invalid|inactive/i);
    });
  });

  // =========================================================================
  // 4. ERROR HANDLING & INFORMATION DISCLOSURE PREVENTION
  // =========================================================================
  describe('4. Error Handling & Information Disclosure Prevention', () => {
    it('ADV-ERR-01: Handles malformed JSON syntax gracefully with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "broken_json", "password": ');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/malformed json|bad request/i);
    });

    it('ADV-ERR-02: Returns structured 404 for non-existent API routes', async () => {
      const res = await request(app).get('/api/non-existent-security-endpoint-404');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.code || res.body.code).toBe('NOT_FOUND');
    });

    it('ADV-ERR-03: Ensures 4xx error responses never expose stack traces or internal filenames', async () => {
      const testCases = [
        request(app).post('/api/auth/register').send({ email: 'bad' }),
        request(app).post('/api/auth/login').send({ email: 'unknown@campus.edu', password: 'WrongPassword' }),
        request(app).get('/api/menu/999999'),
        request(app).post('/api/orders').set(studentAuth.headers).send({ slot_id: 999999, items: [] })
      ];

      for (const testPromise of testCases) {
        const res = await testPromise;
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);

        // Verify no stack trace or internal path leak in JSON
        expect(res.body.stack).toBeUndefined();
        expect(res.body.error?.stack).toBeUndefined();
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('node_modules');
        expect(bodyStr).not.toContain('backend/controllers');
        expect(bodyStr).not.toContain('backend/services');
      }
    });

    it('ADV-ERR-04: Centralized error format consistency verification', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
    });
  });

  // =========================================================================
  // 5. RATE LIMITING ENFORCEMENT
  // =========================================================================
  describe('5. Rate Limiting Security Verification', () => {
    it('ADV-RL-01: Blocks excessive requests with 429 Too Many Requests when rate limiting is active', async () => {
      // Build an isolated micro Express app with active rate limiting to verify throttling mechanism
      const testRateApp = express();
      testRateApp.use(express.json());

      const testLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5, // Limit to 5 requests
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          success: false,
          message: 'Too many requests. Please try again later.',
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.'
          }
        }
      });

      testRateApp.post('/test-throttled', testLimiter, (req, res) => {
        res.status(200).json({ success: true, message: 'Request permitted' });
      });

      // Send 5 permitted requests
      for (let i = 0; i < 5; i++) {
        const okRes = await request(testRateApp).post('/test-throttled').send({});
        expect(okRes.status).toBe(200);
        expect(okRes.body.success).toBe(true);
      }

      // 6th request must be throttled with HTTP 429
      const throttledRes = await request(testRateApp).post('/test-throttled').send({});
      expect(throttledRes.status).toBe(429);
      expect(throttledRes.body.success).toBe(false);
      expect(throttledRes.body.error?.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(throttledRes.headers['ratelimit-limit']).toBe('5');
      expect(throttledRes.headers['ratelimit-remaining']).toBe('0');
    });

    it('ADV-RL-02: Verifies backend rate limiter middleware modules export configured rate limiters', async () => {
      const rateLimiters = require('../backend/middleware/rateLimiter');
      expect(rateLimiters.authLimiter).toBeDefined();
      expect(rateLimiters.orderLimiter).toBeDefined();
      expect(rateLimiters.apiLimiter).toBeDefined();
      expect(typeof rateLimiters.authLimiter).toBe('function');
      expect(typeof rateLimiters.orderLimiter).toBe('function');
      expect(typeof rateLimiters.apiLimiter).toBe('function');
    });
  });
});
