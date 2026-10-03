/**
 * Campus Canteen Express - Empirical 5x Idempotency Stress Test
 * Challenger 1 - Milestone 1
 */

const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '../database/canteen.db');

console.log('====================================================');
console.log('  EMPIRICAL 5X IDEMPOTENCY STRESS TEST');
console.log('====================================================\n');

for (let iteration = 1; iteration <= 5; iteration++) {
  console.log(`[Iteration ${iteration}/5] Executing database/init.js...`);
  const initOut = execSync('node database/init.js', { encoding: 'utf-8', cwd: path.resolve(__dirname, '..') });
  
  console.log(`[Iteration ${iteration}/5] Executing database/seed.js...`);
  const seedOut = execSync('node database/seed.js', { encoding: 'utf-8', cwd: path.resolve(__dirname, '..') });

  // Connect and verify database integrity
  const db = new Database(dbPath, { readonly: true });
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const menuCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get().count;
    const variantCount = db.prepare('SELECT COUNT(*) as count FROM menu_item_variants').get().count;
    const slotCount = db.prepare('SELECT COUNT(*) as count FROM pickup_slots').get().count;

    console.log(`  -> Record counts: users=${userCount}, menu_items=${menuCount}, variants=${variantCount}, slots=${slotCount}`);

    if (userCount !== 4) throw new Error(`Expected 4 users, got ${userCount}`);
    if (menuCount !== 23) throw new Error(`Expected 23 menu items, got ${menuCount}`);
    if (variantCount !== 8) throw new Error(`Expected 8 variants, got ${variantCount}`);
    if (slotCount !== 24) throw new Error(`Expected 24 slots, got ${slotCount}`);

    // Verify admin password hash is valid
    const admin = db.prepare("SELECT password_hash FROM users WHERE email = 'admin@canteen.local'").get();
    if (!bcrypt.compareSync('Admin@123', admin.password_hash)) {
      throw new Error('Admin password hash mismatch after re-seed');
    }

    // Verify Maggi price
    const maggi = db.prepare("SELECT base_price FROM menu_items WHERE name = 'Maggi'").get();
    if (maggi.base_price !== 50.00) {
      throw new Error(`Maggi price corrupted: ${maggi.base_price}`);
    }

    console.log(`  -> Iteration ${iteration} PASSED: Exact counts and data integrity confirmed.\n`);
  } finally {
    db.close();
  }
}

console.log('✅ ALL 5 IDEMPOTENCY CYCLES COMPLETED SUCCESSFULLY WITH ZERO DUPLICATES OR CORRUPTION.');
