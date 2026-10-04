/**
 * Campus Canteen Express - Order Processing Service (MySQL)
 * File: backend/services/orderService.js
 * 
 * Manages atomic order creation, slot capacity tracking, price snapshotting,
 * deterministic state progression, SHA-256 token verification, and real-time analytics.
 */

const db = require('../config/database');
const config = require('../config');
const tokenService = require('./tokenService');
const paymentService = require('./paymentService');
const { AppError, NotFoundError, ValidationError, ForbiddenError } = require('../middleware/errorHandler');

/**
 * Get dynamic express pickup fee based on order type.
 * - TODAY: ₹3.00
 * - TOMORROW: ₹1.00
 * 
 * @param {string} orderType - 'TODAY' or 'TOMORROW'
 * @returns {number}
 */
function getExpressFee(orderType) {
  if ((orderType || '').toUpperCase() === 'TOMORROW') {
    return config.expressFeeTomorrow || 1.00;
  }
  return config.expressFeeToday || 3.00;
}

/**
 * Valid order status transitions.
 */
const VALID_TRANSITIONS = {
  INITIATED: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['COLLECTED'],
  COLLECTED: [],
  CANCELLED: []
};

/**
 * Helper to build formatted order response object.
 * pickup_token is conditionally included (default true for student, false for admin).
 */
function formatOrder(orderRow, items = [], slotRow = null, paymentRow = null, includeToken = true) {
  if (!orderRow) return null;

  const order = {
    id: orderRow.id,
    order_number: orderRow.order_number,
    user_id: orderRow.user_id,
    pickup_slot_id: orderRow.pickup_slot_id,
    order_type: orderRow.order_type || 'TODAY',
    pickup_date: orderRow.pickup_date || null,
    subtotal: parseFloat(orderRow.subtotal),
    express_fee: parseFloat(orderRow.express_fee),
    total_amount: parseFloat(orderRow.total_amount),
    status: orderRow.status,
    cancellation_reason: orderRow.cancellation_reason || null,
    ready_at: orderRow.ready_at || null,
    collected_at: orderRow.collected_at || null,
    cancelled_at: orderRow.cancelled_at || null,
    created_at: orderRow.created_at,
    updated_at: orderRow.updated_at,
    items: items.map(item => ({
      id: item.id,
      order_id: item.order_id,
      menu_item_id: item.menu_item_id,
      variant_id: item.variant_id || null,
      name: item.item_name_snapshot,
      item_name: item.item_name_snapshot,
      item_name_snapshot: item.item_name_snapshot,
      variant_name: item.variant_name_snapshot || null,
      variant_name_snapshot: item.variant_name_snapshot || null,
      unit_price: parseFloat(item.unit_price_snapshot),
      unit_price_snapshot: parseFloat(item.unit_price_snapshot),
      quantity: item.quantity,
      total_price: parseFloat(item.total_price)
    }))
  };

  // Only include pickup_token if explicitly permitted (student view)
  if (includeToken && orderRow.pickup_token) {
    order.pickup_token = orderRow.pickup_token;
  }

  if (slotRow) {
    order.slot = {
      id: slotRow.id,
      slot_date: slotRow.slot_date,
      start_time: slotRow.start_time,
      end_time: slotRow.end_time,
      time_window: `${slotRow.start_time} - ${slotRow.end_time}`
    };
  }

  if (paymentRow) {
    order.payment = {
      id: paymentRow.id,
      status: paymentRow.status,
      method: paymentRow.payment_method,
      razorpay_order_id: paymentRow.razorpay_order_id || null,
      razorpay_payment_id: paymentRow.razorpay_payment_id || null
    };
  }

  return order;
}

/**
 * Place a new express food order with atomic slot decrement and price snapshotting.
 * 
 * @param {number} userId - Authenticated student ID
 * @param {Object} payload - { slot_id, items: [{ item_id, quantity, variant_id }], order_type }
 * @returns {Promise<{ order: Object, payment: Object }>}
 */
async function createOrder(userId, { slot_id, items, order_type = 'TODAY' }) {
  const targetSlotId = Number(slot_id);
  if (!targetSlotId || isNaN(targetSlotId) || targetSlotId <= 0) {
    throw new ValidationError('A valid pickup slot ID is required.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('At least one menu item must be included in the order.');
  }

  // Validate order_type: only 'TODAY' or 'TOMORROW' allowed
  const normalizedOrderType = (order_type || 'TODAY').toUpperCase();
  if (!['TODAY', 'TOMORROW'].includes(normalizedOrderType)) {
    throw new ValidationError("Invalid order_type. Must be either 'TODAY' or 'TOMORROW'.");
  }

  // Calculate pickup_date based on order_type
  const today = new Date();
  const pickupDate = new Date(today);
  if (normalizedOrderType === 'TOMORROW') {
    pickupDate.setDate(pickupDate.getDate() + 1);
  }
  const pickupDateStr = pickupDate.toISOString().split('T')[0];

  return await db.transaction(async (tx) => {
    // 1. Validate and Lock Pickup Slot
    const slot = await tx.get(
      'SELECT id, slot_date, start_time, end_time, max_capacity, current_orders, is_active FROM pickup_slots WHERE id = ?',
      [targetSlotId]
    );

    if (!slot || slot.is_active === 0) {
      throw new AppError('Selected pickup slot is invalid or inactive.', 400, 'INVALID_SLOT');
    }

    if (slot.current_orders >= slot.max_capacity) {
      throw new AppError('Selected pickup slot is full (maximum capacity exceeded). Please choose another slot.', 400, 'SLOT_FULL');
    }

    // Atomically increment slot order count
    const slotUpdate = await tx.run(
      'UPDATE pickup_slots SET current_orders = current_orders + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND current_orders < max_capacity',
      [targetSlotId]
    );

    if (slotUpdate.changes === 0) {
      throw new AppError('Selected pickup slot is full (maximum capacity exceeded). Please choose another slot.', 400, 'SLOT_FULL');
    }

    // 2. Server-Side Price Recalculation & Snapshot Compilation
    let subtotal = 0;
    const snapshots = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemId = Number(item.item_id !== undefined ? item.item_id : item.menu_item_id);
      const quantity = item.quantity;

      if (!itemId || isNaN(itemId) || itemId <= 0) {
        throw new ValidationError(`Item at index ${i} has an invalid item_id.`);
      }

      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
        throw new ValidationError(`Quantity for item at index ${i} must be a positive integer greater than or equal to 1.`);
      }

      // Fetch canonical menu item from DB
      const menuItem = await tx.get(
        'SELECT id, name, category, base_price, is_available FROM menu_items WHERE id = ?',
        [itemId]
      );

      if (!menuItem) {
        throw new AppError(`Menu item ${itemId} not found.`, 400, 'ITEM_NOT_FOUND');
      }

      if (menuItem.is_available === 0) {
        throw new AppError(`Item '${menuItem.name}' is currently unavailable.`, 400, 'ITEM_UNAVAILABLE');
      }

      let unitPrice = Number(menuItem.base_price);
      let variantName = null;
      let variantId = null;

      if (item.variant_id) {
        const varId = Number(item.variant_id);
        const variant = await tx.get(
          'SELECT id, variant_name, price, is_available FROM menu_item_variants WHERE id = ? AND menu_item_id = ?',
          [varId, menuItem.id]
        );

        if (!variant) {
          throw new AppError(`Variant ${varId} not found for item '${menuItem.name}'.`, 400, 'VARIANT_NOT_FOUND');
        }

        if (variant.is_available === 0) {
          throw new AppError(`Variant '${variant.variant_name}' for '${menuItem.name}' is currently unavailable.`, 400, 'VARIANT_UNAVAILABLE');
        }

        unitPrice = Number(variant.price);
        variantName = variant.variant_name;
        variantId = variant.id;
      }

      const itemTotal = Number((unitPrice * quantity).toFixed(2));
      subtotal += itemTotal;

      snapshots.push({
        menu_item_id: menuItem.id,
        variant_id: variantId,
        item_name_snapshot: menuItem.name,
        variant_name_snapshot: variantName,
        unit_price_snapshot: unitPrice,
        quantity: quantity,
        total_price: itemTotal
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const expressFee = Number(getExpressFee(normalizedOrderType).toFixed(2));
    const totalAmount = Number((subtotal + expressFee).toFixed(2));

    // 3. Generate Pickup Token, Hash & Order Number
    const pickupToken = await tokenService.generateUniqueToken(tx, pickupDateStr);
    const tokenHash = tokenService.hashToken(pickupToken);
    const orderNumber = await tokenService.generateOrderNumber(tx);

    // 4. Insert Order Record (with token_hash, order_type, pickup_date)
    const orderInsert = await tx.run(
      `INSERT INTO orders (order_number, user_id, pickup_slot_id, pickup_token, token_hash, order_type, pickup_date, subtotal, express_fee, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLACED')`,
      [orderNumber, userId, targetSlotId, pickupToken, tokenHash, normalizedOrderType, pickupDateStr, subtotal, expressFee, totalAmount]
    );

    const orderId = orderInsert.lastInsertRowid;

    // 5. Insert Order Items Snapshots
    for (const snap of snapshots) {
      await tx.run(
        `INSERT INTO order_items (order_id, menu_item_id, variant_id, item_name_snapshot, variant_name_snapshot, unit_price_snapshot, quantity, total_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, snap.menu_item_id, snap.variant_id, snap.item_name_snapshot, snap.variant_name_snapshot, snap.unit_price_snapshot, snap.quantity, snap.total_price]
      );
    }

    // 6. Create Mock/Razorpay Payment Descriptor
    const paymentDescriptor = await paymentService.createPaymentOrder({
      id: orderId,
      order_number: orderNumber,
      total_amount: totalAmount,
      user_id: userId
    });

    await tx.run(
      `INSERT INTO payments (order_id, user_id, amount, currency, payment_method, razorpay_order_id, status)
       VALUES (?, ?, ?, 'INR', ?, ?, 'PENDING')`,
      [orderId, userId, totalAmount, paymentDescriptor.payment_mode, paymentDescriptor.razorpay_order_id]
    );

    const createdOrderRow = await tx.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    const createdItems = await tx.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    const createdPayment = await tx.get('SELECT * FROM payments WHERE order_id = ?', [orderId]);

    // Student who created the order CAN see their token
    const formattedOrder = formatOrder(createdOrderRow, createdItems, slot, createdPayment, true);

    return {
      order: formattedOrder,
      payment: paymentDescriptor
    };
  });
}

/**
 * Verify payment signature and mark payment status as SUCCESS.
 */
async function verifyPayment(userId, { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const orderId = Number(order_id);
  if (!orderId || isNaN(orderId)) {
    throw new ValidationError('A valid order ID is required for payment verification.');
  }

  const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) {
    throw new NotFoundError('Order not found.');
  }

  const payment = await db.get('SELECT * FROM payments WHERE order_id = ?', [orderId]);
  if (!payment) {
    throw new NotFoundError('Payment record for this order was not found.');
  }

  // Idempotent check
  if (payment.status === 'SUCCESS') {
    const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    const slot = await db.get('SELECT * FROM pickup_slots WHERE id = ?', [order.pickup_slot_id]);
    return {
      order: formatOrder(order, items, slot, payment),
      payment,
      message: 'Payment has already been verified.'
    };
  }

  const isValid = paymentService.verifyPaymentSignature({
    razorpay_order_id: razorpay_order_id || payment.razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  });

  if (!isValid) {
    await db.run(
      `UPDATE payments 
       SET status = 'FAILED', 
           razorpay_payment_id = ?, 
           razorpay_signature = ?, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [razorpay_payment_id || null, razorpay_signature || null, payment.id]
    );
    throw new AppError('Payment signature verification failed.', 400, 'PAYMENT_VERIFICATION_FAILED');
  }

  await db.run(
    `UPDATE payments 
     SET status = 'SUCCESS', 
         razorpay_payment_id = ?, 
         razorpay_signature = ?, 
         payment_method = ?,
         updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [razorpay_payment_id || 'pay_mock_' + Date.now(), razorpay_signature || 'mock_sig', paymentService.isMockMode() ? 'MOCK' : 'RAZORPAY', payment.id]
  );

  const updatedPayment = await db.get('SELECT * FROM payments WHERE id = ?', [payment.id]);
  const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  const slot = await db.get('SELECT * FROM pickup_slots WHERE id = ?', [order.pickup_slot_id]);

  return {
    order: formatOrder(order, items, slot, updatedPayment),
    payment: updatedPayment,
    message: 'Payment verified successfully.'
  };
}

/**
 * Record payment failure or cancellation for an order.
 */
async function recordPaymentFailure(orderId, userId, reason, razorpayPaymentId) {
  const numId = Number(orderId);
  const payment = await db.get('SELECT * FROM payments WHERE order_id = ?', [numId]);
  if (payment && payment.status === 'PENDING') {
    await db.run(
      `UPDATE payments 
       SET status = 'FAILED', 
           razorpay_payment_id = COALESCE(?, razorpay_payment_id), 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [razorpayPaymentId || null, payment.id]
    );
  }
  return { success: true, message: 'Payment failure recorded' };
}

/**
 * Retrieve all orders belonging to a specific student.
 */
async function getUserOrders(userId) {
  const orders = await db.query(
    `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
    [userId]
  );

  if (!orders || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');

  const allItems = await db.query(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
    orderIds
  );

  const slotIds = [...new Set(orders.map(o => o.pickup_slot_id))];
  const slotPlaceholders = slotIds.map(() => '?').join(',');
  const allSlots = await db.query(
    `SELECT * FROM pickup_slots WHERE id IN (${slotPlaceholders})`,
    slotIds
  );

  const slotMap = new Map(allSlots.map(s => [s.id, s]));
  const itemMap = new Map();
  for (const item of allItems) {
    if (!itemMap.has(item.order_id)) itemMap.set(item.order_id, []);
    itemMap.get(item.order_id).push(item);
  }

  return orders.map(order => formatOrder(
    order,
    itemMap.get(order.id) || [],
    slotMap.get(order.pickup_slot_id) || null
  ));
}

/**
 * Retrieve a single order by ID with authorization check.
 */
async function getOrderById(orderId, userId = null, isAdmin = false) {
  const id = Number(orderId);
  if (!id || isNaN(id)) {
    throw new ValidationError('A valid order ID is required.');
  }

  const order = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) {
    throw new NotFoundError('Order not found.');
  }

  if (!isAdmin && userId && order.user_id !== userId) {
    throw new ForbiddenError('Access denied: You do not have permission to view this order.');
  }

  const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
  const slot = await db.get('SELECT * FROM pickup_slots WHERE id = ?', [order.pickup_slot_id]);
  const payment = await db.get('SELECT * FROM payments WHERE order_id = ?', [id]);

  // Token is visible ONLY to the non-admin student who placed the order
  const includeToken = Boolean(!isAdmin && userId && order.user_id === userId);
  return formatOrder(order, items, slot, payment, includeToken);
}

/**
 * Cancel an order (permitted only if PLACED or ACCEPTED) and release slot capacity.
 */
async function cancelOrder(orderId, userId = null, isAdmin = false, reason = null) {
  const id = Number(orderId);
  if (!id || isNaN(id)) {
    throw new ValidationError('A valid order ID is required.');
  }

  return await db.transaction(async (tx) => {
    const order = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      throw new NotFoundError('Order not found.');
    }

    if (!isAdmin && userId && order.user_id !== userId) {
      throw new ForbiddenError('Access denied: You cannot cancel another user\'s order.');
    }

    if (order.status === 'CANCELLED') {
      throw new AppError('Order is already cancelled.', 400, 'ALREADY_CANCELLED');
    }

    if (order.status === 'PREPARING') {
      throw new AppError('Order cannot be cancelled once it is in PREPARING status.', 400, 'CANNOT_CANCEL_PREPARING');
    }

    if (order.status === 'READY') {
      throw new AppError('Order cannot be cancelled once it is READY.', 400, 'CANNOT_CANCEL_READY');
    }

    if (order.status === 'COLLECTED') {
      throw new AppError('Order cannot be cancelled once it is COLLECTED.', 400, 'CANNOT_CANCEL_COLLECTED');
    }

    if (order.status !== 'PLACED' && order.status !== 'ACCEPTED') {
      throw new AppError(`Order in status '${order.status}' cannot be cancelled.`, 400, 'INVALID_CANCEL_STATE');
    }

    // 1. Update order status
    await tx.run(
      `UPDATE orders
       SET status = 'CANCELLED',
           cancellation_reason = ?,
           cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason || 'User cancelled', id]
    );

    // 2. Release slot capacity
    await tx.run(
      `UPDATE pickup_slots
       SET current_orders = CASE WHEN current_orders > 0 THEN current_orders - 1 ELSE 0 END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [order.pickup_slot_id]
    );

    // 3. Mark payment as refunded if completed
    await tx.run(
      `UPDATE payments
       SET status = 'REFUNDED',
           updated_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND status != 'REFUNDED'`,
      [id]
    );

    const updatedOrder = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
    const items = await tx.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const slot = await tx.get('SELECT * FROM pickup_slots WHERE id = ?', [order.pickup_slot_id]);

    return formatOrder(updatedOrder, items, slot);
  });
}

/**
 * Transition order status through the deterministic state machine.
 */
async function advanceOrderStatus(orderId, targetStatus) {
  const id = Number(orderId);
  if (!id || isNaN(id)) {
    throw new ValidationError('A valid order ID is required.');
  }

  const validStatuses = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'CANCELLED'];
  const normalizedTarget = (targetStatus || '').toUpperCase();

  if (!validStatuses.includes(normalizedTarget)) {
    throw new ValidationError(`Invalid target status '${targetStatus}'. Must be one of: ${validStatuses.join(', ')}`);
  }

  return await db.transaction(async (tx) => {
    const order = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      throw new NotFoundError('Order not found.');
    }

    const currentStatus = order.status;
    const allowedNext = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(normalizedTarget)) {
      throw new AppError(
        `Invalid state transition from ${currentStatus} to ${normalizedTarget}.`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }

    let readyAt = order.ready_at;
    let collectedAt = order.collected_at;
    let cancelledAt = order.cancelled_at;

    if (normalizedTarget === 'READY') {
      readyAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    } else if (normalizedTarget === 'COLLECTED') {
      collectedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    } else if (normalizedTarget === 'CANCELLED') {
      cancelledAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      // Release slot capacity on cancellation
      await tx.run(
        'UPDATE pickup_slots SET current_orders = CASE WHEN current_orders > 0 THEN current_orders - 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [order.pickup_slot_id]
      );
    }

    await tx.run(
      `UPDATE orders
       SET status = ?,
           ready_at = ?,
           collected_at = ?,
           cancelled_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedTarget, readyAt, collectedAt, cancelledAt, id]
    );

    const updatedOrder = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
    const items = await tx.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const slot = await tx.get('SELECT * FROM pickup_slots WHERE id = ?', [order.pickup_slot_id]);

    // Admin state change returns without token
    return formatOrder(updatedOrder, items, slot, null, false);
  });
}

/**
 * Verify 4-character pickup token at Express Counter using SHA-256 hash matching.
 * Staff NEVER sees the pickup token; backend compares entered token against token_hash.
 */
async function verifyPickupToken(rawToken) {
  const sanitized = tokenService.sanitizeToken(rawToken);

  if (!sanitized || sanitized.length !== tokenService.TOKEN_LENGTH) {
    throw new ValidationError('Pickup token must be exactly 4 characters.');
  }

  // Hash the incoming token using SHA-256
  const incomingHash = tokenService.hashToken(sanitized);

  // Look up by token_hash first, with fallback to plaintext for legacy orders
  let order = await db.get(
    `SELECT * FROM orders WHERE token_hash = ? ORDER BY id DESC LIMIT 1`,
    [incomingHash]
  );

  if (!order) {
    // Fallback: check plaintext token
    order = await db.get(
      `SELECT * FROM orders WHERE UPPER(pickup_token) = ? ORDER BY id DESC LIMIT 1`,
      [sanitized]
    );
  }

  if (!order) {
    throw new NotFoundError('No order found matching the provided pickup token.');
  }

  if (order.status === 'COLLECTED') {
    throw new AppError(`Order #${order.order_number} has already been collected.`, 400, 'ORDER_ALREADY_COLLECTED');
  }

  if (order.status === 'CANCELLED') {
    throw new AppError(`Order #${order.order_number} was cancelled and cannot be collected.`, 400, 'ORDER_CANCELLED');
  }

  if (order.status !== 'READY') {
    throw new AppError(
      `Order #${order.order_number} is not ready for pickup (current status: ${order.status}). Must be READY.`,
      400,
      'ORDER_NOT_READY'
    );
  }

  const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  const slot = await db.get('SELECT * FROM pickup_slots WHERE id = ?', [order.pickup_slot_id]);
  const payment = await db.get('SELECT * FROM payments WHERE order_id = ?', [order.id]);

  // Strip token from response to staff
  return formatOrder(order, items, slot, payment, false);
}

/**
 * Fetch orders for admin dashboard.
 * Tokens are strictly stripped from all returned orders.
 */
async function getAdminOrders({ status, date, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status.toUpperCase());
  }

  if (date) {
    sql += ' AND (DATE(created_at) = ? OR pickup_date = ? OR pickup_slot_id IN (SELECT id FROM pickup_slots WHERE slot_date = ?))';
    params.push(date, date, date);
  }

  sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit) || 50, Number(offset) || 0);

  const orders = await db.query(sql, params);
  if (!orders || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');

  const allItems = await db.query(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
    orderIds
  );

  const slotIds = [...new Set(orders.map(o => o.pickup_slot_id))];
  const slotPlaceholders = slotIds.map(() => '?').join(',');
  const allSlots = await db.query(
    `SELECT * FROM pickup_slots WHERE id IN (${slotPlaceholders})`,
    slotIds
  );

  const slotMap = new Map(allSlots.map(s => [s.id, s]));
  const itemMap = new Map();
  for (const item of allItems) {
    if (!itemMap.has(item.order_id)) itemMap.set(item.order_id, []);
    itemMap.get(item.order_id).push(item);
  }

  // Tokens are stripped from admin view (includeToken = false)
  return orders.map(order => formatOrder(
    order,
    itemMap.get(order.id) || [],
    slotMap.get(order.pickup_slot_id) || null,
    null,
    false
  ));
}

/**
 * Compute real-time analytics dashboard metrics.
 */
async function getAdminAnalytics(targetDate = null) {
  const dateStr = targetDate || new Date().toISOString().split('T')[0];

  // 1. Total orders today (excluding CANCELLED)
  const orderCountRow = await db.get(
    `SELECT COUNT(*) as count FROM orders 
     WHERE status != 'CANCELLED' 
       AND (DATE(created_at) = ? OR pickup_date = ? OR pickup_slot_id IN (SELECT id FROM pickup_slots WHERE slot_date = ?))`,
    [dateStr, dateStr, dateStr]
  );
  const todayOrders = orderCountRow ? orderCountRow.count : 0;

  // 2. Revenue today (excluding CANCELLED)
  const revenueRow = await db.get(
    `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders 
     WHERE status != 'CANCELLED' 
       AND (DATE(created_at) = ? OR pickup_date = ? OR pickup_slot_id IN (SELECT id FROM pickup_slots WHERE slot_date = ?))`,
    [dateStr, dateStr, dateStr]
  );
  const todayRevenue = revenueRow ? Number(revenueRow.total) : 0;

  // 3. Status breakdown
  const statusRows = await db.query(
    `SELECT status, COUNT(*) as count FROM orders 
     WHERE DATE(created_at) = ? OR pickup_date = ? OR pickup_slot_id IN (SELECT id FROM pickup_slots WHERE slot_date = ?)
     GROUP BY status`,
    [dateStr, dateStr, dateStr]
  );

  const statusBreakdown = {
    PLACED: 0,
    ACCEPTED: 0,
    PREPARING: 0,
    READY: 0,
    COLLECTED: 0,
    CANCELLED: 0
  };

  for (const row of statusRows) {
    if (statusBreakdown[row.status] !== undefined) {
      statusBreakdown[row.status] = row.count;
    }
  }

  // 4. Popular Items Today
  const popularItems = await db.query(
    `SELECT oi.item_name_snapshot as name, SUM(oi.quantity) as total_quantity, SUM(oi.total_price) as total_sales
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE o.status != 'CANCELLED'
       AND (DATE(o.created_at) = ? OR o.pickup_date = ? OR o.pickup_slot_id IN (SELECT id FROM pickup_slots WHERE slot_date = ?))
     GROUP BY oi.menu_item_id, oi.item_name_snapshot
     ORDER BY total_quantity DESC
     LIMIT 5`,
    [dateStr, dateStr, dateStr]
  );

  // 5. Peak Slots Today (using CONCAT for MySQL)
  const peakSlots = await db.query(
    `SELECT ps.id, ps.start_time, ps.end_time, ps.max_capacity, ps.current_orders,
            CONCAT(ps.start_time, ' - ', ps.end_time) as time_window
     FROM pickup_slots ps
     WHERE ps.slot_date = ?
     ORDER BY ps.current_orders DESC
     LIMIT 5`,
    [dateStr]
  );

  return {
    date: dateStr,
    today_orders: todayOrders,
    today_revenue: todayRevenue,
    status_breakdown: statusBreakdown,
    popular_items: popularItems,
    peak_slots: peakSlots
  };
}

module.exports = {
  createOrder,
  verifyPayment,
  recordPaymentFailure,
  retryPayment: paymentService.retryPaymentOrder,
  getUserOrders,
  getOrderById,
  cancelOrder,
  advanceOrderStatus,
  verifyPickupToken,
  getAdminOrders,
  getAdminAnalytics,
  getExpressFee,
  VALID_TRANSITIONS
};
