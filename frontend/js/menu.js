/**
 * Campus Canteen Express — Menu Page Controller
 * Handles food catalog loading, category filtering, search, sorting,
 * rich item detail modal, quantity selection, and direct add-to-cart.
 */

let allMenuItems = [];
let currentCategory = 'All';
let currentSearch = '';
let currentSort = 'default';

// Active item being viewed in the modal
let modalActiveItem = null;
let modalActiveVariant = null;
let modalQuantity = 1;

const CATEGORIES = ['All', 'Sandwiches', 'Snacks', 'Meals', 'Rolls', 'Drinks', 'Desserts'];

document.addEventListener('DOMContentLoaded', async () => {
    initFilters();
    initSearchAndSort();
    initModalEvents();
    updateFloatingCart();
    await fetchMenu();

    window.addEventListener('cartUpdated', updateFloatingCart);
});

/* ───────── Filters & Search Setup ───────── */

function initFilters() {
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;
    filtersContainer.innerHTML = '';

    CATEGORIES.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `category-btn ${cat === 'All' ? 'active' : ''}`;
        btn.textContent = cat;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', cat === 'All' ? 'true' : 'false');
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            currentCategory = cat;
            renderMenu();
        });
        filtersContainer.appendChild(btn);
    });

    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
    }
}

function resetFilters() {
    currentCategory = 'All';
    currentSearch = '';
    currentSort = 'default';

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.value = 'default';

    document.querySelectorAll('.category-btn').forEach(b => {
        const isAll = b.textContent === 'All';
        b.classList.toggle('active', isAll);
        b.setAttribute('aria-selected', isAll ? 'true' : 'false');
    });

    renderMenu();
}

function initSearchAndSort() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        const onSearch = (e) => {
            currentSearch = (e.target.value || '').toLowerCase().trim();
            renderMenu();
        };

        if (typeof debounce === 'function') {
            searchInput.addEventListener('input', debounce(onSearch, 250));
        } else {
            searchInput.addEventListener('input', onSearch);
        }
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            renderMenu();
        });
    }
}

/* ───────── Fetch Menu from API ───────── */

async function fetchMenu() {
    const loadingState = document.getElementById('loading-state');
    const menuGrid = document.getElementById('menu-grid');
    const emptyState = document.getElementById('empty-state');

    if (loadingState) loadingState.classList.remove('hidden');
    if (menuGrid) menuGrid.classList.add('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    try {
        let response;
        if (typeof api !== 'undefined' && typeof api.get === 'function') {
            response = await api.get('/menu');
        } else {
            const res = await fetch('/api/menu');
            response = await res.json();
        }

        if (response && response.success) {
            if (Array.isArray(response.data?.items)) {
                allMenuItems = response.data.items;
            } else if (Array.isArray(response.data)) {
                allMenuItems = response.data;
            } else if (Array.isArray(response.items)) {
                allMenuItems = response.items;
            } else {
                allMenuItems = [];
            }
        } else if (Array.isArray(response)) {
            allMenuItems = response;
        } else {
            allMenuItems = [];
            if (typeof showToast === 'function') showToast('Failed to load menu.', 'error');
        }
    } catch (err) {
        console.error('Error fetching menu:', err);
        allMenuItems = [];
        if (typeof showToast === 'function') showToast('Error connecting to menu service.', 'error');
    } finally {
        if (loadingState) loadingState.classList.add('hidden');
        renderMenu();
    }
}

/* ───────── Render Catalog ───────── */

function renderMenu() {
    const menuGrid = document.getElementById('menu-grid');
    const emptyState = document.getElementById('empty-state');
    const countLabel = document.getElementById('items-count-label');
    const filterLabel = document.getElementById('active-filter-label');
    if (!menuGrid || !emptyState) return;

    // Filter
    let filtered = allMenuItems.filter(item => {
        const matchesCategory = currentCategory === 'All' || item.category === currentCategory;
        const name = (item.name || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const matchesSearch = !currentSearch || name.includes(currentSearch) || desc.includes(currentSearch);
        return matchesCategory && matchesSearch;
    });

    // Sort
    filtered.sort((a, b) => {
        const priceA = Number(a.base_price ?? a.price ?? 0);
        const priceB = Number(b.base_price ?? b.price ?? 0);
        const prepA = Number(a.prep_time_minutes ?? a.prep_time ?? a.preparation_time ?? 10);
        const prepB = Number(b.prep_time_minutes ?? b.prep_time ?? b.preparation_time ?? 10);

        if (currentSort === 'price_asc') return priceA - priceB;
        if (currentSort === 'price_desc') return priceB - priceA;
        if (currentSort === 'prep_time') return prepA - prepB;
        if (currentSort === 'name_asc') return (a.name || '').localeCompare(b.name || '');
        return 0; // Default order
    });

    // Meta labels
    if (countLabel) {
        countLabel.textContent = `Showing ${filtered.length} of ${allMenuItems.length} items`;
    }
    if (filterLabel) {
        filterLabel.textContent = currentCategory !== 'All' ? `Category: ${currentCategory}` : '';
    }

    menuGrid.innerHTML = '';

    if (filtered.length === 0) {
        menuGrid.classList.add('hidden');
        emptyState.classList.remove('hidden');
    } else {
        menuGrid.classList.remove('hidden');
        emptyState.classList.add('hidden');

        filtered.forEach(item => {
            const card = createFoodCard(item);
            menuGrid.appendChild(card);
        });
    }
}

/* ───────── Create Food Card ───────── */

function createFoodCard(item) {
    const el = document.createElement('article');
    el.className = 'food-card';

    const variants = Array.isArray(item.variants) ? item.variants : [];
    const hasVariants = variants.length > 0;
    const defaultVariant = hasVariants ? variants[0] : null;
    const basePrice = defaultVariant ? defaultVariant.price : (item.base_price || item.price || 0);
    const prepTime = item.prep_time_minutes || item.prep_time || item.preparation_time || 10;
    const isAvailable = item.is_available !== false && item.is_available !== 0;

    if (!isAvailable) {
        el.classList.add('out-of-stock');
    }

    el.innerHTML = `
        <div class="food-card-media" role="button" tabindex="0" aria-label="View details for ${escapeHtml(item.name)}">
            <img src="${item.image_url || '/images/food/placeholder.svg'}" alt="${escapeHtml(item.name)}" onerror="handleImageError(this)">
            <span class="food-card-badge">${escapeHtml(item.category || 'Special')}</span>
            ${!isAvailable ? '<div class="sold-out-overlay">Sold Out</div>' : ''}
        </div>
        <div class="food-card-content">
            <div class="food-card-title-row">
                <h3 class="food-name" role="button" tabindex="0">${escapeHtml(item.name)}</h3>
            </div>
            <p class="food-desc" title="${escapeHtml(item.description || '')}">${escapeHtml(item.description || 'Freshly prepared upon your express order.')}</p>
            
            <div class="food-meta-row">
                <span class="prep-time">⏱ ${prepTime} min</span>
                <span class="stock-status">
                    <span class="dot ${isAvailable ? 'available' : 'unavailable'}"></span>
                    ${isAvailable ? 'Available' : 'Sold Out'}
                </span>
            </div>
            
            <div class="food-action-row">
                <div class="food-price">${typeof formatPrice === 'function' ? formatPrice(basePrice) : '₹' + basePrice}</div>
                <div class="card-actions-group">
                    <button type="button" class="btn-quick-view" aria-label="View ${escapeHtml(item.name)} details">
                        Details
                    </button>
                    <button type="button" class="btn-add" ${!isAvailable ? 'disabled' : ''} aria-label="Add ${escapeHtml(item.name)} to cart">
                        ${isAvailable ? '+ Add' : 'Sold Out'}
                    </button>
                </div>
            </div>
        </div>
    `;

    // Click on media or title opens detail modal
    const openModal = () => openItemDetailModal(item);
    const mediaEl = el.querySelector('.food-card-media');
    const nameEl = el.querySelector('.food-name');
    const quickViewBtn = el.querySelector('.btn-quick-view');
    const addBtn = el.querySelector('.btn-add');

    if (mediaEl) mediaEl.addEventListener('click', openModal);
    if (nameEl) nameEl.addEventListener('click', openModal);
    if (quickViewBtn) quickViewBtn.addEventListener('click', openModal);

    // Direct add-to-cart button
    if (addBtn && isAvailable) {
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hasVariants) {
                // If item has variants, open modal so user can choose option
                openItemDetailModal(item);
            } else {
                if (typeof addToCart === 'function') {
                    addToCart(item, null);
                }
            }
        });
    }

    return el;
}

/* ───────── Item Detail Modal ───────── */

function initModalEvents() {
    const modal = document.getElementById('food-detail-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    const incBtn = document.getElementById('modal-qty-inc');
    const decBtn = document.getElementById('modal-qty-dec');
    const addBtn = document.getElementById('modal-add-btn');

    if (closeBtn) closeBtn.addEventListener('click', closeItemDetailModal);

    // Backdrop click dismiss
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeItemDetailModal();
        });
    }

    // Keyboard ESC dismiss
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeItemDetailModal();
        }
    });

    // Quantity controls
    if (incBtn) {
        incBtn.addEventListener('click', () => {
            if (modalQuantity < 20) {
                modalQuantity++;
                updateModalCalculations();
            }
        });
    }

    if (decBtn) {
        decBtn.addEventListener('click', () => {
            if (modalQuantity > 1) {
                modalQuantity--;
                updateModalCalculations();
            }
        });
    }

    // Add to cart from modal
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            if (!modalActiveItem) return;
            const isAvailable = modalActiveItem.is_available !== false && modalActiveItem.is_available !== 0;
            if (!isAvailable) {
                if (typeof showToast === 'function') showToast('This item is currently out of stock.', 'warning');
                return;
            }

            // Add selected quantity to cart
            for (let i = 0; i < modalQuantity; i++) {
                if (typeof addToCart === 'function') {
                    addToCart(modalActiveItem, modalActiveVariant);
                }
            }

            closeItemDetailModal();
        });
    }
}

function openItemDetailModal(item) {
    modalActiveItem = item;
    modalQuantity = 1;

    const variants = Array.isArray(item.variants) ? item.variants : [];
    modalActiveVariant = variants.length > 0 ? variants[0] : null;

    const modal = document.getElementById('food-detail-modal');
    const imgEl = document.getElementById('modal-food-img');
    const catEl = document.getElementById('modal-food-category');
    const nameEl = document.getElementById('modal-food-name');
    const prepEl = document.getElementById('modal-food-prep');
    const stockEl = document.getElementById('modal-food-stock');
    const descEl = document.getElementById('modal-food-desc');
    const variantsContainer = document.getElementById('modal-variants-container');
    const variantsList = document.getElementById('modal-variants-list');
    const addBtn = document.getElementById('modal-add-btn');

    if (imgEl) {
        imgEl.src = item.image_url || '/images/food/placeholder.svg';
        imgEl.alt = item.name;
    }
    if (catEl) catEl.textContent = item.category || 'Special';
    if (nameEl) nameEl.textContent = item.name;
    if (prepEl) {
        const prep = item.prep_time_minutes || item.prep_time || item.preparation_time || 10;
        prepEl.textContent = `⏱ ${prep} min preparation`;
    }

    const isAvailable = item.is_available !== false && item.is_available !== 0;
    if (stockEl) {
        stockEl.innerHTML = `
            <span class="dot ${isAvailable ? 'available' : 'unavailable'}"></span>
            ${isAvailable ? 'In Stock & Fresh' : 'Currently Unavailable'}
        `;
    }

    if (descEl) {
        descEl.textContent = item.description || 'Prepared fresh daily by our campus canteen chefs using quality ingredients.';
    }

    // Render variants if present
    if (variants.length > 0 && variantsContainer && variantsList) {
        variantsContainer.classList.remove('hidden');
        variantsList.innerHTML = '';

        variants.forEach((v, idx) => {
            const vBtn = document.createElement('button');
            vBtn.type = 'button';
            vBtn.className = `modal-variant-btn ${idx === 0 ? 'active' : ''}`;
            vBtn.textContent = `${v.variant_name || v.name} (₹${v.price})`;
            vBtn.addEventListener('click', () => {
                variantsList.querySelectorAll('.modal-variant-btn').forEach(b => b.classList.remove('active'));
                vBtn.classList.add('active');
                modalActiveVariant = v;
                updateModalCalculations();
            });
            variantsList.appendChild(vBtn);
        });
    } else if (variantsContainer) {
        variantsContainer.classList.add('hidden');
    }

    if (addBtn) {
        addBtn.disabled = !isAvailable;
        addBtn.textContent = isAvailable ? '🛒 Add to Cart' : 'Sold Out';
    }

    updateModalCalculations();

    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function updateModalCalculations() {
    const qtyVal = document.getElementById('modal-qty-val');
    const totalPriceEl = document.getElementById('modal-total-price');
    const addBtn = document.getElementById('modal-add-btn');

    if (qtyVal) qtyVal.textContent = modalQuantity;

    if (!modalActiveItem) return;
    const unitPrice = modalActiveVariant ? Number(modalActiveVariant.price) : Number(modalActiveItem.base_price || modalActiveItem.price || 0);
    const total = unitPrice * modalQuantity;

    if (totalPriceEl) {
        totalPriceEl.textContent = typeof formatPrice === 'function' ? formatPrice(total) : '₹' + total;
    }

    if (addBtn && (modalActiveItem.is_available !== false && modalActiveItem.is_available !== 0)) {
        addBtn.textContent = `🛒 Add ${modalQuantity} to Cart (₹${total})`;
    }
}

function closeItemDetailModal() {
    const modal = document.getElementById('food-detail-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    modalActiveItem = null;
    modalActiveVariant = null;
}

/* ───────── Floating Cart Pill ───────── */

function updateFloatingCart() {
    const floatingCart = document.getElementById('floating-cart');
    const countEl = document.getElementById('floating-cart-count');
    const totalEl = document.getElementById('floating-cart-total');
    if (!floatingCart || !countEl || !totalEl) return;

    let cart = [];
    if (typeof getCart === 'function') {
        cart = getCart();
    } else {
        try {
            cart = JSON.parse(localStorage.getItem('cce_cart')) || [];
        } catch(e) {}
    }

    let count = 0;
    let total = 0;

    if (Array.isArray(cart) && cart.length > 0) {
        cart.forEach(item => {
            const qty = Number(item.quantity || 1);
            const price = Number(item.unit_price || item.price || 0);
            count += qty;
            total += (price * qty);
        });
    }

    if (count === 0) {
        floatingCart.classList.add('hidden');
    } else {
        floatingCart.classList.remove('hidden');
        countEl.textContent = `${count} item${count > 1 ? 's' : ''}`;
        totalEl.textContent = typeof formatPrice === 'function' ? formatPrice(total) : '₹' + total;
    }
}
