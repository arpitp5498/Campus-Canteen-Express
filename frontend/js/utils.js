/**
 * Campus Canteen Express — Utility Helpers
 * Formatting, cart state, and shared helper functions.
 */

/* ───────── Currency Formatting ───────── */

function formatPrice(amount) {
  const num = Number(amount);
  if (isNaN(num)) return '₹0';
  return `₹${num.toFixed(num % 1 === 0 ? 0 : 2)}`;
}

/* ───────── Date / Time Formatting ───────── */

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

function formatSlotTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${period}`;
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/* ───────── Status Helpers ───────── */

const STATUS_CONFIG = {
  PLACED:    { label: 'Order Placed', color: 'info',    icon: '📋' },
  ACCEPTED:  { label: 'Accepted',     color: 'info',    icon: '✓' },
  PREPARING: { label: 'Preparing',    color: 'warning', icon: '🍳' },
  READY:     { label: 'Ready',        color: 'success', icon: '✅' },
  COLLECTED: { label: 'Collected',    color: 'muted',   icon: '🎉' },
  CANCELLED: { label: 'Cancelled',    color: 'error',   icon: '✕' }
};

const STATUS_ORDER = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED'];

const NEXT_STATUS = {
  PLACED: 'ACCEPTED',
  ACCEPTED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'COLLECTED'
};

const NEXT_STATUS_LABEL = {
  PLACED: 'Accept Order',
  ACCEPTED: 'Start Preparing',
  PREPARING: 'Mark Ready',
  READY: 'Mark Collected'
};

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || { label: status, color: 'muted', icon: '•' };
}

function getStatusBadgeHtml(status) {
  const config = getStatusConfig(status);
  return `<span class="badge badge-${config.color}">${config.label}</span>`;
}

/* ───────── Cart State (LocalStorage) ───────── */

const CART_KEY = 'cce_cart';

function getCart() {
  try {
    const data = localStorage.getItem(CART_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
  document.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cart } }));
}

function addToCart(item, variant = null) {
  const cart = getCart();

  // Build a unique key: itemId + variantId
  const cartKey = `${item.id}_${variant ? variant.id : 'base'}`;

  const existingIndex = cart.findIndex(c => c.cartKey === cartKey);
  if (existingIndex >= 0) {
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({
      cartKey,
      item_id: item.id,
      name: item.name,
      image_url: item.image_url,
      category: item.category,
      base_price: item.base_price || item.price,
      variant_id: variant ? variant.id : null,
      variant_name: variant ? variant.variant_name : null,
      unit_price: variant ? variant.price : (item.base_price || item.price),
      quantity: 1
    });
  }

  saveCart(cart);
  showToast(`${item.name}${variant ? ` (${variant.variant_name})` : ''} added to cart`, 'success', 2000);
}

function removeFromCart(cartKey) {
  let cart = getCart();
  cart = cart.filter(c => c.cartKey !== cartKey);
  saveCart(cart);
}

function updateCartItemQty(cartKey, quantity) {
  const cart = getCart();
  const idx = cart.findIndex(c => c.cartKey === cartKey);
  if (idx >= 0) {
    if (quantity <= 0) {
      cart.splice(idx, 1);
    } else {
      cart[idx].quantity = quantity;
    }
    saveCart(cart);
  }
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartCount();
  document.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cart: [] } }));
}

function getCartTotal() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
}

function getCartItemCount() {
  const cart = getCart();
  return cart.reduce((count, item) => count + item.quantity, 0);
}

function updateCartCount() {
  const count = getCartItemCount();
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

/* ───────── Image Fallback ───────── */

function handleImageError(img) {
  img.onerror = null;
  img.src = '/images/food/placeholder.svg';
  img.alt = 'Food image';
}

/* ───────── Debounce ───────── */

function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ───────── Set Loading State on Button ───────── */

function setButtonLoading(btn, loading, originalText) {
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = '';
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.textContent = originalText || btn.dataset.originalText || 'Submit';
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}
