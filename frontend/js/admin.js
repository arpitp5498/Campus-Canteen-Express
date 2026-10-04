/**
 * Campus Canteen Express — Canteen Staff & Admin Portal Controller
 * Manages operational metrics, live order progression, private token verification,
 * and menu catalog management.
 */

let allAdminOrders = [];
let activeStatusFilter = '';
let currentSearchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
    // Check auth
    if (typeof requireAdminAuth === 'function') {
        const isOk = requireAdminAuth();
        if (!isOk) return;
    } else {
        const user = JSON.parse(localStorage.getItem('cce_user') || '{}');
        if (!user.role || (user.role !== 'ADMIN' && user.role !== 'CANTEEN_STAFF')) {
            if (typeof showToast === 'function') showToast('Admin access required.', 'error');
            window.location.href = 'login.html';
            return;
        }
    }

    initTabs();
    initFilterPills();
    initSearch();
    initTokenVerifier();
    initMenuForm();

    // Default tab
    loadDashboard();
});

/* ───────── Tabs Setup ───────── */

function initTabs() {
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const contentEl = document.getElementById(`tab-${tabId}`);
            if (contentEl) contentEl.classList.add('active');

            if (tabId === 'dashboard') loadDashboard();
            if (tabId === 'orders') loadAdminOrders();
            if (tabId === 'menu') loadAdminMenu();
            if (tabId === 'verify') {
                const input = document.getElementById('pickup-token-input');
                if (input) setTimeout(() => input.focus(), 100);
            }
        });
    });
}

/* ───────── Filters & Search ───────── */

function initFilterPills() {
    const filterPills = document.querySelectorAll('.filter-pill');
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeStatusFilter = pill.getAttribute('data-status') || '';
            renderAdminOrders();
        });
    });
}

function initSearch() {
    const searchInput = document.getElementById('admin-orders-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = (e.target.value || '').toLowerCase().trim();
            renderAdminOrders();
        });
    }
}

/* ───────── Dashboard Tab ───────── */

async function loadDashboard() {
    const loading = document.getElementById('dashboard-loading');
    const content = document.getElementById('dashboard-content');
    if (!loading || !content) return;

    loading.style.display = 'block';
    content.style.display = 'none';

    try {
        const res = await apiFetch('/admin/analytics/dashboard');
        loading.style.display = 'none';

        if (res.success && res.data) {
            const stats = res.data.stats || res.data;
            const breakdown = stats.status_breakdown || {};

            // KPIs
            const totalOrdersEl = document.getElementById('stat-total-orders');
            const revenueEl = document.getElementById('stat-revenue');
            const preparingEl = document.getElementById('stat-preparing');
            const readyEl = document.getElementById('stat-ready');
            const collectedEl = document.getElementById('stat-collected');

            if (totalOrdersEl) totalOrdersEl.textContent = stats.today_orders ?? 0;
            if (revenueEl) revenueEl.textContent = typeof formatPrice === 'function' ? formatPrice(stats.today_revenue || 0) : `₹${parseFloat(stats.today_revenue || 0).toFixed(2)}`;
            if (preparingEl) preparingEl.textContent = breakdown.PREPARING ?? 0;
            if (readyEl) readyEl.textContent = breakdown.READY ?? 0;
            if (collectedEl) collectedEl.textContent = breakdown.COLLECTED ?? 0;

            // Popular Items Widget
            renderPopularItems(stats.popular_items || []);

            // Peak Slots Widget
            renderPeakSlots(stats.peak_slots || []);

            content.style.display = 'block';
        } else {
            throw new Error(res.message || 'Failed to load dashboard metrics.');
        }
    } catch (err) {
        loading.style.display = 'none';
        if (typeof showToast === 'function') showToast(err.message, 'error');
    }
}

function renderPopularItems(items) {
    const container = document.getElementById('popular-items-list');
    if (!container) return;

    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = '<p style="color: var(--muted); font-size: 0.9rem;">No orders recorded yet today.</p>';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    items.forEach((item, idx) => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                <div>
                    <span style="font-weight: 700; margin-right: 0.5rem;">#${idx + 1}</span>
                    <span style="font-weight: 600;">${escapeHtml(item.name)}</span>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700; color: var(--primary-dark);">${item.total_quantity} ordered</div>
                    <div style="font-size: 0.75rem; color: var(--muted);">₹${parseFloat(item.total_sales || 0).toFixed(2)}</div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderPeakSlots(slots) {
    const container = document.getElementById('peak-slots-list');
    if (!container) return;

    if (!Array.isArray(slots) || slots.length === 0) {
        container.innerHTML = '<p style="color: var(--muted); font-size: 0.9rem;">No slot activity recorded.</p>';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    slots.forEach(slot => {
        const filled = slot.current_orders ?? 0;
        const cap = slot.max_capacity ?? 15;
        const pct = Math.min(100, Math.round((filled / cap) * 100));

        html += `
            <div style="padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 600; margin-bottom: 0.35rem;">
                    <span>${slot.time_window || `${slot.start_time} - ${slot.end_time}`}</span>
                    <span style="color: ${pct >= 100 ? '#EF4444' : pct >= 70 ? '#D97706' : '#16A34A'};">${filled} / ${cap} orders</span>
                </div>
                <div style="height: 6px; background: #E2E8F0; border-radius: 999px; overflow: hidden;">
                    <div style="width: ${pct}%; height: 100%; background: ${pct >= 100 ? '#EF4444' : '#16A34A'};"></div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

/* ───────── Orders Board Tab ───────── */

async function loadAdminOrders() {
    const loading = document.getElementById('admin-orders-loading');
    const empty = document.getElementById('admin-orders-empty');
    const grid = document.getElementById('admin-orders-grid');
    if (!loading || !empty || !grid) return;

    loading.style.display = 'block';
    empty.style.display = 'none';
    grid.innerHTML = '';

    try {
        const res = await apiFetch('/admin/orders');
        loading.style.display = 'none';

        if (res.success) {
            allAdminOrders = Array.isArray(res.data?.orders) ? res.data.orders : (Array.isArray(res.data) ? res.data : []);
            renderAdminOrders();
        } else {
            throw new Error(res.message || 'Failed to fetch admin orders.');
        }
    } catch (err) {
        loading.style.display = 'none';
        if (typeof showToast === 'function') showToast(err.message, 'error');
    }
}

function renderAdminOrders() {
    const empty = document.getElementById('admin-orders-empty');
    const grid = document.getElementById('admin-orders-grid');
    if (!empty || !grid) return;

    grid.innerHTML = '';

    const filtered = allAdminOrders.filter(order => {
        const status = (order.status || 'PLACED').toUpperCase();

        // Status pill matching
        if (activeStatusFilter === 'INCOMING') {
            if (status !== 'PLACED' && status !== 'ACCEPTED') return false;
        } else if (activeStatusFilter === 'PREPARING') {
            if (status !== 'PREPARING') return false;
        } else if (activeStatusFilter === 'READY') {
            if (status !== 'READY') return false;
        } else if (activeStatusFilter === 'COLLECTED') {
            if (status !== 'COLLECTED' && status !== 'CANCELLED') return false;
        }

        // Search matching
        if (currentSearchQuery) {
            const num = (order.order_number || String(order.id)).toLowerCase();
            const student = (order.user?.name || '').toLowerCase();
            if (!num.includes(currentSearchQuery) && !student.includes(currentSearchQuery)) {
                return false;
            }
        }

        return true;
    });

    if (filtered.length === 0) {
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';

    filtered.forEach(order => {
        const card = createAdminOrderCard(order);
        grid.appendChild(card);
    });
}

function createAdminOrderCard(order) {
    const el = document.createElement('div');
    el.className = 'admin-order-card';

    const status = (order.status || 'PLACED').toUpperCase();
    const orderNum = order.order_number || String(order.id).substring(0, 8);
    const studentName = order.user?.name || 'Student';
    const timestamp = new Date(order.created_at || Date.now()).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    // Badge
    const badgeHtml = typeof getStatusBadgeHtml === 'function' 
        ? getStatusBadgeHtml(status) 
        : `<span class="badge">${status}</span>`;

    // Order type badge
    const orderType = order.order_type || 'TODAY';
    const typeBadge = orderType === 'TOMORROW'
        ? `<span style="background: #EFF6FF; color: #1D4ED8; font-size: 0.725rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">📅 Tomorrow</span>`
        : `<span style="background: #F0FDF4; color: #16A34A; font-size: 0.725rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">🍽️ Today</span>`;

    // Next Status Action Button
    let actionBtnHtml = '';
    if (status === 'PLACED') {
        actionBtnHtml = `<button type="button" class="btn btn-outline btn-sm" onclick="advanceStatus('${order.id}', 'ACCEPTED')">Accept Order</button>`;
    } else if (status === 'ACCEPTED') {
        actionBtnHtml = `<button type="button" class="btn btn-primary btn-sm" onclick="advanceStatus('${order.id}', 'PREPARING')">🍳 Start Preparing</button>`;
    } else if (status === 'PREPARING') {
        actionBtnHtml = `<button type="button" class="btn btn-primary btn-sm" onclick="advanceStatus('${order.id}', 'READY')">✅ Mark Ready</button>`;
    } else if (status === 'READY') {
        actionBtnHtml = `<span style="font-size: 0.8rem; color: #16A34A; font-weight: 700;">Ready for Counter Verify</span>`;
    }

    // Slot display
    let slotDisplay = '12:00 PM - 1:00 PM';
    if (order.slot) {
        const start = typeof formatSlotTime === 'function' ? formatSlotTime(order.slot.start_time) : order.slot.start_time;
        const end = typeof formatSlotTime === 'function' ? formatSlotTime(order.slot.end_time) : order.slot.end_time;
        slotDisplay = `${start} - ${end}`;
    }

    // Items list
    const items = order.items || order.order_items || [];
    const itemsHtml = items.map(i => {
        const name = i.item_name || i.item_name_snapshot || i.name || 'Item';
        const vName = i.variant_name || i.variant_name_snapshot;
        return `<div><strong>${i.quantity}x</strong> ${escapeHtml(name)}${vName ? ` <span style="color:var(--muted);font-size:0.75rem;">(${escapeHtml(vName)})</span>` : ''}</div>`;
    }).join('');

    // NOTE: Pickup token is NEVER exposed to staff on order cards (Privacy enforced)
    el.innerHTML = `
        <div class="admin-order-card-header">
            <div>
                <h4 style="font-size: 1.1rem; font-weight: 800; margin: 0 0 0.15rem 0;">#${orderNum}</h4>
                <div style="font-size: 0.85rem; font-weight: 600; color: var(--text);">${escapeHtml(studentName)}</div>
            </div>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
                ${typeBadge}
                ${badgeHtml}
            </div>
        </div>

        <div class="order-meta-box">
            <div><strong>Window:</strong> ${slotDisplay}</div>
            <div><strong>Date:</strong> ${order.pickup_date || 'Today'} &bull; <strong>Time:</strong> ${timestamp}</div>
        </div>

        <div class="order-items-preview">
            ${itemsHtml}
        </div>

        <div class="order-card-footer">
            <span style="font-weight: 800; font-size: 1.05rem;">₹${parseFloat(order.total_amount || 0).toFixed(2)}</span>
            <div>${actionBtnHtml}</div>
        </div>
    `;

    return el;
}

async function advanceStatus(orderId, nextStatus) {
    try {
        const res = await apiFetch(`/admin/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus })
        });

        if (res.success) {
            showToast(`Order status updated to ${nextStatus}`, 'success');
            loadAdminOrders();
        } else {
            throw new Error(res.message || 'Status transition failed.');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ───────── Express Counter Verification Tab ───────── */

function initTokenVerifier() {
    const btn = document.getElementById('verify-token-btn');
    const input = document.getElementById('pickup-token-input');

    if (btn) btn.addEventListener('click', verifyPickupToken);

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') verifyPickupToken();
        });
        input.addEventListener('input', () => {
            input.value = input.value.toUpperCase();
        });
    }
}

async function verifyPickupToken() {
    const input = document.getElementById('pickup-token-input');
    const token = (input.value || '').trim().toUpperCase();
    const resultBox = document.getElementById('verify-result');
    if (!token || token.length !== 4) {
        showToast('Please enter a valid 4-character pickup token', 'warning');
        return;
    }

    const btn = document.getElementById('verify-token-btn');
    const origText = btn.textContent;
    btn.textContent = 'Verifying Token...';
    btn.disabled = true;

    try {
        const res = await apiFetch('/admin/orders/verify-token', {
            method: 'POST',
            body: JSON.stringify({ pickup_token: token })
        });

        btn.textContent = origText;
        btn.disabled = false;

        if (res.success && res.data) {
            const order = res.data.order || res.data;
            const items = order.items || order.order_items || [];
            const itemsList = items.map(i => `<li><strong>${i.quantity}x</strong> ${escapeHtml(i.item_name || i.name)}</li>`).join('');

            resultBox.style.display = 'block';
            resultBox.innerHTML = `
                <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1rem;">
                    <div style="font-weight: 800; font-size: 1.15rem; color: #15803D; margin-bottom: 0.35rem;">
                        ✅ Token Verified Match!
                    </div>
                    <div style="font-size: 0.95rem; font-weight: 700; color: var(--text);">
                        Order #${order.order_number || String(order.id).substring(0, 8)} &bull; ${escapeHtml(order.user?.name || 'Student')}
                    </div>
                    ${order.payment?.payment_method === 'CASH' && order.payment?.status !== 'SUCCESS' ? `
                        <div style="margin-top: 0.65rem; background: #FEF3C7; border: 1.5px solid #F59E0B; border-radius: var(--radius-sm); padding: 0.6rem 0.85rem; color: #92400E; font-weight: 800; font-size: 0.95rem;">
                            💵 COLLECT CASH AT COUNTER: ₹${parseFloat(order.total_amount || 0).toFixed(2)}
                        </div>
                    ` : `
                        <div style="margin-top: 0.5rem; color: #15803D; font-weight: 700; font-size: 0.85rem;">
                            ✅ Paid Online (₹${parseFloat(order.total_amount || 0).toFixed(2)})
                        </div>
                    `}
                    <ul style="margin: 0.75rem 0 0 1.25rem; font-size: 0.9rem; line-height: 1.6;">
                        ${itemsList}
                    </ul>
                </div>

                ${order.status === 'READY' ? `
                    <button type="button" class="btn btn-primary" onclick="markTokenCollected('${order.id}')" style="width: 100%; padding: 0.9rem; font-size: 1.05rem; font-weight: 800;">
                        🎉 Handover Food &amp; Mark as Collected
                    </button>
                ` : `
                    <div style="background: #FFFBEB; border: 1px solid #FCD34D; color: #B45309; padding: 0.85rem; border-radius: var(--radius-sm); font-size: 0.9rem; font-weight: 600;">
                        ⚠️ Order status is currently <strong>${order.status}</strong>. Food must be marked READY before final handover.
                    </div>
                `}
            `;
            input.value = '';
        } else {
            throw new Error(res.message || 'Token verification failed.');
        }
    } catch (err) {
        btn.textContent = origText;
        btn.disabled = false;

        resultBox.style.display = 'block';
        resultBox.innerHTML = `
            <div style="background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: var(--radius); padding: 1.25rem; color: #991B1B;">
                <div style="font-weight: 800; font-size: 1.05rem; margin-bottom: 0.25rem;">
                    ❌ Invalid or Expired Token
                </div>
                <div style="font-size: 0.875rem;">${escapeHtml(err.message || 'No matching active order found.')}</div>
            </div>
        `;
    }
}

async function markTokenCollected(orderId) {
    try {
        const res = await apiFetch(`/admin/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'COLLECTED' })
        });

        if (res.success) {
            showToast('Order successfully marked as COLLECTED!', 'success');
            document.getElementById('verify-result').innerHTML = `
                <div style="background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: var(--radius); padding: 1.25rem; text-align: center; color: #15803D;">
                    <div style="font-size: 2rem; margin-bottom: 0.25rem;">🎉</div>
                    <div style="font-weight: 800; font-size: 1.15rem;">Collection Complete</div>
                    <p style="font-size: 0.85rem; margin-top: 0.25rem;">Order handover completed successfully.</p>
                </div>
            `;
        } else {
            throw new Error(res.message || 'Failed to update order to collected.');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

/* ───────── Menu Management Tab ───────── */

async function loadAdminMenu() {
    const loading = document.getElementById('menu-loading');
    const container = document.getElementById('menu-table-container');
    const tbody = document.getElementById('menu-table-body');
    if (!loading || !container || !tbody) return;

    loading.style.display = 'block';
    container.style.display = 'none';
    tbody.innerHTML = '';

    try {
        const res = await apiFetch('/menu');
        loading.style.display = 'none';

        if (res.success) {
            const items = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data) ? res.data : []);
            items.forEach(item => {
                const tr = document.createElement('tr');
                const price = parseFloat(item.base_price || item.price || 0).toFixed(2);
                const prep = item.prep_time_minutes || item.prep_time || item.preparation_time || 10;
                const isAvail = (item.is_available !== false && item.is_available !== 0);

                tr.innerHTML = `
                    <td>
                        <div style="font-weight: 700;">${escapeHtml(item.name)}</div>
                        <div style="font-size: 0.75rem; color: var(--muted);">${escapeHtml(item.description || '')}</div>
                    </td>
                    <td><span class="badge" style="background:#F1F5F9; color:#475569;">${escapeHtml(item.category || 'Special')}</span></td>
                    <td style="font-weight: 700;">₹${price}</td>
                    <td>⏱ ${prep} min</td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" ${isAvail ? 'checked' : ''} onchange="toggleItemStock('${item.id}', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td style="text-align: right;">
                        <button type="button" class="btn btn-outline btn-sm" onclick='openEditModal(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                            Edit
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            container.style.display = 'block';
        }
    } catch (err) {
        loading.style.display = 'none';
        showToast('Failed to load menu items', 'error');
    }
}

async function toggleItemStock(itemId, isAvailable) {
    try {
        const res = await apiFetch(`/menu/${itemId}/availability`, {
            method: 'PATCH',
            body: JSON.stringify({ is_available: isAvailable })
        });
        if (res.success) {
            showToast('Stock availability updated', 'success');
        } else {
            throw new Error(res.message || 'Failed to update stock.');
        }
    } catch (err) {
        showToast(err.message, 'error');
        loadAdminMenu(); // Reset UI
    }
}

/* ───────── Menu Modal (Create & Edit) ───────── */

function initMenuForm() {
    const form = document.getElementById('edit-item-form');
    if (form) {
        form.addEventListener('submit', handleMenuFormSubmit);
    }
}

function openCreateModal() {
    document.getElementById('modal-form-title').textContent = 'Add New Menu Item';
    document.getElementById('edit-item-id').value = '';
    document.getElementById('edit-item-name').value = '';
    document.getElementById('edit-item-category').value = 'Snacks';
    document.getElementById('edit-item-price').value = '50';
    document.getElementById('edit-item-preptime').value = '10';
    document.getElementById('edit-item-desc').value = '';

    document.getElementById('edit-item-modal').style.display = 'flex';
}

function openEditModal(item) {
    document.getElementById('modal-form-title').textContent = `Edit: ${item.name}`;
    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-item-name').value = item.name;
    document.getElementById('edit-item-category').value = item.category || 'Snacks';
    document.getElementById('edit-item-price').value = item.base_price || item.price || 0;
    document.getElementById('edit-item-preptime').value = item.prep_time_minutes || item.prep_time || item.preparation_time || 10;
    document.getElementById('edit-item-desc').value = item.description || '';

    document.getElementById('edit-item-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-item-modal').style.display = 'none';
}

async function handleMenuFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-item-id').value;
    const name = document.getElementById('edit-item-name').value.trim();
    const category = document.getElementById('edit-item-category').value;
    const price = parseFloat(document.getElementById('edit-item-price').value);
    const prep_time = parseInt(document.getElementById('edit-item-preptime').value, 10);
    const description = document.getElementById('edit-item-desc').value.trim();

    const saveBtn = document.getElementById('save-item-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const payload = {
            name,
            category,
            price,
            base_price: price,
            prep_time_minutes: prep_time,
            preparation_time: prep_time,
            description
        };

        let res;
        if (id) {
            // Edit existing item
            res = await apiFetch(`/menu/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
        } else {
            // Create new item
            res = await apiFetch('/menu', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }

        if (res.success) {
            showToast(id ? 'Dish updated successfully!' : 'Dish added to catalog!', 'success');
            closeEditModal();
            loadAdminMenu();
        } else {
            throw new Error(res.message || 'Operation failed.');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
}

// Global window bindings for admin interface
window.advanceStatus = advanceStatus;
window.markTokenCollected = markTokenCollected;
window.toggleItemStock = toggleItemStock;
window.openCreateModal = openCreateModal;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;

