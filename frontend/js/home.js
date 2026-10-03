document.addEventListener('DOMContentLoaded', () => {
    fetchPopularItems();
});

async function fetchPopularItems() {
    const container = document.getElementById('popular-items-container');
    if (!container) return;

    try {
        container.innerHTML = '<div class="text-center text-muted" style="grid-column: 1 / -1;">Loading popular items...</div>';
        
        // Fetch from API using global api object from api.js if available, or direct fetch
        let response;
        if (window.api && typeof window.api.get === 'function') {
            response = await window.api.get('/menu?available_only=true');
        } else {
            // Fallback if api object is structured differently
            const res = await fetch('/api/menu?available_only=true');
            response = await res.json();
        }
        
        if (response && response.success && response.data) {
            // Select up to 4 items to show as popular
            const allItems = response.data.items || response.data || [];
            const items = allItems.slice(0, 4);
            renderPopularItems(items, container);
        } else {
            throw new Error((response && response.message) || 'Failed to load popular items');
        }
    } catch (error) {
        console.error('Error fetching popular items:', error);
        container.innerHTML = `
            <div class="text-center" style="grid-column: 1 / -1; color: red;">
                Failed to load popular items. Please try again later.
            </div>
        `;
    }
}

function renderPopularItems(items, container) {
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="text-center text-muted" style="grid-column: 1 / -1;">No items available right now.</div>';
        return;
    }

    container.innerHTML = items.map(item => `
        <article class="food-card">
            <div class="food-image">
                ${item.image_url 
                    ? `<img src="${item.image_url}" alt="${item.name}">` 
                    : `<span class="text-muted">No Image</span>`}
            </div>
            <div class="food-info">
                <h3 class="food-name">${item.name}</h3>
                <p class="text-muted mb-4" style="font-size: 0.875rem;">${item.description || ''}</p>
                <div class="food-footer">
                    <span class="food-price">₹${parseFloat(item.price).toFixed(2)}</span>
                    <a href="menu.html" class="btn btn-primary" style="padding: 0.25rem 0.75rem; font-size: 0.875rem;">Order Now</a>
                </div>
            </div>
        </article>
    `).join('');
}
