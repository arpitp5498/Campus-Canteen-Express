/**
 * Campus Canteen Express - Menu Controller
 * File: backend/controllers/menuController.js
 */

const db = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

const ALLOWED_CATEGORIES = ['Sandwiches', 'Snacks', 'Meals', 'Rolls', 'Drinks', 'Desserts'];

/**
 * Format a raw menu item database row with normalized types and alias fields.
 */
function formatMenuItem(row, variants = []) {
  const basePrice = Number(row.base_price);
  const prepTime = Number(row.prep_time_minutes);
  const isAvail = Boolean(row.is_available);

  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    category: row.category,
    base_price: basePrice,
    price: basePrice,
    prep_time_minutes: prepTime,
    preparation_time: prepTime,
    is_available: isAvail,
    image_url: row.image_url || null,
    variants: variants.map(v => ({
      id: v.id,
      menu_item_id: v.menu_item_id,
      variant_name: v.variant_name,
      price: Number(v.price),
      is_available: Boolean(v.is_available)
    })),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * GET /api/menu
 * Public menu catalog discovery with search, category filter, and availability filter.
 */
async function getMenu(req, res, next) {
  try {
    const { category, search, available_only } = req.query;

    let sql = 'SELECT * FROM menu_items WHERE 1=1';
    const params = [];

    if (category) {
      sql += ' AND LOWER(category) = LOWER(?)';
      params.push(category.trim());
    }

    if (search) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?)';
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (available_only === 'true' || available_only === '1' || available_only === true) {
      sql += ' AND is_available = 1';
    }

    sql += ' ORDER BY id ASC';

    const items = await db.query(sql, params);

    if (!items || items.length === 0) {
      return successResponse(res, { items: [] }, null, 200);
    }

    // Fetch all variants for matching items
    const itemIds = items.map(i => i.id);
    const placeholders = itemIds.map(() => '?').join(',');
    const variants = await db.query(
      `SELECT * FROM menu_item_variants WHERE menu_item_id IN (${placeholders}) ORDER BY price ASC`,
      itemIds
    );

    // Group variants by menu_item_id
    const variantMap = new Map();
    for (const v of variants) {
      if (!variantMap.has(v.menu_item_id)) {
        variantMap.set(v.menu_item_id, []);
      }
      variantMap.get(v.menu_item_id).push(v);
    }

    const formattedItems = items.map(item => formatMenuItem(item, variantMap.get(item.id) || []));

    return successResponse(res, { items: formattedItems }, null, 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/menu/:id
 * Retrieve a single menu item with its variants.
 */
async function getMenuItemById(req, res, next) {
  try {
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
      throw new ValidationError('Menu item ID must be an integer.');
    }

    const item = await db.get('SELECT * FROM menu_items WHERE id = ?', [itemId]);
    if (!item) {
      throw new NotFoundError('Menu item not found.');
    }

    const variants = await db.query(
      'SELECT * FROM menu_item_variants WHERE menu_item_id = ? ORDER BY price ASC',
      [itemId]
    );

    const formatted = formatMenuItem(item, variants);

    return successResponse(res, { item: formatted }, null, 200);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/menu
 * Create a new menu item with optional variants inside an atomic transaction (Admin).
 */
async function createMenuItem(req, res, next) {
  try {
    const {
      name,
      description,
      category,
      price,
      base_price,
      preparation_time,
      prep_time_minutes,
      is_available,
      image_url,
      variants
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Item name is required and cannot be empty.');
    }

    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      return errorResponse(res, `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`, 400, 'INVALID_CATEGORY');
    }

    const rawPrice = price !== undefined ? price : base_price;
    if (rawPrice === undefined || typeof rawPrice !== 'number' || isNaN(rawPrice) || rawPrice < 0) {
      return errorResponse(res, 'Price must be a non-negative number.', 400, 'INVALID_PRICE');
    }

    const rawPrep = preparation_time !== undefined ? preparation_time : (prep_time_minutes !== undefined ? prep_time_minutes : 10);
    if (typeof rawPrep !== 'number' || isNaN(rawPrep) || rawPrep < 0) {
      return errorResponse(res, 'Preparation time must be a non-negative number.', 400, 'INVALID_PREP_TIME');
    }

    const availInt = (is_available === undefined || is_available === true || is_available === 1 || is_available === '1') ? 1 : 0;
    const finalDesc = description ? description.trim() : '';
    const finalImg = image_url ? image_url.trim() : `/images/food/${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.jpg`;

    if (variants && Array.isArray(variants)) {
      for (const v of variants) {
        if (!v.variant_name || typeof v.variant_name !== 'string' || v.variant_name.trim().length === 0) {
          return errorResponse(res, 'Variant name is required for each variant.', 400, 'INVALID_VARIANT');
        }
        if (v.price === undefined || typeof v.price !== 'number' || isNaN(v.price) || v.price < 0) {
          return errorResponse(res, 'Variant price must be non-negative.', 400, 'INVALID_VARIANT_PRICE');
        }
      }
    }

    const result = await db.transaction(async (tx) => {
      const insertItem = await tx.run(
        `INSERT INTO menu_items (name, description, category, base_price, prep_time_minutes, is_available, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name.trim(), finalDesc, category, rawPrice, rawPrep, availInt, finalImg]
      );

      const newItemId = insertItem.lastInsertRowid;

      if (variants && Array.isArray(variants) && variants.length > 0) {
        for (const v of variants) {
          const vAvail = (v.is_available === undefined || v.is_available === true || v.is_available === 1) ? 1 : 0;
          await tx.run(
            `INSERT INTO menu_item_variants (menu_item_id, variant_name, price, is_available)
             VALUES (?, ?, ?, ?)`,
            [newItemId, v.variant_name.trim(), v.price, vAvail]
          );
        }
      }

      const createdRow = await tx.get('SELECT * FROM menu_items WHERE id = ?', [newItemId]);
      const createdVariants = await tx.query('SELECT * FROM menu_item_variants WHERE menu_item_id = ? ORDER BY price ASC', [newItemId]);

      return formatMenuItem(createdRow, createdVariants);
    });

    return successResponse(res, { item: result }, 'Menu item created successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/menu/:id
 * Update an existing menu item and sync its variants (Admin).
 */
async function updateMenuItem(req, res, next) {
  try {
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
      throw new ValidationError('Menu item ID must be an integer.');
    }

    const existing = await db.get('SELECT * FROM menu_items WHERE id = ?', [itemId]);
    if (!existing) {
      throw new NotFoundError('Menu item not found.');
    }

    const {
      name,
      description,
      category,
      price,
      base_price,
      preparation_time,
      prep_time_minutes,
      is_available,
      image_url,
      variants
    } = req.body;

    const newName = name !== undefined ? name.trim() : existing.name;
    const newDesc = description !== undefined ? description.trim() : existing.description;
    const newCat = category !== undefined ? category : existing.category;

    if (newCat && !ALLOWED_CATEGORIES.includes(newCat)) {
      return errorResponse(res, `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`, 400, 'INVALID_CATEGORY');
    }

    const rawPrice = price !== undefined ? price : (base_price !== undefined ? base_price : existing.base_price);
    if (typeof rawPrice !== 'number' || isNaN(rawPrice) || rawPrice < 0) {
      return errorResponse(res, 'Price must be a non-negative number.', 400, 'INVALID_PRICE');
    }

    const rawPrep = preparation_time !== undefined ? preparation_time : (prep_time_minutes !== undefined ? prep_time_minutes : existing.prep_time_minutes);
    if (typeof rawPrep !== 'number' || isNaN(rawPrep) || rawPrep < 0) {
      return errorResponse(res, 'Preparation time must be a non-negative number.', 400, 'INVALID_PREP_TIME');
    }

    const newAvail = is_available !== undefined ? (is_available ? 1 : 0) : existing.is_available;
    const newImg = image_url !== undefined ? image_url : existing.image_url;

    const result = await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE menu_items
         SET name = ?, description = ?, category = ?, base_price = ?, prep_time_minutes = ?, is_available = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newName, newDesc, newCat, rawPrice, rawPrep, newAvail, newImg, itemId]
      );

      // If variants array is passed, replace variants
      if (variants && Array.isArray(variants)) {
        await tx.run('DELETE FROM menu_item_variants WHERE menu_item_id = ?', [itemId]);
        for (const v of variants) {
          const vAvail = (v.is_available === undefined || v.is_available === true || v.is_available === 1) ? 1 : 0;
          await tx.run(
            `INSERT INTO menu_item_variants (menu_item_id, variant_name, price, is_available)
             VALUES (?, ?, ?, ?)`,
            [itemId, v.variant_name.trim(), v.price, vAvail]
          );
        }
      }

      const updatedRow = await tx.get('SELECT * FROM menu_items WHERE id = ?', [itemId]);
      const updatedVariants = await tx.query('SELECT * FROM menu_item_variants WHERE menu_item_id = ? ORDER BY price ASC', [itemId]);

      return formatMenuItem(updatedRow, updatedVariants);
    });

    return successResponse(res, { item: result }, 'Menu item updated successfully', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/menu/:id/availability & /api/menu/:id/toggle
 * Toggle item availability status (Admin).
 */
async function toggleAvailability(req, res, next) {
  try {
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
      throw new ValidationError('Menu item ID must be an integer.');
    }

    const item = await db.get('SELECT * FROM menu_items WHERE id = ?', [itemId]);
    if (!item) {
      throw new NotFoundError('Menu item not found.');
    }

    let targetAvail;
    if (req.body && req.body.is_available !== undefined) {
      targetAvail = req.body.is_available ? 1 : 0;
    } else {
      targetAvail = item.is_available ? 0 : 1;
    }

    await db.run(
      'UPDATE menu_items SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [targetAvail, itemId]
    );

    const updated = await db.get('SELECT id, name, is_available FROM menu_items WHERE id = ?', [itemId]);

    const result = {
      id: updated.id,
      name: updated.name,
      is_available: Boolean(updated.is_available)
    };

    return successResponse(res, { item: result, ...result }, 'Item availability updated', 200);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/menu/:id
 * Delete a menu item (Admin).
 */
async function deleteMenuItem(req, res, next) {
  try {
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
      throw new ValidationError('Menu item ID must be an integer.');
    }

    const item = await db.get('SELECT * FROM menu_items WHERE id = ?', [itemId]);
    if (!item) {
      throw new NotFoundError('Menu item not found.');
    }

    try {
      await db.run('DELETE FROM menu_items WHERE id = ?', [itemId]);
    } catch (dbErr) {
      if (dbErr.message && dbErr.message.includes('FOREIGN KEY constraint failed')) {
        return errorResponse(res, 'Cannot delete menu item with active or past order history. Please disable availability instead.', 400, 'FOREIGN_KEY_RESTRICT');
      }
      throw dbErr;
    }

    return successResponse(res, {}, 'Menu item deleted successfully', 200);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMenu,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  toggleAvailability,
  deleteMenuItem
};
