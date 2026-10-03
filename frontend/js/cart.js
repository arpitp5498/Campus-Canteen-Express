/**
 * Campus Canteen Express — Cart Page Controller
 * Handles cart display, item quantity stepper, removal, subtotal calculation,
 * and navigation to checkout.
 */

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }

    renderCart();

    const checkoutBtn = document.getElementById('proceed-checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            const cart = getCart();
            if (!cart || cart.length === 0) {
                showToast('Your cart is empty. Please add items first.', 'warning');
                return;
            }
            window.location.href = '/checkout.html';
        });
    }

    const clearBtn = document.getElementById('clear-cart-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const cart = getCart();
            if (!cart || cart.length === 0) return;
            if (confirm('Are you sure you want to remove all items from your cart?')) {
                clearCart();
                renderCart();
                showToast('Cart cleared', 'info');
            }
        });
    }

    window.addEventListener('cartUpdated', renderCart);
});

function renderCart() {
    const cart = getCart();
    const cartContent = document.getElementById('cart-content');
    const emptyState = document.getElementById('empty-cart-state');
    const itemsContainer = document.getElementById('cart-items-container');
    const clearBtn = document.getElementById('clear-cart-btn');

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
        if (cartContent) cartContent.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }

    if (cartContent) cartContent.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'inline-block';
    if (itemsContainer) itemsContainer.innerHTML = '';

    let subtotal = 0;

    cart.forEach(item => {
        const unitPrice = Number(item.unit_price ?? item.price ?? 0);
        const qty = Number(item.quantity ?? 1);
        const itemTotal = unitPrice * qty;
        subtotal += itemTotal;

        const cartItemEl = document.createElement('div');
        cartItemEl.className = 'cart-item-row';

        const variantBadge = item.variant_name 
            ? `<span class="cart-item-variant">${escapeHtml(item.variant_name)}</span>` 
            : '';
        const itemKey = item.cartKey || `${item.item_id || item.id}_${item.variant_id || 'base'}`;

        cartItemEl.innerHTML = `
            <img src="${item.image_url || '/images/food/placeholder.svg'}" alt="${escapeHtml(item.name)}" class="cart-item-thumb" onerror="handleImageError(this)">
            
            <div class="cart-item-details">
                <h4 class="cart-item-title">${escapeHtml(item.name)}</h4>
                ${variantBadge}
                <p class="cart-item-unit-price">${typeof formatPrice === 'function' ? formatPrice(unitPrice) : '₹' + unitPrice} each</p>
            </div>
            
            <div class="cart-item-controls">
                <div class="cart-qty-stepper">
                    <button type="button" class="cart-qty-btn" onclick="updateQty('${itemKey}', -1)" aria-label="Decrease quantity">&minus;</button>
                    <span class="cart-qty-num">${qty}</span>
                    <button type="button" class="cart-qty-btn" onclick="updateQty('${itemKey}', 1)" aria-label="Increase quantity">+</button>
                </div>
                
                <div class="cart-item-subtotal">${typeof formatPrice === 'function' ? formatPrice(itemTotal) : '₹' + itemTotal}</div>
                
                <button type="button" class="cart-item-remove-btn" onclick="removeItem('${itemKey}')" aria-label="Remove ${escapeHtml(item.name)}">
                    🗑️
                </button>
            </div>
        `;
        if (itemsContainer) itemsContainer.appendChild(cartItemEl);
    });

    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');

    if (subtotalEl) {
        subtotalEl.textContent = typeof formatPrice === 'function' ? formatPrice(subtotal) : `₹${subtotal}`;
    }
    if (totalEl) {
        // Today is default (+3), but note mentions tomorrow is +1
        totalEl.textContent = typeof formatPrice === 'function' ? formatPrice(subtotal + 3) : `₹${subtotal + 3}`;
    }
}

window.updateQty = function(cartKey, change) {
    const cart = getCart();
    const item = cart.find(i => (i.cartKey === cartKey) || (`${i.item_id || i.id}_${i.variant_id || 'base'}` === cartKey));

    if (item) {
        const newQty = item.quantity + change;
        if (newQty > 20) {
            showToast('Maximum order quantity per item is 20', 'warning');
            return;
        }
        if (newQty <= 0) {
            removeItem(cartKey);
            return;
        }
        updateCartItemQty(item.cartKey || cartKey, newQty);
        renderCart();
    }
};

window.removeItem = function(cartKey) {
    removeFromCart(cartKey);
    renderCart();
    showToast('Item removed from cart', 'info');
};
