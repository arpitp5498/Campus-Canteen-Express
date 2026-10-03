/**
 * Campus Canteen Express - Pickup Slot Controller
 * File: backend/controllers/slotController.js
 */

const db = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');
const { NotFoundError, ValidationError, AppError } = require('../middleware/errorHandler');

/**
 * Format a slot row with aliases and dynamic indicators.
 */
function formatSlot(row) {
  const maxCap = Number(row.max_capacity);
  const currOrders = Number(row.current_orders);
  const remaining = Math.max(0, maxCap - currOrders);
  const isAvailable = Boolean(row.is_active === 1 && currOrders < maxCap);
  const isFull = Boolean(currOrders >= maxCap || row.is_active === 0);

  return {
    id: row.id,
    slot_date: row.slot_date,
    date: row.slot_date,
    start_time: row.start_time,
    end_time: row.end_time,
    time_window: `${row.start_time} - ${row.end_time}`,
    max_capacity: maxCap,
    capacity: maxCap,
    current_orders: currOrders,
    remaining_capacity: remaining,
    is_active: Boolean(row.is_active),
    is_available: isAvailable,
    is_full: isFull,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * GET /api/slots/available & /api/slots
 * Retrieve 10-minute interval pickup slots for today or a specified date.
 */
async function getAvailableSlots(req, res, next) {
  try {
    let { date } = req.query;

    if (!date) {
      date = new Date().toISOString().split('T')[0];
    } else {
      // Validate date format YYYY-MM-DD
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date.trim())) {
        return successResponse(res, { date, slots: [] }, null, 200);
      }
      date = date.trim();
    }

    let slots = await db.query(
      `SELECT * FROM pickup_slots
       WHERE slot_date = ? AND is_active = 1
       ORDER BY start_time ASC`,
      [date]
    );

    if ((!slots || slots.length === 0)) {
      const today = new Date().toISOString().split('T')[0];
      const tom = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      if (date === today || date === tom) {
        const standardWindows = [
          ['12:00', '12:10'],
          ['12:10', '12:20'],
          ['12:20', '12:30'],
          ['12:30', '12:40'],
          ['12:40', '12:50'],
          ['12:50', '13:00']
        ];
        for (const [start, end] of standardWindows) {
          await db.run(
            `INSERT INTO pickup_slots (slot_date, start_time, end_time, max_capacity, current_orders, is_active)
             VALUES (?, ?, ?, 15, 0, 1)`,
            [date, start, end]
          );
        }
        slots = await db.query(
          `SELECT * FROM pickup_slots WHERE slot_date = ? AND is_active = 1 ORDER BY start_time ASC`,
          [date]
        );
      }
    }

    const formattedSlots = (slots || []).map(formatSlot);

    return successResponse(res, { date, slots: formattedSlots }, null, 200);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/slots/:id
 * Retrieve single slot details by ID.
 */
async function getSlotById(req, res, next) {
  try {
    const slotId = parseInt(req.params.id, 10);
    if (isNaN(slotId)) {
      throw new ValidationError('Slot ID must be an integer.');
    }

    const slot = await db.get('SELECT * FROM pickup_slots WHERE id = ?', [slotId]);
    if (!slot) {
      throw new NotFoundError('Pickup slot not found.');
    }

    return successResponse(res, { slot: formatSlot(slot) }, null, 200);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/slots/:id & /api/admin/slots/:id
 * Update pickup slot capacity and active status (Admin).
 */
async function updateSlotCapacity(req, res, next) {
  try {
    const slotId = parseInt(req.params.id, 10);
    if (isNaN(slotId)) {
      throw new ValidationError('Slot ID must be an integer.');
    }

    const slot = await db.get('SELECT * FROM pickup_slots WHERE id = ?', [slotId]);
    if (!slot) {
      throw new NotFoundError('Pickup slot not found.');
    }

    const { max_capacity, capacity, is_active } = req.body;
    const targetCapacity = max_capacity !== undefined ? max_capacity : capacity;

    if (targetCapacity !== undefined) {
      const capNum = Number(targetCapacity);
      if (isNaN(capNum) || capNum <= 0 || !Number.isInteger(capNum)) {
        return errorResponse(res, 'Slot maximum capacity must be a positive integer.', 400, 'INVALID_CAPACITY');
      }

      if (capNum < slot.current_orders) {
        return errorResponse(
          res,
          `Cannot reduce max capacity (${capNum}) below already booked orders (${slot.current_orders}).`,
          400,
          'CAPACITY_BELOW_CURRENT'
        );
      }
    }

    const newCap = targetCapacity !== undefined ? Number(targetCapacity) : slot.max_capacity;
    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : slot.is_active;

    await db.run(
      `UPDATE pickup_slots
       SET max_capacity = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newCap, newActive, slotId]
    );

    const updated = await db.get('SELECT * FROM pickup_slots WHERE id = ?', [slotId]);

    return successResponse(res, { slot: formatSlot(updated) }, 'Slot capacity updated successfully', 200);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAvailableSlots,
  getSlotById,
  updateSlotCapacity
};
