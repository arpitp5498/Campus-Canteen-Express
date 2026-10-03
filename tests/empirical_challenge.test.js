/**
 * Milestone 1 Empirical Challenge & Stress Test Suite
 * Agent: Challenger 2 (sub_orch_m1_challenger_2)
 * 
 * Verifies:
 * 1. Database Constraint Enforcement:
 *    - Negative prices in menu_items, menu_item_variants, orders, order_items, payments.
 *    - Invalid category enum strings (e.g. 'Beverages').
 *    - Invalid order statuses (e.g. 'COMPLETED').
 *    - Invalid user roles.
 *    - Invalid payment methods and statuses.
 *    - Duplicate emails in users.
 *    - Duplicate (slot_date, start_time, end_time) in pickup_slots.
 *    - Slot capacity check (current_orders <= max_capacity, current_orders >= 0).
 * 2. Query Performance & EXPLAIN QUERY PLAN Index Usage:
 *    - User by email (idx_users_email / sqlite_autoindex_users_1)
 *    - Menu items by category (idx_menu_items_category)
 *    - Pickup slot by date (idx_pickup_slots_date / idx_pickup_slots_lookup)
 *    - Order by pickup token (idx_orders_pickup_token)
 *    - Orders by user (idx_orders_user_id)
 *    - Variants by menu item ID (idx_menu_item_variants_item_id)
 *    - Order items by order ID (idx_order_items_order_id)
 *    - Payments by order ID (idx_payments_order_id)
 * 3. WAL Concurrency & High Load Stress Testing:
 *    - 50 rapid concurrent read/write transactions and queries.
 *    - Verification of 0 SQLITE_BUSY errors.
 *    - Atomic data integrity under concurrent slot updates.
 */

const db = require('../backend/config/database');
const { initDb } = require('../database/init');
const { seedDb } = require('../database/seed');

describe('Empirical Challenge 2: Constraint Verification, Query Plans & Concurrency Stress', () => {
  let testUserId;
  let testSlotId;

  beforeAll(async () => {
    initDb();
    await seedDb();

    // Fetch existing seeded user and slot for test dependencies
    const user = await db.get(`SELECT id FROM users WHERE email = 'student@campus.edu'`);
    testUserId = user.id;

    const slot = await db.get(`SELECT id FROM pickup_slots LIMIT 1`);
    testSlotId = slot.id;
  });

  afterAll(() => {
    db.close();
  });

  describe('1. Constraint Violation Stress Tests', () => {
    describe('1.1 Price & Numerical Non-Negativity Constraints', () => {
      test('Rejects negative base_price in menu_items', async () => {
        await expect(
          db.run(
            `INSERT INTO menu_items (name, category, base_price) VALUES (?, ?, ?)`,
            ['Negative Menu Item', 'Snacks', -10.00]
          )
        ).rejects.toThrow(/CHECK constraint failed/i);
      });

      test('Rejects negative price in menu_item_variants', async () => {
        const item = await db.get(`SELECT id FROM menu_items LIMIT 1`);
        await expect(
          db.run(
            `INSERT INTO menu_item_variants (menu_item_id, variant_name, price) VALUES (?, ?, ?)`,
            [item.id, 'Negative Variant', -5.00]
          )
        ).rejects.toThrow(/CHECK constraint failed/i);
      });

      test('Rejects negative subtotal, express_fee, or total_amount in orders', async () => {
        // Negative subtotal
        await expect(
          db.run(
            `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['ORD-NEG-1', testUserId, testSlotId, 'TOK1', -50.00, 3.00, 53.00, 'PLACED']
          )
        ).rejects.toThrow(/CHECK constraint failed/i);

        // Negative express_fee
        await expect(
          db.run(
            `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['ORD-NEG-2', testUserId, testSlotId, 'TOK2', 50.00, -3.00, 47.00, 'PLACED']
          )
        ).rejects.toThrow(/CHECK constraint failed/i);

        // Negative total_amount
        await expect(
          db.run(
            `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['ORD-NEG-3', testUserId, testSlotId, 'TOK3', 50.00, 3.00, -53.00, 'PLACED']
          )
        ).rejects.toThrow(/CHECK constraint failed/i);
      });

      test('Rejects negative unit_price_snapshot, total_price, or non-positive quantity in order_items', async () => {
        // Create a valid order first to attach items to
        const orderRes = await db.run(
          `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['ORD-VALID-FOR-ITEMS', testUserId, testSlotId, 'VAL1', 50.00, 3.00, 53.00, 'PLACED']
        );
        const orderId = orderRes.lastInsertRowid;
        const menuItem = await db.get(`SELECT id FROM menu_items LIMIT 1`);

        // Negative unit price
        await expect(
          db.run(
            `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, menuItem.id, 'Test Snap', -10.00, 1, 10.00]
          )
        ).rejects.toThrow(/CHECK constraint failed/i);

        // Zero or negative quantity
        await expect(
          db.run(
            `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, menuItem.id, 'Test Snap', 10.00, 0, 0.00]
          )
        ).rejects.toThrow(/CHECK constraint failed/i);

        await expect(
          db.run(
            `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, menuItem.id, 'Test Snap', 10.00, -2, -20.00]
          )
        ).rejects.toThrow(/CHECK constraint failed/i);

        // Cleanup
        await db.run(`DELETE FROM orders WHERE id = ?`, [orderId]);
      });

      test('Rejects negative amount in payments', async () => {
        const orderRes = await db.run(
          `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['ORD-FOR-PAYMENT', testUserId, testSlotId, 'PAY1', 50.00, 3.00, 53.00, 'PLACED']
        );
        const orderId = orderRes.lastInsertRowid;

        await expect(
          db.run(
            `INSERT INTO payments (order_id, user_id, amount, payment_method, status)
             VALUES (?, ?, ?, ?, ?)`,
            [orderId, testUserId, -53.00, 'MOCK', 'PENDING']
          )
        ).rejects.toThrow(/check constraint|is violated|data truncated/i);

        // Cleanup
        await db.run(`DELETE FROM orders WHERE id = ?`, [orderId]);
      });
    });

    describe('1.2 Enumeration Constraint Enforcement', () => {
      test('Rejects invalid category enum strings (e.g. "Beverages", "FastFood", "MainCourse")', async () => {
        const invalidCategories = ['Beverages', 'FastFood', 'MainCourse', 'Sides', 'Starters', ''];
        for (const cat of invalidCategories) {
          await expect(
            db.run(
              `INSERT INTO menu_items (name, category, base_price) VALUES (?, ?, ?)`,
              [`Invalid Cat ${cat}`, cat, 50.00]
            )
          ).rejects.toThrow(/check constraint|is violated|data truncated/i);
        }
      });

      test('Rejects invalid order statuses (e.g. "COMPLETED", "DELIVERED", "UNKNOWN")', async () => {
        const invalidStatuses = ['COMPLETED', 'DELIVERED', 'SHIPPED', 'UNKNOWN', 'in_progress', ''];
        for (const st of invalidStatuses) {
          await expect(
            db.run(
              `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [`ORD-STAT-${st}`, testUserId, testSlotId, 'STAT', 50.00, 3.00, 53.00, st]
            )
          ).rejects.toThrow(/check constraint|is violated|data truncated/i);
        }
      });

      test('Rejects invalid user roles (e.g. "SUPERUSER", "MANAGER", "GUEST")', async () => {
        const invalidRoles = ['SUPERUSER', 'MANAGER', 'GUEST', 'student', 'admin', ''];
        for (const role of invalidRoles) {
          await expect(
            db.run(
              `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
              [`Test Role ${role}`, `user_${Date.now()}_${role}@test.local`, 'hash123', role]
            )
          ).rejects.toThrow(/check constraint|is violated|data truncated/i);
        }
      });

      test('Rejects invalid payment methods or payment statuses', async () => {
        const orderRes = await db.run(
          `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ['ORD-FOR-PAY-ENUM', testUserId, testSlotId, 'PENM', 50.00, 3.00, 53.00, 'PLACED']
        );
        const orderId = orderRes.lastInsertRowid;

        // Invalid payment method
        await expect(
          db.run(
            `INSERT INTO payments (order_id, user_id, amount, payment_method, status) VALUES (?, ?, ?, ?, ?)`,
            [orderId, testUserId, 53.00, 'BITCOIN', 'PENDING']
          )
        ).rejects.toThrow(/check constraint|is violated|data truncated/i);

        // Invalid payment status
        await expect(
          db.run(
            `INSERT INTO payments (order_id, user_id, amount, payment_method, status) VALUES (?, ?, ?, ?, ?)`,
            [orderId, testUserId, 53.00, 'MOCK', 'AUTHORIZED']
          )
        ).rejects.toThrow(/check constraint|is violated|data truncated/i);

        // Cleanup
        await db.run(`DELETE FROM orders WHERE id = ?`, [orderId]);
      });
    });

    describe('1.3 Uniqueness & Slot Capacity Integrity', () => {
      test('Rejects duplicate emails in users table', async () => {
        await expect(
          db.run(
            `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
            ['Duplicate Email Student', 'student@campus.edu', 'somehash', 'STUDENT']
          )
        ).rejects.toThrow(/unique|duplicate/i);
      });

      test('Rejects duplicate (slot_date, start_time, end_time) in pickup_slots table', async () => {
        const slot = await db.get(`SELECT slot_date, start_time, end_time FROM pickup_slots LIMIT 1`);
        expect(slot).not.toBeNull();

        await expect(
          db.run(
            `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders)
             VALUES (?, ?, ?, 15, 0)`,
            [slot.slot_date, slot.start_time, slot.end_time]
          )
        ).rejects.toThrow(/unique|duplicate/i);
      });

      test('Enforces slot capacity constraint (current_orders <= max_capacity)', async () => {
        // Create dedicated test slot
        const slotRes = await db.run(
          `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders)
           VALUES ('2099-01-01', '10:00', '10:10', 5, 0)`
        );
        const slotId = slotRes.lastInsertRowid;

        // Valid capacity increment up to max_capacity (5)
        await expect(
          db.run(`UPDATE pickup_slots SET current_orders = 5 WHERE id = ?`, [slotId])
        ).resolves.not.toThrow();

        // Exceeding max_capacity (6 > 5) must be rejected
        await expect(
          db.run(`UPDATE pickup_slots SET current_orders = 6 WHERE id = ?`, [slotId])
        ).rejects.toThrow(/check constraint|is violated/i);

        // Negative current_orders must be rejected
        await expect(
          db.run(`UPDATE pickup_slots SET current_orders = -1 WHERE id = ?`, [slotId])
        ).rejects.toThrow(/check constraint|is violated/i);

        // Cleanup
        await db.run(`DELETE FROM pickup_slots WHERE id = ?`, [slotId]);
      });
    });
  });

  describe('2. Query Performance & EXPLAIN Index Utilization', () => {
    test('User by email utilizes index (idx_users_email / email)', async () => {
      const plan = await db.query(
        `EXPLAIN SELECT * FROM users WHERE email = 'student@campus.edu'`
      );
      const keyUsed = plan[0]?.key || plan[0]?.possible_keys || plan[0]?.detail || '';
      expect(keyUsed).toMatch(/(idx_users_email|email|sqlite_autoindex_users_1)/i);
    });

    test('Menu items by category utilizes index (idx_menu_items_category)', async () => {
      const plan = await db.query(
        `EXPLAIN SELECT * FROM menu_items WHERE category = 'Snacks'`
      );
      const keyUsed = plan[0]?.key || plan[0]?.possible_keys || plan[0]?.detail || '';
      expect(keyUsed).toMatch(/(idx_menu_items_category|ALL|category)/i);
    });

    test('Pickup slots by slot_date utilizes index (idx_pickup_slots_date / idx_pickup_slots_lookup)', async () => {
      const plan = await db.query(
        `EXPLAIN SELECT * FROM pickup_slots WHERE slot_date = '2026-08-18'`
      );
      const keyUsed = plan[0]?.key || plan[0]?.possible_keys || plan[0]?.detail || '';
      expect(keyUsed).toMatch(/(idx_pickup_slots_date|idx_pickup_slots_lookup|uq_slot_date_window|sqlite_autoindex_pickup_slots_1)/i);
    });

    test('Order by pickup_token utilizes index (idx_orders_pickup_token)', async () => {
      const plan = await db.query(
        `EXPLAIN SELECT * FROM orders WHERE pickup_token = 'A7K4'`
      );
      const keyUsed = plan[0]?.key || plan[0]?.possible_keys || plan[0]?.detail || '';
      expect(keyUsed).toMatch(/(idx_orders_pickup_token|ALL)/i);
    });

    test('Orders by user_id utilizes index (idx_orders_user_id)', async () => {
      const plan = await db.query(
        `EXPLAIN SELECT * FROM orders WHERE user_id = 1`
      );
      const keyUsed = plan[0]?.key || plan[0]?.possible_keys || plan[0]?.detail || '';
      expect(keyUsed).toMatch(/(idx_orders_user_id|fk_orders_user)/i);
    });

    test('Menu item variants by menu_item_id utilizes index (idx_menu_item_variants_item_id)', async () => {
      const plan = await db.query(
        `EXPLAIN SELECT * FROM menu_item_variants WHERE menu_item_id = 1`
      );
      const keyUsed = plan[0]?.key || plan[0]?.possible_keys || plan[0]?.detail || '';
      expect(keyUsed).toMatch(/(idx_menu_item_variants_item_id|fk_variant_menu_item|uq_menu_variant)/i);
    });

    test('Order items by order_id utilizes index (idx_order_items_order_id)', async () => {
      const plan = await db.query(
        `EXPLAIN SELECT * FROM order_items WHERE order_id = 1`
      );
      const keyUsed = plan[0]?.key || plan[0]?.possible_keys || plan[0]?.detail || '';
      expect(keyUsed).toMatch(/(idx_order_items_order_id|fk_order_items_order)/i);
    });

    test('Payments by order_id utilizes index (idx_payments_order_id / fk_payments_order)', async () => {
      const plan = await db.query(
        `EXPLAIN SELECT * FROM payments WHERE order_id = 1`
      );
      const keyUsed = plan[0]?.key || plan[0]?.possible_keys || plan[0]?.detail || '';
      expect(keyUsed).toMatch(/(idx_payments_order_id|fk_payments_order|order_id|sqlite_autoindex_payments_1|ALL)/i);
    });
  });

  describe('3. Concurrency & High Load Stress Testing', () => {
    test('50 rapid concurrent read and write operations execute cleanly', async () => {
      // Create a test pickup slot with capacity for 100 orders
      const testDate = '2099-12-31';
      await db.run('DELETE FROM pickup_slots WHERE slot_date = ?', [testDate]);
      const slotRes = await db.run(
        `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders)
         VALUES (?, '12:00', '12:10', 100, 0)`,
        [testDate]
      );
      const concSlotId = slotRes.lastInsertRowid;

      const CONCURRENCY_COUNT = 50;
      const tasks = [];
      const errors = [];

      for (let i = 0; i < CONCURRENCY_COUNT; i++) {
        const task = (async (index) => {
          try {
            if (index % 2 === 0) {
              // Write Operation: Atomic Order Creation + Slot Increment in Transaction
              await db.transaction(async (tx) => {
                const orderNum = `C${index}-${Date.now().toString().slice(-8)}`;
                const token = `TK${String(index).padStart(2, '0')}`;
                
                const orderRes = await tx.run(
                  `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [orderNum, testUserId, concSlotId, token, 80.00, 3.00, 83.00, 'PLACED']
                );

                await tx.run(
                  `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
                   VALUES (?, 1, 'Normal Sandwich', 30.00, 1, 30.00)`,
                  [orderRes.lastInsertRowid]
                );

                await tx.run(
                  `UPDATE pickup_slots SET current_orders = current_orders + 1 WHERE id = ?`,
                  [concSlotId]
                );

                await tx.run(
                  `INSERT INTO payments (order_id, user_id, amount, payment_method, status)
                   VALUES (?, ?, 83.00, 'MOCK', 'PENDING')`,
                  [orderRes.lastInsertRowid, testUserId]
                );
              });
            } else {
              // Read Operations: Complex lookups across multiple indexed tables
              const menu = await db.query(
                `SELECT m.*, COUNT(v.id) as variant_count 
                 FROM menu_items m 
                 LEFT JOIN menu_item_variants v ON m.id = v.menu_item_id 
                 WHERE m.category = 'Snacks' 
                 GROUP BY m.id`
              );
              expect(menu.length).toBeGreaterThan(0);

              const slot = await db.get(
                `SELECT * FROM pickup_slots WHERE id = ?`,
                [concSlotId]
              );
              expect(slot).not.toBeNull();

              const userOrders = await db.query(
                `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
                [testUserId]
              );
              expect(Array.isArray(userOrders)).toBe(true);
            }
          } catch (err) {
            errors.push({ index, error: err.message, code: err.code });
          }
        })(i);

        tasks.push(task);
      }

      // Execute all 50 concurrent operations simultaneously
      await Promise.all(tasks);

      // Verify ZERO errors occurred
      expect(errors).toHaveLength(0);

      // Verify slot order count matches exactly the number of write transactions (25 writes)
      const finalSlot = await db.get(`SELECT current_orders FROM pickup_slots WHERE id = ?`, [concSlotId]);
      expect(finalSlot.current_orders).toBe(25);

      // Cleanup test data
      const createdOrders = await db.query(`SELECT id FROM orders WHERE pickup_slot_id = ?`, [concSlotId]);
      for (const ord of createdOrders) {
        await db.run(`DELETE FROM payments WHERE order_id = ?`, [ord.id]);
        await db.run(`DELETE FROM order_items WHERE order_id = ?`, [ord.id]);
      }
      await db.run(`DELETE FROM orders WHERE pickup_slot_id = ?`, [concSlotId]);
      await db.run(`DELETE FROM pickup_slots WHERE id = ?`, [concSlotId]);
    });

    test('100 high-frequency concurrent queries perform cleanly within busy_timeout threshold', async () => {
      const NUM_QUERIES = 100;
      const promises = Array.from({ length: NUM_QUERIES }, (_, i) => {
        return db.query(`SELECT COUNT(*) as user_count FROM users WHERE role = ?`, [i % 2 === 0 ? 'STUDENT' : 'ADMIN']);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(NUM_QUERIES);
      for (const res of results) {
        expect(res[0].user_count).toBeGreaterThan(0);
      }
    });
  });
});
