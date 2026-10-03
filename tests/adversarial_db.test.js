/**
 * Campus Canteen Express - Empirical Adversarial Database Test Suite
 * Challenger 1 - Milestone 1 Verification
 */

const bcrypt = require('bcryptjs');
const db = require('../backend/config/database');
const { initDb } = require('../database/init');
const { seedDb, MENU_ITEMS, USERS, TIME_WINDOWS } = require('../database/seed');

describe('Adversarial Empirical Challenge - Milestone 1 Database', () => {
  beforeAll(async () => {
    await initDb();
    await seedDb();
  });

  beforeEach(async () => {
    await seedDb();
  });

  afterAll(() => {
    db.close();
  });

  // ==========================================================================
  // 1. TRANSACTION ATOMICITY & ROLLBACK VERIFICATION
  // ==========================================================================
  describe('1. Transaction Atomicity & Orphan Record Prevention', () => {
    test('Simulated exception mid-transaction rolls back all writes without leaving orphan records', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id, current_orders FROM pickup_slots LIMIT 1');
      const menuItem = await db.get('SELECT id, base_price, name FROM menu_items LIMIT 1');
      const initialSlotOrders = slot.current_orders;

      const orderNumber = 'TX-ABORT-001';
      const token = 'AB01';

      // Execute transaction that fails at the final step
      await expect(
        db.transaction(async (tx) => {
          // Step 1: Create Order
          const orderRes = await tx.run(
            `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
             VALUES (?, ?, ?, ?, ?, 3.00, ?, 'PLACED')`,
            [orderNumber, user.id, slot.id, token, menuItem.base_price, menuItem.base_price + 3.00]
          );
          const orderId = orderRes.lastInsertRowid;

          // Step 2: Create Order Item
          await tx.run(
            `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
             VALUES (?, ?, ?, ?, 1, ?)`,
            [orderId, menuItem.id, menuItem.name, menuItem.base_price, menuItem.base_price]
          );

          // Step 3: Increment Slot Capacity
          await tx.run(
            `UPDATE pickup_slots SET current_orders = current_orders + 1 WHERE id = ?`,
            [slot.id]
          );

          // Step 4: Create Payment
          await tx.run(
            `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, status)
             VALUES (?, ?, ?, 'INR', 'MOCK', 'SUCCESS')`,
            [orderId, user.id, menuItem.base_price + 3.00]
          );

          // Step 5: Intentional Fatal Exception
          throw new Error('CRITICAL_SIMULATED_FAILURE_MID_TRANSACTION');
        })
      ).rejects.toThrow('CRITICAL_SIMULATED_FAILURE_MID_TRANSACTION');

      // Verify ZERO orphan records exist in database
      const orphanOrder = await db.get('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
      expect(orphanOrder).toBeNull();

      const orphanItems = await db.query(
        'SELECT * FROM order_items WHERE item_name_snapshot = ?',
        [menuItem.name + '_SHOULD_NOT_EXIST']
      );
      expect(orphanItems).toHaveLength(0);

      const allItemsForToken = await db.query(
        'SELECT oi.* FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.pickup_token = ?',
        [token]
      );
      expect(allItemsForToken).toHaveLength(0);

      const orphanPayment = await db.get(
        'SELECT * FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number = ?)',
        [orderNumber]
      );
      expect(orphanPayment).toBeNull();

      // Verify slot count did not increment
      const updatedSlot = await db.get('SELECT current_orders FROM pickup_slots WHERE id = ?', [slot.id]);
      expect(updatedSlot.current_orders).toBe(initialSlotOrders);
    });

    test('SQL Constraint violation inside transaction triggers complete rollback', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');
      const orderNumber = 'TX-FAIL-SQL-001';

      await expect(
        db.transaction(async (tx) => {
          await tx.run(
            `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
             VALUES (?, ?, ?, 'TX01', 100.00, 3.00, 103.00, 'PLACED')`,
            [orderNumber, user.id, slot.id]
          );

          // Violate CHECK constraint on orders or subtotal
          await tx.run(
            `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
             VALUES (?, ?, ?, 'TX02', -50.00, 3.00, -47.00, 'INVALID_STATUS')`,
            [orderNumber + '_2', user.id, slot.id]
          );
        })
      ).rejects.toThrow();

      // Ensure first statement was also rolled back
      const firstOrder = await db.get('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
      expect(firstOrder).toBeNull();
    });
  });

  // ==========================================================================
  // 2. FOREIGN KEY ENFORCEMENT ON ALL RELATIONSHIPS
  // ==========================================================================
  describe('2. Foreign Key Enforcement on All Relational Tables', () => {
    test('Reject invalid foreign key on orders.user_id', async () => {
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');
      await expect(
        db.run(
          `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
           VALUES ('FK-ORD-1', 999999, ?, 'TK01', 50.00, 3.00, 53.00, 'PLACED')`,
          [slot.id]
        )
      ).rejects.toThrow(/foreign key/i);
    });

    test('Reject invalid foreign key on orders.pickup_slot_id', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      await expect(
        db.run(
          `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
           VALUES ('FK-ORD-2', ?, 999999, 'TK02', 50.00, 3.00, 53.00, 'PLACED')`,
          [user.id]
        )
      ).rejects.toThrow(/foreign key/i);
    });

    test('Reject invalid foreign key on order_items.order_id', async () => {
      const item = await db.get('SELECT id FROM menu_items LIMIT 1');
      await expect(
        db.run(
          `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
           VALUES (999999, ?, 'Ghost Item', 50.00, 1, 50.00)`,
          [item.id]
        )
      ).rejects.toThrow(/foreign key/i);
    });

    test('Reject invalid foreign key on order_items.menu_item_id', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');
      const ordRes = await db.run(
        `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
         VALUES ('FK-ORD-3', ?, ?, 'TK03', 50.00, 3.00, 53.00, 'PLACED')`,
        [user.id, slot.id]
      );
      const validOrderId = ordRes.lastInsertRowid;

      await expect(
        db.run(
          `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
           VALUES (?, 999999, 'Ghost Menu Item', 50.00, 1, 50.00)`,
          [validOrderId]
        )
      ).rejects.toThrow(/foreign key/i);

      // Cleanup
      await db.run('DELETE FROM orders WHERE id = ?', [validOrderId]);
    });

    test('Reject invalid foreign key on order_items.variant_id', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');
      const item = await db.get('SELECT id FROM menu_items LIMIT 1');
      const ordRes = await db.run(
        `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
         VALUES ('FK-ORD-4', ?, ?, 'TK04', 50.00, 3.00, 53.00, 'PLACED')`,
        [user.id, slot.id]
      );
      const validOrderId = ordRes.lastInsertRowid;

      await expect(
        db.run(
          `INSERT INTO order_items (order_id, menu_item_id, variant_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
           VALUES (?, ?, 999999, 'Ghost Variant Item', 50.00, 1, 50.00)`,
          [validOrderId, item.id]
        )
      ).rejects.toThrow(/foreign key/i);

      // Cleanup
      await db.run('DELETE FROM orders WHERE id = ?', [validOrderId]);
    });

    test('Reject invalid foreign key on payments.order_id', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      await expect(
        db.run(
          `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, status)
           VALUES (999999, ?, 53.00, 'INR', 'MOCK', 'PENDING')`,
          [user.id]
        )
      ).rejects.toThrow(/foreign key/i);
    });

    test('Reject invalid foreign key on payments.user_id', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');
      const ordRes = await db.run(
        `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
         VALUES ('FK-ORD-5', ?, ?, 'TK05', 50.00, 3.00, 53.00, 'PLACED')`,
        [user.id, slot.id]
      );
      const validOrderId = ordRes.lastInsertRowid;

      await expect(
        db.run(
          `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, status)
           VALUES (?, 999999, 53.00, 'INR', 'MOCK', 'PENDING')`,
          [validOrderId]
        )
      ).rejects.toThrow(/foreign key/i);

      // Cleanup
      await db.run('DELETE FROM orders WHERE id = ?', [validOrderId]);
    });

    test('Reject invalid foreign key on menu_item_variants.menu_item_id', async () => {
      await expect(
        db.run(
          `INSERT INTO menu_item_variants (menu_item_id, variant_name, price)
           VALUES (999999, 'Orphan Variant', 100.00)`
        )
      ).rejects.toThrow(/foreign key/i);
    });
  });

  // ==========================================================================
  // 3. CASCADE DELETION & SET NULL BEHAVIOR
  // ==========================================================================
  describe('3. Cascade Deletion & Variant Set-Null Behavior', () => {
    test('Deleting a menu item cascades to delete its variants', async () => {
      const itemRes = await db.run(
        `INSERT INTO menu_items (name, category, base_price) VALUES ('Cascade Test Item', 'Snacks', 40.00)`
      );
      const itemId = itemRes.lastInsertRowid;

      const var1 = await db.run(
        `INSERT INTO menu_item_variants (menu_item_id, variant_name, price) VALUES (?, 'Small', 40.00)`,
        [itemId]
      );
      const var2 = await db.run(
        `INSERT INTO menu_item_variants (menu_item_id, variant_name, price) VALUES (?, 'Large', 80.00)`,
        [itemId]
      );

      expect(var1.lastInsertRowid).toBeGreaterThan(0);
      expect(var2.lastInsertRowid).toBeGreaterThan(0);

      // Delete parent menu item
      await db.run(`DELETE FROM menu_items WHERE id = ?`, [itemId]);

      // Assert variants were deleted by CASCADE
      const remainingVars = await db.query(`SELECT * FROM menu_item_variants WHERE menu_item_id = ?`, [itemId]);
      expect(remainingVars).toHaveLength(0);
    });

    test('Deleting an order cascades to delete all its order_items', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');
      const item = await db.get('SELECT id, name, base_price FROM menu_items LIMIT 1');

      const ordRes = await db.run(
        `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
         VALUES ('CAS-ORD-1', ?, ?, 'CA01', 60.00, 3.00, 63.00, 'PLACED')`,
        [user.id, slot.id]
      );
      const orderId = ordRes.lastInsertRowid;

      await db.run(
        `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
         VALUES (?, ?, ?, ?, 2, ?)`,
        [orderId, item.id, item.name, item.base_price, item.base_price * 2]
      );

      const itemsBefore = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
      expect(itemsBefore).toHaveLength(1);

      // Delete order
      await db.run('DELETE FROM orders WHERE id = ?', [orderId]);

      // Assert order_items were cascade deleted
      const itemsAfter = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
      expect(itemsAfter).toHaveLength(0);
    });

    test('Deleting a variant sets variant_id to NULL in order_items without deleting order_item', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');

      // Create isolated menu item and variant
      const itemRes = await db.run(
        `INSERT INTO menu_items (name, category, base_price) VALUES ('Variant Null Test Item', 'Snacks', 50.00)`
      );
      const itemId = itemRes.lastInsertRowid;

      const varRes = await db.run(
        `INSERT INTO menu_item_variants (menu_item_id, variant_name, price) VALUES (?, 'Special Size', 75.00)`,
        [itemId]
      );
      const variantId = varRes.lastInsertRowid;

      const ordRes = await db.run(
        `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
         VALUES ('VAR-NULL-ORD', ?, ?, 'VN01', 75.00, 3.00, 78.00, 'PLACED')`,
        [user.id, slot.id]
      );
      const orderId = ordRes.lastInsertRowid;

      const oiRes = await db.run(
        `INSERT INTO order_items (order_id, menu_item_id, variant_id, item_name_snapshot, variant_name_snapshot, unit_price_snapshot, quantity, total_price)
         VALUES (?, ?, ?, 'Variant Null Test Item', 'Special Size', 75.00, 1, 75.00)`,
        [orderId, itemId, variantId]
      );
      const orderItemId = oiRes.lastInsertRowid;

      // Delete the variant
      await db.run(`DELETE FROM menu_item_variants WHERE id = ?`, [variantId]);

      // Check order_item: should still exist, with variant_id = NULL and variant_name_snapshot preserved!
      const oiAfter = await db.get(`SELECT * FROM order_items WHERE id = ?`, [orderItemId]);
      expect(oiAfter).not.toBeNull();
      expect(oiAfter.variant_id).toBeNull();
      expect(oiAfter.variant_name_snapshot).toBe('Special Size');
      expect(oiAfter.item_name_snapshot).toBe('Variant Null Test Item');

      // Cleanup
      await db.run(`DELETE FROM orders WHERE id = ?`, [orderId]);
      await db.run(`DELETE FROM menu_items WHERE id = ?`, [itemId]);
    });
  });

  // ==========================================================================
  // 4. RESTRICT CONSTRAINTS ON ACTIVE REFERENCED ENTITIES
  // ==========================================================================
  describe('4. Restriction Enforcement (ON DELETE RESTRICT)', () => {
    let testUserId, testSlotId, testItemId, testOrderId, testPaymentId;

    beforeAll(async () => {
      const uRes = await db.run(
        `INSERT INTO users (name, email, password_hash, role) VALUES ('Restrict User', 'restrict@test.local', 'hash', 'STUDENT')`
      );
      testUserId = uRes.lastInsertRowid;

      const sRes = await db.run(
        `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
         VALUES ('2099-01-01', '10:00', '10:10', 10, 1, 1)`
      );
      testSlotId = sRes.lastInsertRowid;

      const mRes = await db.run(
        `INSERT INTO menu_items (name, category, base_price) VALUES ('Restrict Menu Item', 'Snacks', 60.00)`
      );
      testItemId = mRes.lastInsertRowid;

      const oRes = await db.run(
        `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
         VALUES ('RESTRICT-ORD-1', ?, ?, 'RS01', 60.00, 3.00, 63.00, 'PLACED')`,
        [testUserId, testSlotId]
      );
      testOrderId = oRes.lastInsertRowid;

      await db.run(
        `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
         VALUES (?, ?, 'Restrict Menu Item', 60.00, 1, 60.00)`,
        [testOrderId, testItemId]
      );

      const pRes = await db.run(
        `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, status)
         VALUES (?, ?, 63.00, 'INR', 'MOCK', 'SUCCESS')`,
        [testOrderId, testUserId]
      );
      testPaymentId = pRes.lastInsertRowid;
    });

    afterAll(async () => {
      // Clean up in reverse dependency order
      await db.run('DELETE FROM payments WHERE id = ?', [testPaymentId]);
      await db.run('DELETE FROM orders WHERE id = ?', [testOrderId]);
      await db.run('DELETE FROM menu_items WHERE id = ?', [testItemId]);
      await db.run('DELETE FROM pickup_slots WHERE id = ?', [testSlotId]);
      await db.run('DELETE FROM users WHERE id = ?', [testUserId]);
    });

    test('Deleting a user referenced by an active order or payment is RESTRICTED', async () => {
      await expect(db.run(`DELETE FROM users WHERE id = ?`, [testUserId]))
        .rejects.toThrow(/foreign key/i);
    });

    test('Deleting a menu item referenced by an order_item is RESTRICTED', async () => {
      await expect(db.run(`DELETE FROM menu_items WHERE id = ?`, [testItemId]))
        .rejects.toThrow(/foreign key/i);
    });

    test('Deleting a pickup slot referenced by an order is RESTRICTED', async () => {
      await expect(db.run(`DELETE FROM pickup_slots WHERE id = ?`, [testSlotId]))
        .rejects.toThrow(/foreign key/i);
    });

    test('Deleting an order referenced by a payment is RESTRICTED', async () => {
      await expect(db.run(`DELETE FROM orders WHERE id = ?`, [testOrderId]))
        .rejects.toThrow(/foreign key/i);
    });
  });

  // ==========================================================================
  // 5. CHECK CONSTRAINTS, UNIQUENESS & EDGE CASES
  // ==========================================================================
  describe('5. Table-Level Check Constraints & Edge Cases', () => {
    test('Pickup slot rejects current_orders > max_capacity (chk_slot_capacity)', async () => {
      const slot = await db.run(
        `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
         VALUES ('2099-01-02', '11:00', '11:10', 5, 0, 1)`
      );
      const slotId = slot.lastInsertRowid;

      // Setting current_orders = 5 should succeed (boundary)
      await expect(
        db.run('UPDATE pickup_slots SET current_orders = 5 WHERE id = ?', [slotId])
      ).resolves.toBeDefined();

      // Setting current_orders = 6 must fail CHECK constraint
      await expect(
        db.run('UPDATE pickup_slots SET current_orders = 6 WHERE id = ?', [slotId])
      ).rejects.toThrow(/check constraint|is violated/i);

      // Cleanup
      await db.run('DELETE FROM pickup_slots WHERE id = ?', [slotId]);
    });

    test('Pickup slot rejects duplicate time window on same date (uq_slot_date_window)', async () => {
      await db.run(
        `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders)
         VALUES ('2099-02-01', '12:00', '12:10', 10, 0)`
      );

      await expect(
        db.run(
          `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders)
           VALUES ('2099-02-01', '12:00', '12:10', 15, 0)`
        )
      ).rejects.toThrow(/unique|duplicate/i);

      await db.run(`DELETE FROM pickup_slots WHERE slot_date = '2099-02-01'`);
    });

    test('User table rejects invalid roles', async () => {
      await expect(
        db.run(
          `INSERT INTO users (name, email, password_hash, role) VALUES ('Bad Role', 'badrole@test.local', 'h', 'SUPERUSER')`
        )
      ).rejects.toThrow(/check constraint|is violated|data truncated/i);
    });

    test('Menu items table rejects invalid category', async () => {
      await expect(
        db.run(
          `INSERT INTO menu_items (name, category, base_price) VALUES ('Invalid Cat', 'Beverages', 25.00)`
        )
      ).rejects.toThrow(/check constraint|is violated|data truncated/i);
    });

    test('Menu items table rejects negative base_price', async () => {
      await expect(
        db.run(
          `INSERT INTO menu_items (name, category, base_price) VALUES ('Negative Price', 'Snacks', -10.00)`
        )
      ).rejects.toThrow(/check constraint|is violated/i);
    });

    test('Orders table rejects negative subtotal or express_fee', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');

      await expect(
        db.run(
          `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
           VALUES ('NEG-ORD-1', ?, ?, 'NG01', -10.00, 3.00, -7.00, 'PLACED')`,
          [user.id, slot.id]
        )
      ).rejects.toThrow(/check constraint|is violated/i);
    });

    test('Order items table rejects quantity <= 0', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');
      const item = await db.get('SELECT id, name, base_price FROM menu_items LIMIT 1');

      const ordRes = await db.run(
        `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
         VALUES ('QTY-ORD-1', ?, ?, 'QT01', 30.00, 3.00, 33.00, 'PLACED')`,
        [user.id, slot.id]
      );
      const orderId = ordRes.lastInsertRowid;

      await expect(
        db.run(
          `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
           VALUES (?, ?, ?, ?, 0, 0)`,
          [orderId, item.id, item.name, item.base_price]
        )
      ).rejects.toThrow(/check constraint|is violated/i);

      await db.run('DELETE FROM orders WHERE id = ?', [orderId]);
    });

    test('Payments table rejects duplicate payment for the same order (UNIQUE order_id)', async () => {
      const user = await db.get('SELECT id FROM users LIMIT 1');
      const slot = await db.get('SELECT id FROM pickup_slots LIMIT 1');

      await db.run('DELETE FROM orders WHERE order_number = ?', ['DUP-PAY-ORD']);

      const ordRes = await db.run(
        `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
         VALUES ('DUP-PAY-ORD', ?, ?, 'DP01', 40.00, 3.00, 43.00, 'PLACED')`,
        [user.id, slot.id]
      );
      const orderId = ordRes.lastInsertRowid;

      // First payment
      await db.run(
        `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, status)
         VALUES (?, ?, 43.00, 'INR', 'MOCK', 'SUCCESS')`,
        [orderId, user.id]
      );

      // Attempt second payment for the same order
      await expect(
        db.run(
          `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, status)
           VALUES (?, ?, 43.00, 'INR', 'MOCK', 'SUCCESS')`,
          [orderId, user.id]
        )
      ).rejects.toThrow(/unique|duplicate/i);

      // Cleanup
      await db.run('DELETE FROM payments WHERE order_id = ?', [orderId]);
      await db.run('DELETE FROM orders WHERE id = ?', [orderId]);
    });
  });
});

