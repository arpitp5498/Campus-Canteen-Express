/**
 * Campus Canteen Express — Orders Page Controller
 * Handles student order history, live status tracking timeline,
 * private pickup token display, order cancellation, and re-ordering.
 */

let studentOrders = [];
let activeFilter = 'ALL';
let pendingCancelOrderId = null;

document.addEventListener('DOMContentLoaded', () => {
    requireAuth();
    initFilterTabs();
    checkConfirmation();
    loadOrders();
});

/* ───────── Order Confirmation Banner ───────── */

function checkConfirmation() {
    const urlParams = new URLSearchParams(window.location.search);
    const confirmedOrderId = urlParams.get('confirmed');

    if (confirmedOrderId) {
        apiFetch(`/orders/${confirmedOrderId}`)
            .then(res => {
                if (res.success && res.data) {
                    const orderObj = res.data.order || res.data;
                    showConfirmationCard(orderObj);
                }
            })
            .catch(err => console.error('Error fetching confirmed order:', err));

        // Clean URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function showConfirmationCard(order) {
    const card = document.getElementById('confirmation-card');
    if (!card) return;

    const numEl = document.getElementById('confirm-order-number');
    const tokenEl = document.getElementById('confirm-token-value');
    const slotEl = document.getElementById('confirm-slot-time');

    if (numEl) numEl.textContent = `Order #${order.order_number || order.id}`;
    if (tokenEl) tokenEl.textContent = order.pickup_token || '----';

    const orderType = order.order_type || 'TODAY';
    const typeLabel = orderType === 'TOMORROW' ? "📅 Tomorrow's Lunch" : "🍽️ Today's Lunch";

    let slotTime = typeLabel;
    if (order.slot) {
        const start = typeof formatSlotTime === 'function' ? formatSlotTime(order.slot.start_time) : order.slot.start_time;
        const end = typeof formatSlotTime === 'function' ? formatSlotTime(order.slot.end_time) : order.slot.end_time;
        slotTime = `${typeLabel} &bull; Pickup: ${start} - ${end}`;
    } else if (order.slot_time) {
        slotTime = `${typeLabel} &bull; Pickup: ${order.slot_time}`;
    }
    if (slotEl) slotEl.innerHTML = slotTime;

    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth' });
}

function dismissConfirmationCard() {
    const card = document.getElementById('confirmation-card');
    if (card) card.style.display = 'none';
}

/* ───────── Filter Tabs ───────── */

function initFilterTabs() {
    document.querySelectorAll('.filter-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.getAttribute('data-filter') || 'ALL';
            renderOrders();
        });
    });
}

/* ───────── Load Orders from API ───────── */

async function loadOrders() {
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const emptyState = document.getElementById('empty-state');
    const ordersList = document.getElementById('orders-list');

    if (loadingState) loadingState.style.display = 'block';
    if (errorState) errorState.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (ordersList) ordersList.innerHTML = '';

    try {
        const res = await apiFetch('/orders/my-orders');
        if (loadingState) loadingState.style.display = 'none';

        if (res.success) {
            studentOrders = Array.isArray(res.data?.orders) ? res.data.orders : (Array.isArray(res.data) ? res.data : []);
            renderOrders();
        } else {
            throw new Error(res.message || 'Failed to load your orders.');
        }
    } catch (err) {
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) errorState.style.display = 'block';
        const msgEl = document.getElementById('error-message');
        if (msgEl) msgEl.textContent = err.message || 'Unable to connect to order service.';
        if (typeof showToast === 'function') showToast(err.message, 'error');
    }
}

/* ───────── Render Orders List ───────── */

function renderOrders() {
    const ordersList = document.getElementById('orders-list');
    const emptyState = document.getElementById('empty-state');
    if (!ordersList || !emptyState) return;

    ordersList.innerHTML = '';

    const filtered = studentOrders.filter(order => {
        const status = (order.status || 'PLACED').toUpperCase();
        if (activeFilter === 'ALL') return true;
        if (activeFilter === 'ACTIVE') return ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'].includes(status);
        if (activeFilter === 'COMPLETED') return status === 'COLLECTED';
        if (activeFilter === 'CANCELLED') return status === 'CANCELLED';
        return true;
    });

    if (filtered.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    filtered.forEach(order => {
        const card = createOrderCard(order);
        ordersList.appendChild(card);
    });
}

function createOrderCard(order) {
    const el = document.createElement('div');
    el.className = 'order-card';

    const status = (order.status || 'PLACED').toUpperCase();
    const orderNum = order.order_number || String(order.id).substring(0, 8);
    const orderDate = new Date(order.created_at || Date.now()).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    // Lunch Type Badge
    const orderType = order.order_type || 'TODAY';
    const typeBadge = orderType === 'TOMORROW'
        ? `<span style="background-color: #EFF6FF; color: #1D4ED8; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 700;">📅 Tomorrow's Lunch</span>`
        : `<span style="background-color: #F0FDF4; color: #16A34A; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 700;">🍽️ Today's Lunch</span>`;

    // Status Badge
    const badgeHtml = typeof getStatusBadgeHtml === 'function' 
        ? getStatusBadgeHtml(status) 
        : `<span class="badge">${status}</span>`;

    // 5-Step Visual Timeline
    let timelineHtml = '';
    if (status === 'CANCELLED') {
        timelineHtml = `
            <div class="status-timeline">
                <div class="timeline-step completed">
                    <div class="timeline-dot">✓</div>
                    <div class="timeline-label">Placed</div>
                </div>
                <div class="timeline-step cancelled">
                    <div class="timeline-dot">✕</div>
                    <div class="timeline-label">Cancelled</div>
                </div>
            </div>
        `;
    } else {
        const steps = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED'];
        const labels = ['Placed', 'Accepted', 'Preparing', 'Ready', 'Collected'];
        const currentIndex = steps.indexOf(status);

        timelineHtml = '<div class="status-timeline">';
        steps.forEach((step, idx) => {
            let stepClass = '';
            let dotContent = idx + 1;
            if (idx < currentIndex) {
                stepClass = 'completed';
                dotContent = '✓';
            } else if (idx === currentIndex) {
                stepClass = 'active';
                dotContent = '●';
            }
            timelineHtml += `
                <div class="timeline-step ${stepClass}">
                    <div class="timeline-dot">${dotContent}</div>
                    <div class="timeline-label">${labels[idx]}</div>
                </div>
            `;
        });
        timelineHtml += '</div>';
    }

    // Items list
    const items = order.items || order.order_items || [];
    let itemsHtml = '';
    items.forEach(i => {
        const name = i.item_name || i.item_name_snapshot || i.name || i.item?.name || 'Item';
        const varName = i.variant_name || i.variant_name_snapshot || (i.variant ? i.variant.variant_name : null);
        const qty = i.quantity || 1;
        const unitPrice = parseFloat(i.unit_price || i.unit_price_snapshot || i.price || 0);
        const itemTotal = unitPrice * qty;

        itemsHtml += `
            <div class="order-item-line">
                <div>
                    <strong>${qty}x</strong> ${escapeHtml(name)}
                    ${varName ? `<div style="font-size: 0.78rem; color: var(--muted);">${escapeHtml(varName)}</div>` : ''}
                </div>
                <div style="font-weight: 600;">₹${itemTotal.toFixed(2)}</div>
            </div>
        `;
    });

    // Slot display
    let slotDisplay = '12:00 PM - 1:00 PM';
    if (order.slot) {
        const start = typeof formatSlotTime === 'function' ? formatSlotTime(order.slot.start_time) : order.slot.start_time;
        const end = typeof formatSlotTime === 'function' ? formatSlotTime(order.slot.end_time) : order.slot.end_time;
        slotDisplay = `${start} - ${end}`;
    } else if (order.slot_time) {
        slotDisplay = order.slot_time;
    }

    // Private pickup token card (Visible strictly to the student)
    let tokenHtml = '';
    if (order.pickup_token && status !== 'CANCELLED') {
        tokenHtml = `
            <div class="token-private-badge">
                <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: #15803D; letter-spacing: 0.05em;">
                    🔒 Pickup Token (Show at Counter)
                </div>
                <div style="font-family: monospace; font-size: 1.8rem; font-weight: 900; letter-spacing: 0.2rem; color: #15803D; margin: 0.15rem 0;">
                    ${order.pickup_token}
                </div>
                <div style="font-size: 0.75rem; color: var(--muted);">
                    ${status === 'READY' ? '🎉 Ready now! Proceed to Express Counter.' : 'Show when order status changes to READY.'}
                </div>
            </div>
        `;
    }

    // Cancellation button (Permitted strictly for PLACED or ACCEPTED)
    const canCancel = (status === 'PLACED' || status === 'ACCEPTED');
    const cancelBtn = canCancel 
        ? `<button type="button" class="btn btn-outline btn-sm" onclick="openCancelModal('${order.id}')" style="color: #EF4444; border-color: #FCA5A5;">
            Cancel Order
           </button>` 
        : '';

    // Reorder button
    const reorderBtn = `
        <button type="button" class="btn btn-outline btn-sm" onclick='reorderItems(${JSON.stringify(items).replace(/'/g, "&apos;")})'>
            🔄 Order Again
        </button>
    `;

    el.innerHTML = `
        <div class="order-header">
            <div class="order-title-group">
                <h3>Order #${orderNum}</h3>
                <div class="order-timestamp">Placed on ${orderDate}</div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                ${typeBadge}
                ${badgeHtml}
            </div>
        </div>

        ${timelineHtml}

        <div class="order-content-grid">
            <div>
                <div class="items-section-title">Items Ordered</div>
                <div style="background: var(--white);">
                    ${itemsHtml}
                </div>
            </div>

            <div>
                <div class="items-section-title">Pickup Details</div>
                <div class="pickup-box">
                    <div style="font-size: 0.8rem; color: var(--muted); margin-bottom: 0.25rem;">Assigned Window</div>
                    <div style="font-weight: 700; color: var(--text);">${slotDisplay}</div>
                    <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem;">Pickup Date: ${order.pickup_date || 'Today'}</div>
                    ${tokenHtml}
                </div>
            </div>
        </div>

        <div class="order-footer-bar">
            <div>
                <span style="font-size: 0.9rem; color: var(--muted);">Total Paid: </span>
                <span style="font-size: 1.25rem; font-weight: 800; color: var(--text);">₹${parseFloat(order.total_amount || 0).toFixed(2)}</span>
            </div>
            <div class="order-actions-group">
                ${cancelBtn}
                ${reorderBtn}
            </div>
        </div>
    `;

    return el;
}

/* ───────── Cancellation Modal ───────── */

function openCancelModal(orderId) {
    pendingCancelOrderId = orderId;
    const modal = document.getElementById('cancel-modal');
    const confirmBtn = document.getElementById('confirm-cancel-btn');

    if (confirmBtn) {
        confirmBtn.onclick = executeCancellation;
    }
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeCancelModal() {
    pendingCancelOrderId = null;
    const modal = document.getElementById('cancel-modal');
    if (modal) modal.style.display = 'none';
}

async function executeCancellation() {
    if (!pendingCancelOrderId) return;
    const orderId = pendingCancelOrderId;
    const confirmBtn = document.getElementById('confirm-cancel-btn');

    if (confirmBtn) {
        confirmBtn.textContent = 'Cancelling...';
        confirmBtn.disabled = true;
    }

    try {
        const res = await apiFetch(`/orders/${orderId}/cancel`, {
            method: 'POST'
        });

        if (res.success) {
            showToast('Order cancelled successfully. Slot spot released.', 'success');
            closeCancelModal();
            loadOrders();
        } else {
            throw new Error(res.message || 'Failed to cancel order.');
        }
    } catch (err) {
        showToast(err.message || 'Unable to cancel order.', 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.textContent = 'Confirm Cancellation';
            confirmBtn.disabled = false;
        }
    }
}

/* ───────── Reorder Functionality ───────── */

function reorderItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        showToast('No items available to reorder', 'warning');
        return;
    }

    let addedCount = 0;
    items.forEach(i => {
        const itemObj = {
            id: i.menu_item_id || i.item_id || i.id,
            name: i.item_name || i.item_name_snapshot || i.name,
            price: i.unit_price || i.unit_price_snapshot || i.price,
            base_price: i.unit_price || i.unit_price_snapshot || i.price
        };

        const variantObj = i.variant_id ? {
            id: i.variant_id,
            variant_name: i.variant_name || i.variant_name_snapshot,
            price: i.unit_price || i.unit_price_snapshot || i.price
        } : null;

        const qty = i.quantity || 1;
        for (let q = 0; q < qty; q++) {
            addToCart(itemObj, variantObj);
            addedCount++;
        }
    });

    showToast(`Added ${addedCount} items to your cart!`, 'success');
    setTimeout(() => {
        window.location.href = '/cart.html';
    }, 600);
}

// Global window bindings for inline HTML onclick handlers
window.openCancelModal = openCancelModal;
window.closeCancelModal = closeCancelModal;
window.dismissConfirmationCard = dismissConfirmationCard;
window.reorderItems = reorderItems;

