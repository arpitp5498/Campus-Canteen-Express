/**
 * Campus Canteen Express - SQLite to MySQL Migration Script
 * File: database/migrate-sqlite-to-mysql.js
 * 
 * Safely migrates all schema and relational records from SQLite (canteen.db)
 * to MySQL (campus_canteen) preserving primary keys, timestamps, and relationships.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
require('dotenv').config();

// 1. Paths
const projectRoot = path.resolve(__dirname, '..');
const sqlitePath = path.join(projectRoot, 'database/canteen.db');
const backupDir = path.join(projectRoot, 'database/backup');
const backupPath = path.join(backupDir, 'canteen_before_mysql_migration.db');
const schemaSqlPath = path.join(projectRoot, 'database/schema.mysql.sql');

// 2. MySQL Configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'campuscanteen',
  password: process.env.DB_PASSWORD || 'campuscanteen',
  multipleStatements: true
};

const targetDatabase = process.env.DB_NAME || 'campus_canteen';

async function runMigration() {
  console.log('====================================================');
  console.log('  CAMPUS CANTEEN EXPRESS - SQLITE TO MYSQL MIGRATION');
  console.log('====================================================\n');

  // Step 1: Ensure SQLite DB exists
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found at: ${sqlitePath}`);
  }
  console.log(`[Step 1] Found active SQLite database at: ${sqlitePath}`);

  // Step 2: Backup SQLite DB
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  fs.copyFileSync(sqlitePath, backupPath);
  console.log(`[Step 2] Verified SQLite backup at: ${backupPath} (${fs.statSync(backupPath).size} bytes)`);

  // Step 3: Open SQLite connection
  const sqliteDb = new Database(sqlitePath, { readonly: true });
  console.log('[Step 3] SQLite connection opened (read-only).');

  // Step 4: Connect to MySQL
  console.log(`[Step 4] Connecting to MySQL at ${dbConfig.host}:${dbConfig.port} as '${dbConfig.user}'...`);
  const mysqlConn = await mysql.createConnection(dbConfig);
  console.log('✔ Connected to MySQL successfully.');

  // Step 5: Execute Schema Definition
  console.log('[Step 5] Applying MySQL Schema Definition...');
  const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
  await mysqlConn.query(schemaSql);
  await mysqlConn.query(`USE \`${targetDatabase}\`;`);
  console.log(`✔ Schema initialized in database '${targetDatabase}'.`);

  // Step 6: Define Migration Tables in Dependency Order
  const tables = [
    {
      name: 'users',
      columns: ['id', 'name', 'email', 'password_hash', 'role', 'created_at', 'updated_at']
    },
    {
      name: 'menu_items',
      columns: ['id', 'name', 'description', 'category', 'base_price', 'prep_time_minutes', 'is_available', 'image_url', 'created_at', 'updated_at']
    },
    {
      name: 'menu_item_variants',
      columns: ['id', 'menu_item_id', 'variant_name', 'price', 'is_available', 'created_at', 'updated_at']
    },
    {
      name: 'pickup_slots',
      columns: ['id', 'slot_date', 'start_time', 'end_time', 'max_capacity', 'current_orders', 'is_active', 'created_at', 'updated_at']
    },
    {
      name: 'orders',
      columns: ['id', 'order_number', 'user_id', 'pickup_slot_id', 'pickup_token', 'token_hash', 'order_type', 'pickup_date', 'subtotal', 'express_fee', 'total_amount', 'status', 'cancellation_reason', 'ready_at', 'collected_at', 'cancelled_at', 'created_at', 'updated_at']
    },
    {
      name: 'order_items',
      columns: ['id', 'order_id', 'menu_item_id', 'variant_id', 'item_name_snapshot', 'variant_name_snapshot', 'unit_price_snapshot', 'quantity', 'total_price', 'created_at']
    },
    {
      name: 'payments',
      columns: ['id', 'order_id', 'user_id', 'amount', 'currency', 'payment_method', 'razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature', 'status', 'created_at', 'updated_at']
    }
  ];

  // Step 7: Migrate Data Table by Table
  console.log('\n[Step 7] Migrating Data Records...');
  await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 0;');

  const validationResults = [];

  for (const t of tables) {
    // Read SQLite rows
    const sqliteRows = sqliteDb.prepare(`SELECT * FROM ${t.name}`).all();
    
    // Clear MySQL table
    await mysqlConn.query(`TRUNCATE TABLE \`${t.name}\`;`);

    if (sqliteRows.length > 0) {
      const placeholders = t.columns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO \`${t.name}\` (${t.columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;

      for (const row of sqliteRows) {
        const values = t.columns.map(col => {
          let val = row[col];
          if (val === undefined || val === null) return null;
          if (typeof val === 'boolean') return val ? 1 : 0;
          if (typeof val === 'string' && (col.endsWith('_at') || col === 'created_at' || col === 'updated_at' || col.endsWith('_date'))) {
            if (val.includes('T')) {
              const d = new Date(val);
              if (!isNaN(d.getTime())) {
                if (col.endsWith('_date') && !col.endsWith('_at')) {
                  return d.toISOString().split('T')[0];
                }
                return d.toISOString().slice(0, 19).replace('T', ' ');
              }
            }
          }
          return val;
        });
        await mysqlConn.query(insertSql, values);
      }
    }

    // Validate count
    const [myCountRows] = await mysqlConn.query(`SELECT COUNT(*) as cnt FROM \`${t.name}\`;`);
    const myCount = myCountRows[0].cnt;
    const sqCount = sqliteRows.length;
    const status = sqCount === myCount ? 'PASS' : 'FAIL';

    validationResults.push({
      table: t.name,
      sqliteRows: sqCount,
      mysqlRows: myCount,
      status
    });

    console.log(`  -> Table '${t.name}': Migrated ${sqCount} rows (MySQL Count: ${myCount}) [${status}]`);
  }

  await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('✔ Foreign key checks re-enabled.');

  // Step 8: Referential Integrity & Orphan Validation
  console.log('\n[Step 8] Validating Referential Integrity...');

  const [orphanOrdersUser] = await mysqlConn.query(`
    SELECT o.id, o.order_number FROM orders o 
    LEFT JOIN users u ON o.user_id = u.id 
    WHERE u.id IS NULL
  `);
  const [orphanOrdersSlot] = await mysqlConn.query(`
    SELECT o.id, o.order_number FROM orders o 
    LEFT JOIN pickup_slots s ON o.pickup_slot_id = s.id 
    WHERE s.id IS NULL
  `);
  const [orphanOrderItems] = await mysqlConn.query(`
    SELECT oi.id, oi.order_id FROM order_items oi 
    LEFT JOIN orders o ON oi.order_id = o.id 
    WHERE o.id IS NULL
  `);
  const [orphanPayments] = await mysqlConn.query(`
    SELECT p.id, p.order_id FROM payments p 
    LEFT JOIN orders o ON p.order_id = o.id 
    WHERE o.id IS NULL
  `);

  const orphanCount = orphanOrdersUser.length + orphanOrdersSlot.length + orphanOrderItems.length + orphanPayments.length;
  if (orphanCount > 0) {
    console.error('❌ Orphan records detected in MySQL!');
    console.error({ orphanOrdersUser, orphanOrdersSlot, orphanOrderItems, orphanPayments });
    throw new Error(`Referential integrity failed with ${orphanCount} orphan records.`);
  }
  console.log('✔ Referential integrity verified: 0 orphan records found.');

  // Cleanup
  sqliteDb.close();
  await mysqlConn.end();

  // Print Summary Table
  console.log('\n====================================================');
  console.log('              MIGRATION SUMMARY REPORT              ');
  console.log('====================================================');
  console.table(validationResults);

  const allPassed = validationResults.every(r => r.status === 'PASS');
  if (allPassed) {
    console.log('🎉 ALL TABLES MIGRATED AND VALIDATED SUCCESSFULLY!\n');
  } else {
    throw new Error('Migration finished with validation failures.');
  }
}

if (require.main === module) {
  runMigration().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('\n❌ Migration Failed:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };
