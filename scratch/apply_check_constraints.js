const db = require('../backend/config/database');

async function applyConstraints() {
  const constraints = [
    { table: 'menu_items', name: 'chk_menu_base_price', sql: 'ALTER TABLE menu_items ADD CONSTRAINT chk_menu_base_price CHECK (base_price >= 0)' },
    { table: 'pickup_slots', name: 'chk_slot_capacity', sql: 'ALTER TABLE pickup_slots ADD CONSTRAINT chk_slot_capacity CHECK (current_orders <= max_capacity AND current_orders >= 0)' },
    { table: 'orders', name: 'chk_orders_subtotal', sql: 'ALTER TABLE orders ADD CONSTRAINT chk_orders_subtotal CHECK (subtotal >= 0)' },
    { table: 'orders', name: 'chk_orders_express_fee', sql: 'ALTER TABLE orders ADD CONSTRAINT chk_orders_express_fee CHECK (express_fee >= 0)' },
    { table: 'order_items', name: 'chk_order_items_qty', sql: 'ALTER TABLE order_items ADD CONSTRAINT chk_order_items_qty CHECK (quantity > 0)' }
  ];

  for (const c of constraints) {
    try {
      await db.run(c.sql);
      console.log(`✅ Added constraint: ${c.name} on ${c.table}`);
    } catch (err) {
      if (err.message && (err.message.includes('Duplicate check constraint') || err.message.includes('already exists'))) {
        console.log(`ℹ️ Constraint ${c.name} already exists.`);
      } else {
        console.log(`⚠️ ${c.name}: ${err.message}`);
      }
    }
  }

  await db.close();
}

applyConstraints();
