/**
 * Campus Canteen Express - Database Seed Script (MySQL)
 * File: database/seed.js
 * 
 * Populates:
 * 1. Default Admin & Student user accounts with bcrypt hashes (salt factor 10)
 * 2. Exact 23 Menu Items across 6 categories with preparation times and image paths (IDs 1-23)
 * 3. Menu Item Variants for multi-size items (Chilli Potato, French Fries, Patty, Noodles) (IDs 1-8)
 * 4. 12 Pickup Time Slots (12:00 PM to 1:00 PM) for today and tomorrow (capacity 15) (IDs 1-12)
 * 
 * Fully idempotent: safe to run multiple times without throwing duplicate key errors.
 */

const bcrypt = require('bcryptjs');
const db = require('../backend/config/database');
const { initDb } = require('./init');

const MENU_ITEMS = [
  // 1. Normal Sandwich (ID 1)
  {
    id: 1,
    name: 'Normal Sandwich',
    description: 'Fresh cucumber, tomato, and mint chutney layered between soft white bread slices.',
    category: 'Sandwiches',
    base_price: 30.00,
    prep_time_minutes: 5,
    is_available: 1,
    image_url: '/images/food/normal_sandwich.jpg',
    variants: []
  },
  // 2. Grilled/Chilli Sandwich (ID 2)
  {
    id: 2,
    name: 'Grilled/Chilli Sandwich',
    description: 'Crispy golden-grilled sandwich stuffed with spiced green chillies, onions, and capsicum.',
    category: 'Sandwiches',
    base_price: 50.00,
    prep_time_minutes: 8,
    is_available: 1,
    image_url: '/images/food/grilled_sandwich.jpg',
    variants: []
  },
  // 3. Cheese Grilled Sandwich (ID 3)
  {
    id: 3,
    name: 'Cheese Grilled Sandwich',
    description: 'Golden-grilled sandwich loaded with melted mozzarella and cheddar cheese with herb seasoning.',
    category: 'Sandwiches',
    base_price: 80.00,
    prep_time_minutes: 8,
    is_available: 1,
    image_url: '/images/food/cheese_grilled_sandwich.jpg',
    variants: []
  },
  // 4. Spring Roll (ID 4)
  {
    id: 4,
    name: 'Spring Roll',
    description: 'Crispy deep-fried spring rolls stuffed with shredded vegetables and dipping sauce.',
    category: 'Rolls',
    base_price: 50.00,
    prep_time_minutes: 8,
    is_available: 1,
    image_url: '/images/food/spring_roll.jpg',
    variants: []
  },
  // 5. Chilli Potato (ID 5)
  {
    id: 5,
    name: 'Chilli Potato',
    description: 'Crispy fried potato fingers tossed in spicy sweet chilli sauce, garlic, capsicum, and spring onions.',
    category: 'Snacks',
    base_price: 70.00,
    prep_time_minutes: 10,
    is_available: 1,
    image_url: '/images/food/chilli_potato.jpg',
    variants: [
      { id: 1, variant_name: 'Half', price: 70.00 },
      { id: 2, variant_name: 'Full', price: 120.00 }
    ]
  },
  // 6. French Fries (ID 6)
  {
    id: 6,
    name: 'French Fries',
    description: 'Crispy golden potato fries lightly seasoned with sea salt and served hot with ketchup.',
    category: 'Snacks',
    base_price: 60.00,
    prep_time_minutes: 7,
    is_available: 1,
    image_url: '/images/food/french_fries.jpg',
    variants: [
      { id: 3, variant_name: 'Regular', price: 60.00 },
      { id: 4, variant_name: 'Large', price: 120.00 }
    ]
  },
  // 7. Cheese Maggi (ID 7)
  {
    id: 7,
    name: 'Cheese Maggi',
    description: 'Classic 2-minute Maggi noodles topped with a generous layer of melted cheddar cheese.',
    category: 'Snacks',
    base_price: 80.00,
    prep_time_minutes: 6,
    is_available: 1,
    image_url: '/images/food/cheese_maggi.jpg',
    variants: []
  },
  // 8. Maggi (ID 8)
  {
    id: 8,
    name: 'Maggi',
    description: 'Classic comforting Indian-style masala Maggi noodles cooked with aromatic spices and veggies.',
    category: 'Snacks',
    base_price: 50.00,
    prep_time_minutes: 5,
    is_available: 1,
    image_url: '/images/food/maggi.jpg',
    variants: []
  },
  // 9. Burger (ID 9)
  {
    id: 9,
    name: 'Burger',
    description: 'Crispy spiced vegetable patty topped with lettuce, sliced tomatoes, and creamy mayonnaise in a toasted bun.',
    category: 'Snacks',
    base_price: 40.00,
    prep_time_minutes: 10,
    is_available: 1,
    image_url: '/images/food/burger.jpg',
    variants: []
  },
  // 10. Patty (ID 10)
  {
    id: 10,
    name: 'Patty',
    description: 'Flaky baked puff pastry stuffed with spiced potato and peas filling.',
    category: 'Snacks',
    base_price: 30.00,
    prep_time_minutes: 5,
    is_available: 1,
    image_url: '/images/food/patty.jpg',
    variants: [
      { id: 5, variant_name: 'Normal', price: 30.00 },
      { id: 6, variant_name: 'Cheese', price: 40.00 }
    ]
  },
  // 11. Tea (ID 11)
  {
    id: 11,
    name: 'Tea',
    description: 'Freshly brewed aromatic spiced milk chai with ginger and cardamom.',
    category: 'Drinks',
    base_price: 15.00,
    prep_time_minutes: 5,
    is_available: 1,
    image_url: '/images/food/tea.jpg',
    variants: []
  },
  // 12. Coffee (ID 12)
  {
    id: 12,
    name: 'Coffee',
    description: 'Rich hot brewed instant coffee with velvety milk froth.',
    category: 'Drinks',
    base_price: 30.00,
    prep_time_minutes: 5,
    is_available: 1,
    image_url: '/images/food/coffee.jpg',
    variants: []
  },
  // 13. Noodles (ID 13)
  {
    id: 13,
    name: 'Noodles',
    description: 'Wok-tossed vegetable Hakka noodles with julienne vegetables and soy-chilli seasoning.',
    category: 'Snacks',
    base_price: 70.00,
    prep_time_minutes: 10,
    is_available: 1,
    image_url: '/images/food/noodles.jpg',
    variants: [
      { id: 7, variant_name: 'Half', price: 70.00 },
      { id: 8, variant_name: 'Full', price: 120.00 }
    ]
  },
  // 14. Aloo Paratha (ID 14)
  {
    id: 14,
    name: 'Aloo Paratha',
    description: 'Tawa-toasted whole wheat flatbread stuffed with spiced mashed potato filling served with pickle.',
    category: 'Meals',
    base_price: 40.00,
    prep_time_minutes: 10,
    is_available: 1,
    image_url: '/images/food/aloo_paratha.jpg',
    variants: []
  },
  // 15. Thali (ID 15)
  {
    id: 15,
    name: 'Thali',
    description: 'Complete wholesome meal with 2 rotis, seasonal sabzi, dal tadka, jeera rice, and fresh salad.',
    category: 'Meals',
    base_price: 100.00,
    prep_time_minutes: 12,
    is_available: 1,
    image_url: '/images/food/thali.jpg',
    variants: []
  },
  // 16. Cheese Paneer Roll (ID 16)
  {
    id: 16,
    name: 'Cheese Paneer Roll',
    description: 'Warm flaky paratha roll stuffed with spiced paneer tikka, crunchy onions, and melted cheese.',
    category: 'Rolls',
    base_price: 70.00,
    prep_time_minutes: 8,
    is_available: 1,
    image_url: '/images/food/cheese_paneer_roll.jpg',
    variants: []
  },
  // 17. Pasta Roll (ID 17)
  {
    id: 17,
    name: 'Pasta Roll',
    description: 'Fusion street roll loaded with creamy cheese pasta, herbs, and tangy tomato seasoning.',
    category: 'Rolls',
    base_price: 70.00,
    prep_time_minutes: 8,
    is_available: 1,
    image_url: '/images/food/pasta_roll.jpg',
    variants: []
  },
  // 18. Mini Pizza (ID 18)
  {
    id: 18,
    name: 'Mini Pizza',
    description: '6-inch personal pan pizza with tomato sauce, onions, capsicum, and mozzarella cheese.',
    category: 'Snacks',
    base_price: 50.00,
    prep_time_minutes: 12,
    is_available: 1,
    image_url: '/images/food/mini_pizza.jpg',
    variants: []
  },
  // 19. Cheese Medium Pizza (ID 19)
  {
    id: 19,
    name: 'Cheese Medium Pizza',
    description: '8-inch stone-baked pizza loaded with double mozzarella cheese and Italian herb dusting.',
    category: 'Snacks',
    base_price: 120.00,
    prep_time_minutes: 15,
    is_available: 1,
    image_url: '/images/food/cheese_medium_pizza.jpg',
    variants: []
  },
  // 20. Cold Coffee (ID 20)
  {
    id: 20,
    name: 'Cold Coffee',
    description: 'Thick, chilled blended coffee shake topped with creamy froth and chocolate syrup drizzle.',
    category: 'Drinks',
    base_price: 50.00,
    prep_time_minutes: 5,
    is_available: 1,
    image_url: '/images/food/cold_coffee.jpg',
    variants: []
  },
  // 21. Shikanji (ID 21)
  {
    id: 21,
    name: 'Shikanji',
    description: 'Refreshing traditional Indian spiced lemonade with mint, black salt, and roasted cumin.',
    category: 'Drinks',
    base_price: 50.00,
    prep_time_minutes: 5,
    is_available: 1,
    image_url: '/images/food/shikanji.jpg',
    variants: []
  },
  // 22. Pastry (ID 22)
  {
    id: 22,
    name: 'Pastry',
    description: 'Decadent rich dark chocolate truffle pastry layered with velvety ganache and chocolate curls.',
    category: 'Desserts',
    base_price: 40.00,
    prep_time_minutes: 2,
    is_available: 1,
    image_url: '/images/food/pastry.jpg',
    variants: []
  },
  // 23. Magnum Ice Cream (ID 23)
  {
    id: 23,
    name: 'Magnum Ice Cream',
    description: 'Premium vanilla bean ice cream bar coated in thick, cracking Belgian chocolate.',
    category: 'Desserts',
    base_price: 70.00,
    prep_time_minutes: 2,
    is_available: 1,
    image_url: '/images/food/magnum_ice_cream.jpg',
    variants: []
  }
];

const USERS = [
  {
    id: 1,
    name: 'Canteen Admin',
    email: 'admin@canteen.local',
    password: 'Admin@123',
    role: 'ADMIN'
  },
  {
    id: 2,
    name: 'Canteen Manager',
    email: 'admin@campus.edu',
    password: 'Admin@12345',
    role: 'ADMIN'
  },
  {
    id: 3,
    name: 'Rahul Sharma',
    email: 'student@campus.edu',
    password: 'Student@12345',
    role: 'STUDENT'
  },
  {
    id: 4,
    name: 'Priya Patel',
    email: 'student@canteen.local',
    password: 'Student@123',
    role: 'STUDENT'
  }
];

const TIME_WINDOWS = [
  { start: '12:00', end: '12:10' },
  { start: '12:10', end: '12:20' },
  { start: '12:20', end: '12:30' },
  { start: '12:30', end: '12:40' },
  { start: '12:40', end: '12:50' },
  { start: '12:50', end: '13:00' }
];

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function seedDb() {
  console.log('🌱 Starting database seed...');

  // Ensure schema is initialized before seeding
  await initDb();

  // 1. Seed Users
  for (const user of USERS) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(user.password, salt);
    
    await db.run(
      `INSERT INTO users (id, name, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         password_hash = VALUES(password_hash),
         role = VALUES(role),
         updated_at = CURRENT_TIMESTAMP`,
      [user.id, user.name, user.email, hash, user.role]
    );
  }
  console.log(`✅ Seeded ${USERS.length} test user accounts.`);

  // 2. Seed Menu Items and Variants
  await db.run('SET FOREIGN_KEY_CHECKS = 0');
  await db.run('DELETE FROM payments');
  await db.run('DELETE FROM order_items');
  await db.run('DELETE FROM orders');
  await db.run('DELETE FROM menu_item_variants');
  await db.run('DELETE FROM menu_items');
  await db.run('DELETE FROM pickup_slots');
  await db.run('DELETE FROM users WHERE id > 4');
  await db.run('SET FOREIGN_KEY_CHECKS = 1');

  let itemCount = 0;
  let variantCount = 0;

  for (const item of MENU_ITEMS) {
    await db.run(
      `INSERT INTO menu_items (id, name, description, category, base_price, prep_time_minutes, is_available, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         description = VALUES(description),
         category = VALUES(category),
         base_price = VALUES(base_price),
         prep_time_minutes = VALUES(prep_time_minutes),
         is_available = VALUES(is_available),
         image_url = VALUES(image_url),
         updated_at = CURRENT_TIMESTAMP`,
      [item.id, item.name, item.description, item.category, item.base_price, item.prep_time_minutes, item.is_available, item.image_url]
    );
    itemCount++;

    // Handle variants
    for (const v of item.variants) {
      await db.run(
        `INSERT INTO menu_item_variants (id, menu_item_id, variant_name, price, is_available)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           menu_item_id = VALUES(menu_item_id),
           variant_name = VALUES(variant_name),
           price = VALUES(price),
           is_available = VALUES(is_available),
           updated_at = CURRENT_TIMESTAMP`,
        [v.id, item.id, v.variant_name, v.price]
      );
      variantCount++;
    }
  }
  console.log(`✅ Seeded ${itemCount} menu items and ${variantCount} variants.`);

  // 3. Seed Pickup Slots for Today & Tomorrow (6 slots per day, capacity 15)
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const slotDefs = [
    { id: 1, date: formatDate(today), start: '12:00', end: '12:10' },
    { id: 2, date: formatDate(today), start: '12:10', end: '12:20' },
    { id: 3, date: formatDate(today), start: '12:20', end: '12:30' },
    { id: 4, date: formatDate(today), start: '12:30', end: '12:40' },
    { id: 5, date: formatDate(today), start: '12:40', end: '12:50' },
    { id: 6, date: formatDate(today), start: '12:50', end: '13:00' },
    { id: 7, date: formatDate(tomorrow), start: '12:00', end: '12:10' },
    { id: 8, date: formatDate(tomorrow), start: '12:10', end: '12:20' },
    { id: 9, date: formatDate(tomorrow), start: '12:20', end: '12:30' },
    { id: 10, date: formatDate(tomorrow), start: '12:30', end: '12:40' },
    { id: 11, date: formatDate(tomorrow), start: '12:40', end: '12:50' },
    { id: 12, date: formatDate(tomorrow), start: '12:50', end: '13:00' }
  ];

  for (const s of slotDefs) {
    await db.run(
      `INSERT INTO pickup_slots (id, slot_date, start_time, end_time, max_capacity, current_orders, is_active)
       VALUES (?, ?, ?, ?, 15, 0, 1)
       ON DUPLICATE KEY UPDATE
         slot_date = VALUES(slot_date),
         start_time = VALUES(start_time),
         end_time = VALUES(end_time),
         max_capacity = VALUES(max_capacity),
         is_active = VALUES(is_active),
         updated_at = CURRENT_TIMESTAMP`,
      [s.id, s.date, s.start, s.end]
    );
  }
  console.log(`✅ Seeded 12 deterministic pickup slots across 2 days (6 slots/day, 12:00-1:00 PM).`);
  console.log('✨ Database seeding complete.');
}

if (require.main === module) {
  seedDb()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Seed failed:', err.message);
      await db.close();
      process.exit(1);
    });
}

module.exports = {
  seedDb,
  MENU_ITEMS,
  USERS,
  TIME_WINDOWS
};
