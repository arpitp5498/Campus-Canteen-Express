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
    const placeBtn = document.getElementById('place-order-btn');
    document.querySelectorAll('.payment-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.payment-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedPaymentMethod = card.getAttribute('data-method') || 'upi';

            if (placeBtn && !isPaymentInProgress) {
                if (selectedPaymentMethod === 'cash') {
                    placeBtn.innerHTML = '💵 Confirm Order (Pay Cash on Counter)';
                } else {
                    placeBtn.innerHTML = '💳 Pay Now';
                }
            }
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

/* ───────── Payment Status & UI States ───────── */

let isPaymentInProgress = false;
let activePendingOrderId = null;

function setPaymentStatus(type, message, showRetry = false, retryHandler = null) {
    const container = document.getElementById('payment-status-container');
    const alertBox = document.getElementById('payment-status-alert');
    const messageEl = document.getElementById('payment-status-message');
    const retryBtn = document.getElementById('retry-payment-btn');
    const placeBtn = document.getElementById('place-order-btn');

    if (!container || !alertBox || !messageEl) return;

    if (type === 'reset') {
        container.style.display = 'none';
        if (placeBtn) {
            placeBtn.style.display = 'block';
            placeBtn.disabled = false;
            placeBtn.innerHTML = '💳 Pay Now';
        }
        if (retryBtn) retryBtn.style.display = 'none';
        isPaymentInProgress = false;
        return;
    }

    container.style.display = 'block';
    alertBox.className = 'alert';

    if (type === 'loading' || type === 'processing') {
        alertBox.classList.add('alert-info');
        messageEl.innerHTML = `<span class="spinner-sm" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> ${escapeHtml(message)}`;
        if (placeBtn) {
            placeBtn.disabled = true;
            placeBtn.innerHTML = '⏳ Processing...';
        }
        if (retryBtn) retryBtn.style.display = 'none';
        isPaymentInProgress = true;
    } else if (type === 'success') {
        alertBox.classList.add('alert-success');
        messageEl.innerHTML = `<strong>Success:</strong> ${escapeHtml(message)}`;
        if (placeBtn) placeBtn.style.display = 'none';
        if (retryBtn) retryBtn.style.display = 'none';
        isPaymentInProgress = false;
    } else if (type === 'error') {
        alertBox.classList.add('alert-danger');
        messageEl.innerHTML = `<strong>Payment Failed:</strong> ${escapeHtml(message)}`;
        if (placeBtn) placeBtn.style.display = 'none';
        if (retryBtn && showRetry) {
            retryBtn.style.display = 'block';
            retryBtn.disabled = false;
            retryBtn.onclick = retryHandler;
        }
        isPaymentInProgress = false;
    } else if (type === 'warning') {
        alertBox.classList.add('alert-warning');
        messageEl.innerHTML = `<strong>Notice:</strong> ${escapeHtml(message)}`;
        if (placeBtn) placeBtn.style.display = 'none';
        if (retryBtn && showRetry) {
            retryBtn.style.display = 'block';
            retryBtn.disabled = false;
            retryBtn.onclick = retryHandler;
        }
        isPaymentInProgress = false;
    }
}

/* ───────── Place Order & Razorpay Checkout ───────── */

async function placeOrder() {
    if (isPaymentInProgress) {
        return; // Prevent duplicate clicks
    }

    if (!selectedSlotId) {
        showToast('Please select a 10-minute pickup slot', 'error');
        return;
    }

    const cart = getCart();
    if (!cart || cart.length === 0) {
        showToast('Your cart is empty', 'warning');
        return;
    }

    setPaymentStatus('loading', 'Creating order & reserving pickup slot...');

    try {
        const items = cart.map(item => ({
            item_id: Number(item.item_id || item.id),
            quantity: Number(item.quantity || 1),
            variant_id: item.variant_id ? Number(item.variant_id) : undefined
        }));

        const isCash = selectedPaymentMethod === 'cash';

        const createRes = await apiFetch('/orders', {
            method: 'POST',
            body: JSON.stringify({
                slot_id: selectedSlotId,
                items: items,
                order_type: selectedOrderType,
                payment_method: isCash ? 'CASH' : 'RAZORPAY'
            })
        });

        if (!createRes || !createRes.success) {
            throw new Error((createRes && createRes.message) || 'Failed to place order');
        }

        const orderData = createRes.data?.order || createRes.data;
        const paymentData = createRes.data?.payment || createRes.payment || {};
        activePendingOrderId = orderData.id;

        // Cache pickup token in session storage for instant receipt rendering
        if (orderData.pickup_token) {
            try {
                sessionStorage.setItem('cce_confirmed_token_' + orderData.id, orderData.pickup_token);
            } catch (e) {}
        }

        // If Cash on Counter, directly confirm and redirect to receipt!
        if (isCash || paymentData.is_cash) {
            clearCart();
            setPaymentStatus('success', 'Order confirmed! Please pay cash at the Express Counter when collecting lunch.');
            showToast('Order confirmed! Pay cash at pickup.', 'success');

            setTimeout(() => {
                window.location.href = `/orders.html?confirmed=${orderData.id}`;
            }, 600);
            return;
        }

        await openRazorpayCheckout(orderData, paymentData);

    } catch (error) {
        console.error('Order placement error:', error);
        showToast(error.message || 'Something went wrong while placing the order', 'error');
        setPaymentStatus('reset');
    }
}

/**
 * Handle Razorpay Checkout modal or Mock Mode execution.
 */
async function openRazorpayCheckout(orderData, paymentData) {
    const user = getUser();
    const orderId = orderData.id;

    // 1. Mock Mode Fallback
    if (paymentData.is_mock || !window.Razorpay) {
        setPaymentStatus('processing', 'Authorizing Campus Express Payment...');
        try {
            const verifyRes = await apiFetch('/orders/verify-payment', {
                method: 'POST',
                body: JSON.stringify({
                    order_id: orderId,
                    razorpay_order_id: paymentData.razorpay_order_id || 'mock_order_id',
                    razorpay_payment_id: 'pay_mock_' + Date.now(),
                    razorpay_signature: 'mock_signature'
                })
            });

            if (!verifyRes || !verifyRes.success) {
                throw new Error((verifyRes && verifyRes.message) || 'Payment verification failed');
            }

            clearCart();
            setPaymentStatus('success', 'Order placed & payment verified successfully! Redirecting...');
            showToast('Order confirmed!', 'success');

            setTimeout(() => {
                window.location.href = `/orders.html?confirmed=${orderId}`;
            }, 600);
        } catch (err) {
            setPaymentStatus('error', err.message || 'Payment verification failed', true, () => retryPayment(orderId));
        }
        return;
    }

    // 2. Real Razorpay Test / Live Mode
    setPaymentStatus('processing', 'Opening secure Razorpay Checkout modal...');

    const options = {
        key: paymentData.key_id,
        amount: paymentData.amount, // In paise
        currency: paymentData.currency || 'INR',
        name: 'Campus Canteen Express',
        description: `Pre-Order #${orderData.order_number || orderId} (${selectedOrderType})`,
        order_id: paymentData.razorpay_order_id,
        image: 'https://cdn-icons-png.flaticon.com/512/3075/3075977.png',
        handler: async function (response) {
            setPaymentStatus('processing', 'Verifying payment signature with banking gateway...');
            try {
                const verifyRes = await apiFetch('/orders/verify-payment', {
                    method: 'POST',
                    body: JSON.stringify({
                        order_id: orderId,
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature
                    })
                });

                if (!verifyRes || !verifyRes.success) {
                    throw new Error((verifyRes && verifyRes.message) || 'Payment signature verification failed.');
                }

                clearCart();
                setPaymentStatus('success', 'Payment verified! Generating express pickup receipt...');
                showToast('Payment successful! Redirecting...', 'success');

                setTimeout(() => {
                    window.location.href = `/orders.html?confirmed=${orderId}`;
                }, 600);
            } catch (err) {
                console.error('Signature verification error:', err);
                setPaymentStatus('error', err.message || 'Payment verification failed.', true, () => retryPayment(orderId));
            }
        },
        modal: {
            ondismiss: function () {
                console.warn('Payment window closed by user.');
                setPaymentStatus(
                    'warning',
                    'Payment was cancelled. Your lunch slot is reserved for this order. You can complete payment below.',
                    true,
                    () => retryPayment(orderId)
                );
                apiFetch(`/orders/${orderId}/payment-failed`, {
                    method: 'POST',
                    body: JSON.stringify({ reason: 'User dismissed Razorpay checkout modal' })
                }).catch(() => {});
            }
        },
        prefill: {
            name: user?.name || '',
            email: user?.email || '',
            contact: user?.phone || ''
        },
        notes: {
            order_id: String(orderId),
            order_type: selectedOrderType
        },
        theme: {
            color: '#16A34A'
        }
    };

    try {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response) {
            console.error('Payment failed event:', response.error);
            const errorDesc = response.error?.description || 'Transaction declined by bank.';
            setPaymentStatus(
                'error',
                `${errorDesc} You can safely retry payment below.`,
                true,
                () => retryPayment(orderId)
            );
            apiFetch(`/orders/${orderId}/payment-failed`, {
                method: 'POST',
                body: JSON.stringify({
                    reason: errorDesc,
                    razorpay_payment_id: response.error?.metadata?.payment_id
                })
            }).catch(() => {});
        });
        rzp.open();
    } catch (err) {
        console.error('Failed to open Razorpay modal:', err);
        setPaymentStatus('error', 'Could not open Razorpay Checkout: ' + err.message, true, () => retryPayment(orderId));
    }
}

/**
 * Safely retry payment on an unpaid order without losing slot or creating duplicate orders.
 */
async function retryPayment(orderId) {
    if (isPaymentInProgress) return;
    setPaymentStatus('loading', 'Initiating payment retry...');

    try {
        const res = await apiFetch(`/orders/${orderId}/retry-payment`, {
            method: 'POST'
        });

        if (!res || !res.success) {
            throw new Error((res && res.message) || 'Failed to retry payment');
        }

        const retryData = res.data || {};
        const paymentData = retryData.payment || {};
        const orderData = {
            id: retryData.order_id || orderId,
            order_number: retryData.order_number
        };

        await openRazorpayCheckout(orderData, paymentData);
    } catch (err) {
        console.error('Retry payment error:', err);
        setPaymentStatus('error', err.message || 'Retry failed. Please try again.', true, () => retryPayment(orderId));
    }
}
