/**
 * Campus Canteen Express - Database Schema, Connection & Seed Test Suite
 * MySQL Verification
 */

const bcrypt = require('bcryptjs');
const db = require('../backend/config/database');
const { initDb } = require('../database/init');
const { seedDb, MENU_ITEMS, USERS, TIME_WINDOWS } = require('../database/seed');

describe('Milestone 1 - Database Architecture, Schema & Seed Verification', () => {
  beforeAll(async () => {
    // Run schema init and seeding
    await initDb();
    await seedDb();
  });

  afterAll(async () => {
    // Keep pool open for Jest lifecycle or close at teardown
  });

  describe('1. MySQL Connection & Configuration', () => {
    test('db.ping() returns true', async () => {
      const isAlive = await db.ping();
      expect(isAlive).toBe(true);
    });

    test('MySQL database is accessible', async () => {
      const row = await db.get('SELECT DATABASE() as current_db');
      expect(row.current_db).toBe('campus_canteen');
    });
  });

  describe('2. Schema Architecture & 7 Normalized Tables', () => {
    const expectedTables = [
      'users',
      'menu_items',
      'menu_item_variants',
      'pickup_slots',
      'orders',
      'order_items',
      'payments'
    ];

    test.each(expectedTables)('Table "%s" exists in information_schema', async (tableName) => {
      const row = await db.get(
        `SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
      );
      expect(row).not.toBeNull();
      expect(row.name).toBe(tableName);
    });

    test('Performance indexes exist across all tables', async () => {
      const indexes = await db.query(
        `SELECT INDEX_NAME as name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME LIKE 'idx_%'`
      );
      const indexNames = indexes.map((i) => i.name);
      
      const requiredIndexes = [
        'idx_users_email',
        'idx_users_role',
        'idx_menu_items_category',
        'idx_menu_items_available',
        'idx_menu_item_variants_item_id',
        'idx_pickup_slots_date',
        'idx_pickup_slots_active',
        'idx_pickup_slots_lookup',
        'idx_orders_user_id',
        'idx_orders_pickup_slot_id',
        'idx_orders_pickup_token',
        'idx_orders_status',
        'idx_orders_created_at',
        'idx_order_items_order_id',
        'idx_order_items_menu_item_id',
        'idx_payments_order_id',
        'idx_payments_razorpay_order',
        'idx_payments_status'
      ];

      for (const idx of requiredIndexes) {
        expect(indexNames).toContain(idx);
      }
    });
  });

  describe('3. Seed Catalog Integrity (Exact 23 Menu Items)', () => {
    test('Exactly 23 menu items are present in database', async () => {
      const countRow = await db.get('SELECT COUNT(*) as count FROM menu_items');
      expect(Number(countRow.count)).toBe(23);
    });

    test('All 6 categories are populated with expected counts', async () => {
      const rows = await db.query(
        'SELECT category, COUNT(*) as count FROM menu_items GROUP BY category'
      );
      const catMap = Object.fromEntries(rows.map((r) => [r.category, Number(r.count)]));

      expect(catMap['Sandwiches']).toBe(3);
      expect(catMap['Snacks']).toBe(9);
      expect(catMap['Meals']).toBe(2);
      expect(catMap['Rolls']).toBe(3);
      expect(catMap['Drinks']).toBe(4);
      expect(catMap['Desserts']).toBe(2);
    });

    test('All confirmed menu items have exact confirmed base prices and prep times', async () => {
      const items = await db.query('SELECT name, base_price, prep_time_minutes, image_url FROM menu_items');
      const itemMap = Object.fromEntries(items.map((i) => [i.name, i]));

      expect(Number(itemMap['Normal Sandwich'].base_price)).toBe(30.00);
      expect(Number(itemMap['Grilled/Chilli Sandwich'].base_price)).toBe(50.00);
      expect(Number(itemMap['Cheese Grilled Sandwich'].base_price)).toBe(80.00);
      expect(Number(itemMap['Spring Roll'].base_price)).toBe(50.00);
      expect(Number(itemMap['Chilli Potato'].base_price)).toBe(70.00);
      expect(Number(itemMap['French Fries'].base_price)).toBe(60.00);
      expect(Number(itemMap['Cheese Maggi'].base_price)).toBe(80.00);
      expect(Number(itemMap['Maggi'].base_price)).toBe(50.00);
      expect(Number(itemMap['Burger'].base_price)).toBe(40.00);
      expect(Number(itemMap['Patty'].base_price)).toBe(30.00);
      expect(Number(itemMap['Tea'].base_price)).toBe(15.00);
      expect(Number(itemMap['Coffee'].base_price)).toBe(30.00);
      expect(Number(itemMap['Noodles'].base_price)).toBe(70.00);
      expect(Number(itemMap['Aloo Paratha'].base_price)).toBe(40.00);
      expect(Number(itemMap['Thali'].base_price)).toBe(100.00);
      expect(Number(itemMap['Cheese Paneer Roll'].base_price)).toBe(70.00);
      expect(Number(itemMap['Pasta Roll'].base_price)).toBe(70.00);
      expect(Number(itemMap['Mini Pizza'].base_price)).toBe(50.00);
      expect(Number(itemMap['Cheese Medium Pizza'].base_price)).toBe(120.00);
      expect(Number(itemMap['Cold Coffee'].base_price)).toBe(50.00);
      expect(Number(itemMap['Shikanji'].base_price)).toBe(50.00);
      expect(Number(itemMap['Pastry'].base_price)).toBe(40.00);
      expect(Number(itemMap['Magnum Ice Cream'].base_price)).toBe(70.00);

      for (const name in itemMap) {
        expect(Number(itemMap[name].prep_time_minutes)).toBeGreaterThan(0);
        expect(itemMap[name].image_url).toMatch(/^\/images\/food\/.+\.jpg$/);
      }
    });

    test('Exactly 8 variants are seeded across the 4 multi-size items', async () => {
      const variants = await db.query(
        `SELECT m.name, v.variant_name, v.price 
         FROM menu_item_variants v 
         JOIN menu_items m ON v.menu_item_id = m.id 
         ORDER BY m.name, v.price`
      );

      expect(variants.length).toBe(8);

      const chilliPotato = variants.filter((v) => v.name === 'Chilli Potato');
      expect(chilliPotato).toHaveLength(2);
      expect(chilliPotato.map(v => ({ name: v.name, variant_name: v.variant_name, price: Number(v.price) }))).toEqual([
        { name: 'Chilli Potato', variant_name: 'Half', price: 70.00 },
        { name: 'Chilli Potato', variant_name: 'Full', price: 120.00 }
      ]);

      const fries = variants.filter((v) => v.name === 'French Fries');
      expect(fries).toHaveLength(2);
      expect(fries.map(v => ({ name: v.name, variant_name: v.variant_name, price: Number(v.price) }))).toEqual([
        { name: 'French Fries', variant_name: 'Regular', price: 60.00 },
        { name: 'French Fries', variant_name: 'Large', price: 120.00 }
      ]);

      const patty = variants.filter((v) => v.name === 'Patty');
      expect(patty).toHaveLength(2);
      expect(patty.map(v => ({ name: v.name, variant_name: v.variant_name, price: Number(v.price) }))).toEqual([
        { name: 'Patty', variant_name: 'Normal', price: 30.00 },
        { name: 'Patty', variant_name: 'Cheese', price: 40.00 }
      ]);

      const noodles = variants.filter((v) => v.name === 'Noodles');
      expect(noodles).toHaveLength(2);
      expect(noodles.map(v => ({ name: v.name, variant_name: v.variant_name, price: Number(v.price) }))).toEqual([
        { name: 'Noodles', variant_name: 'Half', price: 70.00 },
        { name: 'Noodles', variant_name: 'Full', price: 120.00 }
      ]);
    });
  });

  describe('4. Demo & Test User Accounts', () => {
    test('Default admin and student accounts are seeded with valid bcrypt hashes', async () => {
      const users = await db.query('SELECT name, email, password_hash, role FROM users');
      expect(users.length).toBeGreaterThanOrEqual(4);

      const userMap = Object.fromEntries(users.map((u) => [u.email, u]));

      // Admin 1
      expect(userMap['admin@canteen.local']).toBeDefined();
      expect(userMap['admin@canteen.local'].role).toBe('ADMIN');
      expect(bcrypt.compareSync('Admin@123', userMap['admin@canteen.local'].password_hash)).toBe(true);

      // Admin 2
      expect(userMap['admin@campus.edu']).toBeDefined();
      expect(userMap['admin@campus.edu'].role).toBe('ADMIN');
      expect(bcrypt.compareSync('Admin@12345', userMap['admin@campus.edu'].password_hash)).toBe(true);

      // Student 1
      expect(userMap['student@campus.edu']).toBeDefined();
      expect(userMap['student@campus.edu'].role).toBe('STUDENT');
      expect(bcrypt.compareSync('Student@12345', userMap['student@campus.edu'].password_hash)).toBe(true);

      // Student 2
      expect(userMap['student@canteen.local']).toBeDefined();
      expect(userMap['student@canteen.local'].role).toBe('STUDENT');
      expect(bcrypt.compareSync('Student@123', userMap['student@canteen.local'].password_hash)).toBe(true);
    });
  });

  describe('5. Pickup Slots', () => {
    test('6 slots for today and 6 slots for tomorrow are created with capacity 15', async () => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const slots = await db.query(
        'SELECT slot_date, start_time, end_time, max_capacity, current_orders FROM pickup_slots WHERE slot_date IN (?, ?)',
        [today, tomorrow]
      );
      expect(slots.length).toBe(12);

      const dates = [...new Set(slots.map((s) => s.slot_date instanceof Date ? s.slot_date.toISOString().split('T')[0] : String(s.slot_date)))];
      expect(dates.length).toBe(2);

      for (const s of slots) {
        expect(Number(s.max_capacity)).toBe(15);
        expect(Number(s.current_orders)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('6. Referential Integrity & Foreign Key Enforcement', () => {
    test('Inserting order_items with non-existent order_id fails FK constraint', async () => {
      await expect(
        db.run(
          `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, total_price)
           VALUES (999999, 1, 'Test', 10, 1, 10)`
        )
      ).rejects.toThrow();
    });

    test('Deleting a menu item cascades deletion to its variants', async () => {
      const res = await db.run(
        `INSERT INTO menu_items (name, category, base_price) VALUES ('Temp Cascading Item', 'Snacks', 45)`
      );
      const tempItemId = res.lastInsertRowid;

      await db.run(
        `INSERT INTO menu_item_variants (menu_item_id, variant_name, price) VALUES (?, 'Temp Variant', 55)`,
        [tempItemId]
      );

      const varBefore = await db.get(
        `SELECT id FROM menu_item_variants WHERE menu_item_id = ?`,
        [tempItemId]
      );
      expect(varBefore).not.toBeNull();

      // Delete parent
      await db.run(`DELETE FROM menu_items WHERE id = ?`, [tempItemId]);

      const varAfter = await db.get(
        `SELECT id FROM menu_item_variants WHERE menu_item_id = ?`,
        [tempItemId]
      );
      expect(varAfter).toBeNull();
    });
  });

  describe('7. Transaction Support & Atomic Rollback', () => {
    test('Transaction successfully commits all statements when no error occurs', async () => {
      const email = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@test.local`;
      const result = await db.transaction(async (tx) => {
        const insertUser = await tx.run(
          `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
          ['Tx User', email, 'hash123', 'STUDENT']
        );
        return insertUser.lastInsertRowid;
      });

      expect(result).toBeGreaterThan(0);
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      expect(user).not.toBeNull();

      // Cleanup
      await db.run('DELETE FROM users WHERE email = ?', [email]);
    });

    test('Transaction rolls back all statements on exception', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.run(
            `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
            ['Rollback User', 'rollback@test.local', 'hash123', 'STUDENT']
          );
          throw new Error('Simulated atomic transaction abort');
        })
      ).rejects.toThrow('Simulated atomic transaction abort');

      const user = await db.get('SELECT * FROM users WHERE email = ?', ['rollback@test.local']);
      expect(user).toBeNull();
    });
  });

  describe('8. Idempotency Verification', () => {
    test('Re-running initDb and seedDb does not duplicate records or throw errors', async () => {
      await expect(initDb()).resolves.not.toThrow();
      await expect(seedDb()).resolves.not.toThrow();

      const itemsCount = await db.get('SELECT COUNT(*) as count FROM menu_items');
      expect(Number(itemsCount.count)).toBe(23);

      const variantsCount = await db.get('SELECT COUNT(*) as count FROM menu_item_variants');
      expect(Number(variantsCount.count)).toBe(8);

      const usersCount = await db.get('SELECT COUNT(*) as count FROM users');
      expect(Number(usersCount.count)).toBeGreaterThanOrEqual(4);

      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const activeSlots = await db.query('SELECT COUNT(*) as count FROM pickup_slots WHERE slot_date IN (?, ?)', [today, tomorrow]);
      expect(Number(activeSlots[0].count)).toBe(12);
    });
  });
});
