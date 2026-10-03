/**
 * Milestone 1 Stress Harness & Empirical Verification Script
 * Agent: Challenger 2 (sub_orch_m1_challenger_2)
 * 
 * Provides empirical benchmark output, EXPLAIN QUERY PLAN details,
 * and high-concurrency race condition testing.
 */

const db = require('../backend/config/database');
const { initDb } = require('../database/init');
const { seedDb } = require('../database/seed');

async function runEmpiricalHarness() {
  console.log('===============================================================');
  console.log('🔬 STARTING EMPIRICAL CHALLENGER 2 STRESS HARNESS');
  console.log('===============================================================\n');

  // Initialize and seed database
  initDb();
  await seedDb();

  const user = await db.get(`SELECT id FROM users WHERE email = 'student@campus.edu'`);
  const slot = await db.get(`SELECT id, slot_date, start_time, end_time, max_capacity FROM pickup_slots LIMIT 1`);
  const menuItem = await db.get(`SELECT id, name FROM menu_items LIMIT 1`);

  console.log('--- 1. EMPIRICAL CONSTRAINT VIOLATION TESTS ---');

  // 1.1 Negative Price Tests
  const negativePriceTests = [
    {
      name: 'menu_items.base_price < 0',
      sql: `INSERT INTO menu_items (name, category, base_price) VALUES ('Bad Price Item', 'Snacks', -25.00)`,
      params: []
    },
    {
      name: 'menu_item_variants.price < 0',
      sql: `INSERT INTO menu_item_variants (menu_item_id, variant_name, price) VALUES (?, 'Bad Price Variant', -15.00)`,
      params: [menuItem.id]
    },
    {
      name: 'orders.total_amount < 0',
      sql: `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
            VALUES ('ORD-ERR-NEG', ?, ?, 'NEG1', 50, 3, -53, 'PLACED')`,
      params: [user.id, slot.id]
    },
    {
      name: 'payments.amount < 0',
      sql: `INSERT INTO payments (order_id, user_id, amount, payment_method, status) VALUES (99999, ?, -100, 'MOCK', 'PENDING')`,
      params: [user.id]
    }
  ];

  for (const t of negativePriceTests) {
    try {
      await db.run(t.sql, t.params);
      console.error(`❌ FAILED: ${t.name} did not throw constraint error!`);
    } catch (err) {
      console.log(`✅ PASSED: ${t.name} -> Rejected with: "${err.message}"`);
    }
  }

  // 1.2 Enum Tests
  const enumTests = [
    {
      name: 'menu_items.category = "Beverages"',
      sql: `INSERT INTO menu_items (name, category, base_price) VALUES ('Cold Tea', 'Beverages', 30.00)`,
      params: []
    },
    {
      name: 'orders.status = "COMPLETED"',
      sql: `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
            VALUES ('ORD-ERR-STAT', ?, ?, 'STAT', 50, 3, 53, 'COMPLETED')`,
      params: [user.id, slot.id]
    },
    {
      name: 'users.role = "SUPERUSER"',
      sql: `INSERT INTO users (name, email, password_hash, role) VALUES ('Super Admin', 'super@canteen.local', 'hash', 'SUPERUSER')`,
      params: []
    }
  ];

  for (const t of enumTests) {
    try {
      await db.run(t.sql, t.params);
      console.error(`❌ FAILED: ${t.name} did not throw constraint error!`);
    } catch (err) {
      console.log(`✅ PASSED: ${t.name} -> Rejected with: "${err.message}"`);
    }
  }

  // 1.3 Uniqueness & Capacity Tests
  const uniqueTests = [
    {
      name: 'Duplicate user email: "admin@canteen.local"',
      sql: `INSERT INTO users (name, email, password_hash, role) VALUES ('Clone Admin', 'admin@canteen.local', 'hash', 'ADMIN')`,
      params: []
    },
    {
      name: 'Duplicate slot window (slot_date, start_time, end_time)',
      sql: `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders) VALUES (?, ?, ?, 15, 0)`,
      params: [slot.slot_date, slot.start_time, slot.end_time]
    },
    {
      name: 'Slot capacity overflow: current_orders (16) > max_capacity (15)',
      sql: `UPDATE pickup_slots SET current_orders = 16 WHERE id = ?`,
      params: [slot.id]
    }
  ];

  for (const t of uniqueTests) {
    try {
      await db.run(t.sql, t.params);
      console.error(`❌ FAILED: ${t.name} did not throw constraint error!`);
    } catch (err) {
      console.log(`✅ PASSED: ${t.name} -> Rejected with: "${err.message}"`);
    }
  }

  console.log('\n--- 2. EXPLAIN QUERY PLAN BENCHMARK ---');
  const queryPlans = [
    {
      name: 'User Lookup by Email',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM users WHERE email = 'student@campus.edu'`
    },
    {
      name: 'Menu Items by Category',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM menu_items WHERE category = 'Drinks'`
    },
    {
      name: 'Pickup Slots by Date & Active',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM pickup_slots WHERE slot_date = '2026-08-18' AND is_active = 1`
    },
    {
      name: 'Order Lookup by Pickup Token',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM orders WHERE pickup_token = 'A7K4'`
    },
    {
      name: 'Orders by User ID',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM orders WHERE user_id = 1`
    },
    {
      name: 'Variants by Menu Item ID',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM menu_item_variants WHERE menu_item_id = 1`
    },
    {
      name: 'Order Items by Order ID',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM order_items WHERE order_id = 1`
    },
    {
      name: 'Payments by Order ID',
      sql: `EXPLAIN QUERY PLAN SELECT * FROM payments WHERE order_id = 1`
    }
  ];

  for (const q of queryPlans) {
    const plan = await db.query(q.sql);
    console.log(`Query: ${q.name}`);
    plan.forEach((p) => {
      console.log(`  └─ [id: ${p.id}, parent: ${p.parent}] ${p.detail}`);
    });
  }

  console.log('\n--- 3. 50 CONCURRENT MIXED TRANSACTIONS / QUERIES STRESS TEST ---');
  const stressSlotRes = await db.run(
    `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders)
     VALUES ('2099-11-11', '13:00', '13:10', 100, 0)`
  );
  const stressSlotId = stressSlotRes.lastInsertRowid;

  const NUM_CONCURRENT = 50;
  const startTime = Date.now();
  let completedCount = 0;
  let busyErrorCount = 0;
  let otherErrorCount = 0;

  const tasks = Array.from({ length: NUM_CONCURRENT }, async (_, i) => {
    try {
      if (i % 2 === 0) {
        // Write transaction
        await db.transaction((tx) => {
          const ord = tx.run(
            `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, subtotal, express_fee, total_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PLACED')`,
            [`ORD-STRESS-${i}-${Date.now()}`, user.id, stressSlotId, `TK${i}`, 60.00, 3.00, 63.00]
          );
          tx.run(
            `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
             VALUES (?, ?, 'French Fries', 60.00, 1, 60.00)`,
            [ord.lastInsertRowid, menuItem.id]
          );
          tx.run(
            `UPDATE pickup_slots SET current_orders = current_orders + 1 WHERE id = ?`,
            [stressSlotId]
          );
        });
      } else {
        // Read queries
        await db.query(`SELECT * FROM menu_items WHERE category = 'Snacks'`);
        await db.get(`SELECT current_orders, max_capacity FROM pickup_slots WHERE id = ?`, [stressSlotId]);
        await db.query(`SELECT * FROM orders WHERE pickup_slot_id = ?`, [stressSlotId]);
      }
      completedCount++;
    } catch (err) {
      if (err.message && err.message.includes('SQLITE_BUSY')) {
        busyErrorCount++;
      } else {
        otherErrorCount++;
      }
      console.error(`Concurrent Task ${i} Error:`, err.message);
    }
  });

  await Promise.all(tasks);
  const totalDuration = Date.now() - startTime;

  console.log(`Total Concurrent Operations: ${NUM_CONCURRENT}`);
  console.log(`Successfully Completed: ${completedCount}/${NUM_CONCURRENT}`);
  console.log(`SQLITE_BUSY Errors: ${busyErrorCount}`);
  console.log(`Other Errors: ${otherErrorCount}`);
  console.log(`Execution Time: ${totalDuration} ms (~${(totalDuration / NUM_CONCURRENT).toFixed(2)} ms/op)`);

  const verifiedSlot = await db.get(`SELECT current_orders FROM pickup_slots WHERE id = ?`, [stressSlotId]);
  console.log(`Final Verified Slot Order Count: ${verifiedSlot.current_orders} (Expected: ${NUM_CONCURRENT / 2})`);

  // Cleanup
  const cleanupOrders = await db.query(`SELECT id FROM orders WHERE pickup_slot_id = ?`, [stressSlotId]);
  for (const o of cleanupOrders) {
    await db.run(`DELETE FROM order_items WHERE order_id = ?`, [o.id]);
  }
  await db.run(`DELETE FROM orders WHERE pickup_slot_id = ?`, [stressSlotId]);
  await db.run(`DELETE FROM pickup_slots WHERE id = ?`, [stressSlotId]);

  console.log('\n===============================================================');
  console.log('✅ EMPIRICAL STRESS HARNESS COMPLETED SUCCESSFULLY');
  console.log('===============================================================');

  db.close();
}

runEmpiricalHarness().catch((err) => {
  console.error('Fatal Harness Error:', err);
  process.exit(1);
});
