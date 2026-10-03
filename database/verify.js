const db = require('../backend/config/database');

async function verify() {
  console.log('=== Database Verification ===');
  const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  console.log('Tables:', tables.map(t => t.name));
  for (const t of tables) {
    const count = await db.get(`SELECT COUNT(*) as c FROM ${t.name}`);
    console.log(`  - ${t.name}: ${count.c} rows`);
  }

  const fk = db.raw.pragma('foreign_keys', { simple: true });
  const jm = db.raw.pragma('journal_mode', { simple: true });
  const sync = db.raw.pragma('synchronous', { simple: true });
  const busy = db.raw.pragma('busy_timeout', { simple: true });
  console.log(`PRAGMAs: foreign_keys=${fk}, journal_mode=${jm}, synchronous=${sync}, busy_timeout=${busy}`);

  const items = await db.query('SELECT id, name, category, base_price, prep_time_minutes, is_available FROM menu_items ORDER BY id');
  console.log(`Menu items (${items.length}):`);
  items.forEach(i => console.log(`  [#${i.id}] ${i.name} (${i.category}) - ₹${i.base_price} [${i.prep_time_minutes}m]`));

  const variants = await db.query(`
    SELECT m.name, v.variant_name, v.price 
    FROM menu_item_variants v 
    JOIN menu_items m ON v.menu_item_id = m.id 
    ORDER BY m.id, v.id
  `);
  console.log(`Variants (${variants.length}):`);
  variants.forEach(v => console.log(`  ${v.name} -> ${v.variant_name}: ₹${v.price}`));

  const users = await db.query('SELECT id, name, email, role FROM users ORDER BY id');
  console.log(`Users (${users.length}):`);
  users.forEach(u => console.log(`  [#${u.id}] ${u.name} <${u.email}> (${u.role})`));

  const slots = await db.query('SELECT slot_date, COUNT(*) as count FROM pickup_slots GROUP BY slot_date');
  console.log(`Pickup slots:`);
  slots.forEach(s => console.log(`  ${s.slot_date}: ${s.count} slots`));

  db.close();
  console.log('=== Verification Completed Successfully ===');
}

verify().catch(console.error);
