const { request, getApp } = require('../helpers/appHelper');
const { initTestDb, seedTestDb, closeAndRemoveTestDb } = require('../helpers/dbHelper');
const { getAuthenticatedAdmin, getAuthenticatedStudent } = require('../helpers/authHelper');

describe('Tier 1: Menu Management & Search (Feature Coverage)', () => {
  let app;
  let db;
  let dbPath;
  let adminAuth;
  let studentAuth;

  beforeAll(async () => {
    const testDb = initTestDb();
    db = testDb.db;
    dbPath = testDb.dbPath;
    await seedTestDb(db);
    app = getApp();

    adminAuth = await getAuthenticatedAdmin(app);
    studentAuth = await getAuthenticatedStudent(app);
  });

  afterAll(async () => {
    closeAndRemoveTestDb(db, dbPath);
  });

  it('T1-MENU-01: Public Menu Fetch Returns All 23 Confirmed Items', async () => {
    const res = await request(app).get('/api/menu');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const items = res.body.items || res.body.data?.items;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(23);

    // Verify key items and prices
    const tea = items.find(i => i.name === 'Tea');
    expect(tea).toBeDefined();
    expect(Number(tea.base_price || tea.price)).toBe(15);
    expect(tea.category).toBe('Drinks');

    const pizza = items.find(i => i.name === 'Cheese Medium Pizza');
    expect(pizza).toBeDefined();
    expect(Number(pizza.base_price || pizza.price)).toBe(120);

    const burger = items.find(i => i.name === 'Burger');
    expect(burger).toBeDefined();
    expect(Number(burger.base_price || burger.price)).toBe(40);
  });

  it('T1-MENU-02: Filter Menu by Category (Sandwiches)', async () => {
    const res = await request(app).get('/api/menu?category=Sandwiches');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const items = res.body.items || res.body.data?.items;
    expect(items.length).toBeGreaterThanOrEqual(3);
    items.forEach(item => {
      expect(item.category).toBe('Sandwiches');
    });

    const itemNames = items.map(i => i.name);
    expect(itemNames).toContain('Normal Sandwich');
    expect(itemNames).toContain('Cheese Grilled Sandwich');
  });

  it('T1-MENU-03: Search Menu by Keyword (Maggi)', async () => {
    const res = await request(app).get('/api/menu?search=maggi');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const items = res.body.items || res.body.data?.items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    const names = items.map(i => i.name);
    expect(names).toContain('Maggi');
    expect(names).toContain('Cheese Maggi');
  });

  it('T1-MENU-04: Filter Menu by Drinks Category', async () => {
    const res = await request(app).get('/api/menu?category=Drinks');

    expect(res.status).toBe(200);
    const items = res.body.items || res.body.data?.items;
    const names = items.map(i => i.name);
    expect(names).toContain('Tea');
    expect(names).toContain('Coffee');
    expect(names).toContain('Cold Coffee');
    expect(names).toContain('Shikanji');
  });

  it('T1-MENU-05: Search with Non-Existent Query Returns Empty Array', async () => {
    const res = await request(app).get('/api/menu?search=xyznonsensefooditem999');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const items = res.body.items || res.body.data?.items;
    expect(items.length).toBe(0);
  });

  it('T1-MENU-06: Single Menu Item Fetch with Variants', async () => {
    const res = await request(app).get('/api/menu/5'); // Chilli Potato

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const item = res.body.item || res.body.data?.item;
    expect(item.name).toBe('Chilli Potato');
    expect(Array.isArray(item.variants)).toBe(true);
    expect(item.variants.length).toBe(2);

    const half = item.variants.find(v => v.variant_name === 'Half');
    const full = item.variants.find(v => v.variant_name === 'Full');
    expect(half).toBeDefined();
    expect(Number(half.price)).toBe(70);
    expect(full).toBeDefined();
    expect(Number(full.price)).toBe(120);
  });

  it('T1-MENU-07: Admin Toggles Menu Item Availability', async () => {
    // 1. Toggle unavailable
    const toggleOff = await request(app)
      .patch('/api/menu/1/availability')
      .set(adminAuth.headers)
      .send({ is_available: 0 });

    expect(toggleOff.status).toBe(200);
    expect(toggleOff.body.success).toBe(true);

    const dbItem = await db.prepare('SELECT is_available FROM menu_items WHERE id = 1').get();
    expect(Number(dbItem.is_available)).toBe(0);

    // 2. Toggle available back
    const toggleOn = await request(app)
      .patch('/api/menu/1/availability')
      .set(adminAuth.headers)
      .send({ is_available: 1 });

    expect(toggleOn.status).toBe(200);
    const dbItemAfter = await db.prepare('SELECT is_available FROM menu_items WHERE id = 1').get();
    expect(Number(dbItemAfter.is_available)).toBe(1);
  });

  it('T1-MENU-08: Admin Updates Menu Item Details and Price', async () => {
    const payload = {
      name: 'Special Normal Sandwich',
      description: 'Fresh bread with spiced butter and cucumber',
      category: 'Sandwiches',
      price: 35.00,
      preparation_time: 6,
      is_available: 1
    };

    const res = await request(app)
      .put('/api/menu/1')
      .set(adminAuth.headers)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const item = res.body.item || res.body.data?.item;
    expect(item.name).toBe('Special Normal Sandwich');
    expect(Number(item.base_price || item.price)).toBe(35);

    const dbRow = await db.prepare('SELECT name, base_price, prep_time_minutes FROM menu_items WHERE id = 1').get();
    expect(dbRow.name).toBe('Special Normal Sandwich');
    expect(Number(dbRow.base_price)).toBe(35);
    expect(dbRow.prep_time_minutes).toBe(6);
  });

  it('T1-MENU-09: Admin Creates and Deletes New Menu Item', async () => {
    // 1. Create item
    const createPayload = {
      name: 'Paneer Tikka Roll Special',
      description: 'Marinated paneer cubes grilled with spices and onions',
      category: 'Rolls',
      price: 85.00,
      preparation_time: 10,
      is_available: 1
    };

    const createRes = await request(app)
      .post('/api/menu')
      .set(adminAuth.headers)
      .send(createPayload);

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const createdItem = createRes.body.item || createRes.body.data?.item;
    const newItemId = createdItem.id;
    expect(newItemId).toBeDefined();

    // 2. Delete item
    const deleteRes = await request(app)
      .delete(`/api/menu/${newItemId}`)
      .set(adminAuth.headers);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const checkDb = await db.prepare('SELECT * FROM menu_items WHERE id = ?').get(newItemId);
    expect(!checkDb || checkDb.is_deleted === 1).toBe(true);
  });
});
