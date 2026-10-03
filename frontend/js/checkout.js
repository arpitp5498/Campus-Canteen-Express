/**
 * Campus Canteen Express — Checkout Controller
 * Manages order type selection (Today @ ₹3 / Tomorrow @ ₹1), 
 * live 12:00-1:00 PM slot capacity fetching, inventory re-validation,
 * and order confirmation.
 */

let selectedSlotId = null;
let selectedPaymentMethod = 'upi';
let selectedOrderType = 'TODAY';

function getExpressFee() {
    return selectedOrderType === 'TOMORROW' ? 1 : 3;
}

function getTargetDate() {
    const d = new Date();
    if (selectedOrderType === 'TOMORROW') {
        d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    const cart = getCart();
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
        window.location.href = '/cart.html';
        return;
    }

    renderOrderReview(cart);
    initDaySelector();
    initPaymentSelector();
    await fetchSlots();

    const placeBtn = document.getElementById('place-order-btn');
    if (placeBtn) {
        placeBtn.addEventListener('click', placeOrder);
    }
});

/* ───────── Day Selector (Today ₹3 vs Tomorrow ₹1) ───────── */

function initDaySelector() {
    const todayCard = document.getElementById('opt-today');
    const tomorrowCard = document.getElementById('opt-tomorrow');
    const instructionText = document.getElementById('slot-instruction-text');

    const selectType = (type) => {
        selectedOrderType = type;
        selectedSlotId = null; // Clear selected slot

        if (todayCard && tomorrowCard) {
            todayCard.classList.toggle('selected', type === 'TODAY');
            tomorrowCard.classList.toggle('selected', type === 'TOMORROW');
        }

        if (instructionText) {
            const dayLabel = type === 'TOMORROW' ? 'tomorrow' : 'today';
            instructionText.textContent = `Select a 10-minute pickup slot for ${dayLabel} between 12:00 PM and 1:00 PM.`;
        }

        const feeLabel = document.getElementById('fee-label');
        if (feeLabel) {
            feeLabel.textContent = `Express Fee (${type === 'TOMORROW' ? 'Tomorrow' : 'Today'})`;
        }

        renderOrderReview(getCart());
        fetchSlots();
    };

    if (todayCard) todayCard.addEventListener('click', () => selectType('TODAY'));
    if (tomorrowCard) tomorrowCard.addEventListener('click', () => selectType('TOMORROW'));
}

/* ───────── Payment Method Selector ───────── */

function initPaymentSelector() {
    document.querySelectorAll('.payment-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.payment-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedPaymentMethod = card.getAttribute('data-method') || 'upi';
        });
    });
}

/* ───────── Order Review Sidebar ───────── */

function renderOrderReview(cart) {
    const reviewItemsContainer = document.getElementById('review-items');
    if (!reviewItemsContainer) return;
    reviewItemsContainer.innerHTML = '';

    let subtotal = 0;

    cart.forEach(item => {
        const unitPrice = Number(item.unit_price ?? item.price ?? 0);
        const qty = Number(item.quantity ?? 1);
        const itemTotal = unitPrice * qty;
        subtotal += itemTotal;

        const row = document.createElement('div');
        row.className = 'review-item-row';

        const variantInfo = item.variant_name ? `<div class="review-item-variant">${escapeHtml(item.variant_name)}</div>` : '';

        row.innerHTML = `
            <div>
                <div class="review-item-title">${qty}x ${escapeHtml(item.name)}</div>
                ${variantInfo}
            </div>
            <div style="font-weight: 700;">₹${itemTotal}</div>
        `;
        reviewItemsContainer.appendChild(row);
    });

    const fee = getExpressFee();
    const subtotalEl = document.getElementById('checkout-subtotal');
    const feeEl = document.getElementById('checkout-express-fee');
    const totalEl = document.getElementById('checkout-total');

    if (subtotalEl) subtotalEl.textContent = typeof formatPrice === 'function' ? formatPrice(subtotal) : `₹${subtotal}`;
    if (feeEl) feeEl.textContent = `₹${fee}`;
    if (totalEl) totalEl.textContent = typeof formatPrice === 'function' ? formatPrice(subtotal + fee) : `₹${subtotal + fee}`;
}

/* ───────── Fetch Pickup Slots ───────── */

async function fetchSlots() {
    const targetDate = getTargetDate();
    const container = document.getElementById('slots-container');
    if (!container) return;

    container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--muted);">
            🔄 Loading pickup slots for ${selectedOrderType === 'TOMORROW' ? 'Tomorrow' : 'Today'}...
        </div>
    `;

    try {
        const res = await apiFetch(`/slots?date=${targetDate}`);
        if (res && res.success) {
            const slots = Array.isArray(res.data?.slots) ? res.data.slots : (Array.isArray(res.data) ? res.data : []);
            renderSlots(slots);
        } else {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: #EF4444;">
                    Failed to load slots: ${(res && res.message) || 'Unknown error'}
                </div>
            `;
        }
    } catch (err) {
        console.error('Error fetching slots:', err);
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: #EF4444;">
                Error connecting to slot service.
            </div>
        `;
        if (typeof showToast === 'function') showToast('Failed to load pickup slots', 'error');
    }
}

function renderSlots(slots) {
    const container = document.getElementById('slots-container');
    if (!container) return;
    container.innerHTML = '';

    if (!slots || slots.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--muted); background: #F8FAFC; border-radius: var(--radius);">
                No pickup slots configured for this date yet. Please check back shortly.
            </div>
        `;
        return;
    }

    slots.forEach(slot => {
        const maxCapacity = slot.max_capacity ?? slot.capacity ?? 15;
        const currentOrders = slot.current_orders ?? 0;
        const remaining = (typeof slot.remaining_capacity !== 'undefined') ? slot.remaining_capacity : (maxCapacity - currentOrders);
        const isFull = slot.is_full || remaining <= 0;

        const el = document.createElement('div');
        el.className = `slot-card ${isFull ? 'disabled' : ''}`;
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', isFull ? '-1' : '0');
        el.setAttribute('aria-disabled', isFull ? 'true' : 'false');

        // Formatted time range
        let timeDisplay = slot.time_window;
        if (!timeDisplay) {
            const start = typeof formatSlotTime === 'function' ? formatSlotTime(slot.start_time) : slot.start_time;
            const end = typeof formatSlotTime === 'function' ? formatSlotTime(slot.end_time) : slot.end_time;
            timeDisplay = `${start} - ${end}`;
        }

        // Capacity calculation for progress bar
        const percentFilled = Math.min(100, Math.round((currentOrders / maxCapacity) * 100));
        let spotClass = 'spots-good';
        let barColor = '#16A34A';

        if (isFull) {
            spotClass = 'spots-full';
            barColor = '#EF4444';
        } else if (remaining <= 5) {
            spotClass = 'spots-low';
            barColor = '#D97706';
        }

        el.innerHTML = `
            <div class="slot-time">${timeDisplay}</div>
            <div class="slot-spots ${spotClass}">
                ${isFull ? '🚫 Slot Full' : `⚡ ${remaining} spot${remaining > 1 ? 's' : ''} left`}
            </div>
            <div class="slot-progress-bar">
                <div class="slot-progress-fill" style="width: ${percentFilled}%; background-color: ${barColor};"></div>
            </div>
        `;

        if (!isFull) {
            el.addEventListener('click', () => {
                document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('slot-selected'));
                el.classList.add('slot-selected');
                selectedSlotId = slot.id;
            });
        }

        container.appendChild(el);
    });
}

/* ───────── Place Order & Verify Payment ───────── */

async function placeOrder() {
    if (!selectedSlotId) {
        showToast('Please select a 10-minute pickup slot', 'error');
        return;
    }

    const cart = getCart();
    if (!cart || cart.length === 0) {
        showToast('Your cart is empty', 'warning');
        return;
    }

    const btn = document.getElementById('place-order-btn');
    const originalText = btn ? btn.textContent : 'Pay & Confirm Order';

    if (btn) {
        btn.textContent = '⏳ Processing Order...';
        btn.disabled = true;
    }

    try {
        // Pre-check: format items array for backend
        const items = cart.map(item => ({
            item_id: Number(item.item_id || item.id),
            quantity: Number(item.quantity || 1),
            variant_id: item.variant_id ? Number(item.variant_id) : undefined
        }));

        const createRes = await apiFetch('/orders', {
            method: 'POST',
            body: JSON.stringify({
                slot_id: selectedSlotId,
                items: items,
                order_type: selectedOrderType
            })
        });

        if (!createRes || !createRes.success) {
            throw new Error((createRes && createRes.message) || 'Failed to place order');
        }

        const orderData = createRes.data?.order || createRes.data;
        const paymentData = createRes.data?.payment || createRes.payment || {};
        const orderId = orderData.id;

        // Auto-verify mock payment
        const verifyRes = await apiFetch('/orders/verify-payment', {
            method: 'POST',
            body: JSON.stringify({
                order_id: orderId,
                razorpay_order_id: paymentData.razorpay_order_id || orderData.payment?.razorpay_order_id || 'mock_order_id',
                razorpay_payment_id: 'pay_mock_' + Date.now(),
                razorpay_signature: 'mock_signature'
            })
        });

        if (!verifyRes || !verifyRes.success) {
            throw new Error((verifyRes && verifyRes.message) || 'Payment verification failed');
        }

        clearCart();
        showToast('Order placed successfully! Redirecting...', 'success');

        setTimeout(() => {
            window.location.href = `/orders.html?confirmed=${orderId}`;
        }, 600);

    } catch (error) {
        console.error('Order placement error:', error);
        showToast(error.message || 'Something went wrong while placing the order', 'error');

        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
}
