/**
 * Campus Canteen Express — Homepage Controller
 * Fetches popular/featured menu items and renders rich food cards.
 */

document.addEventListener('DOMContentLoaded', () => {
    fetchPopularItems();
});

async function fetchPopularItems() {
    const container = document.getElementById('popular-items-container');
    if (!container) return;

    try {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; color: var(--slate-500);">
                🔄 Loading today's favorites...
            </div>
        `;
        
        let response;
        if (window.api && typeof window.api.get === 'function') {
            response = await window.api.get('/menu');
        } else {
            const res = await fetch('/api/menu');
            response = await res.json();
        }
        
        if (response && response.success) {
            const allItems = response.data?.items || response.data || response.items || [];
            // Pick 4 featured popular items (e.g. sandwiches, pizza, maggi, beverages)
            const popularItems = allItems.slice(0, 4);
            renderPopularItems(popularItems, container);
        } else {
            throw new Error((response && response.message) || 'Failed to load popular items');
        }
    } catch (error) {
        console.error('Error fetching popular items:', error);
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--error);">
                Failed to load popular items. Please try refreshing.
            </div>
        `;
    }
}

function renderPopularItems(items, container) {
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--slate-500);">
                No featured items available right now.
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const price = Number(item.base_price ?? item.price ?? 0);
        const prepTime = item.prep_time_minutes || item.prep_time || 10;
        const isAvailable = item.is_available !== false && item.is_available !== 0;

        return `
            <article class="food-card ${!isAvailable ? 'out-of-stock' : ''}">
                <div class="food-card-media" onclick="window.location.href='menu.html'">
                    <img src="${item.image_url || '/images/food/placeholder.svg'}" alt="${escapeHtml(item.name)}" onerror="handleImageError(this)">
                    <span class="food-card-badge">${escapeHtml(item.category || 'Special')}</span>
                    ${!isAvailable ? '<div class="sold-out-overlay">Sold Out</div>' : ''}
                </div>
                <div class="food-card-content">
                    <div class="food-card-title-row">
                        <h3 class="food-name" onclick="window.location.href='menu.html'">${escapeHtml(item.name)}</h3>
                        <span class="veg-indicator" title="100% Pure Vegetarian"></span>
                    </div>
                    <p class="food-desc">${escapeHtml(item.description || 'Freshly prepared upon your express order.')}</p>
                    
                    <div class="food-meta-row">
                        <span class="prep-time">⏱ ${prepTime} min</span>
                        <span class="stock-status">
                            <span class="dot ${isAvailable ? 'available' : 'unavailable'}"></span>
                            ${isAvailable ? 'Fresh &amp; Ready' : 'Sold Out'}
                        </span>
                    </div>

                    <div class="food-action-row">
                        <div class="food-price">${typeof formatPrice === 'function' ? formatPrice(price) : '₹' + price}</div>
                        <a href="menu.html" class="btn btn-primary btn-sm">
                            Order Now &rarr;
                        </a>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}
