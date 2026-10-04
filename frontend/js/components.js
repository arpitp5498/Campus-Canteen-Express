/**
 * Campus Canteen Express — Shared Navigation & Footer Components
 * Renders modern, responsive, accessible header/footer across all pages.
 */

/* ───────── Navigation ───────── */

function renderNavbar() {
  const user = getUser();
  const loggedIn = isLoggedIn();
  const admin = isAdmin();
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // Remove any pre-existing navbar
  const existingNav = document.querySelector('.navbar');
  if (existingNav) existingNav.remove();

  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Main campus navigation');

  const firstName = user?.name ? escapeHtml(user.name.split(' ')[0]) : 'Student';
  const userInitial = firstName.charAt(0).toUpperCase();

  nav.innerHTML = `
    <div class="container">
      <a href="/index.html" class="navbar-brand" aria-label="Campus Canteen Express - Home">
        <div class="brand-icon-box">🍽️</div>
        <span>Campus</span> Canteen
      </a>

      <div class="navbar-nav" id="navMenu">
        <a href="/index.html" class="${currentPage === 'index.html' || currentPage === '' ? 'active' : ''}">
          🏠 Home
        </a>
        <a href="/menu.html" class="${currentPage === 'menu.html' ? 'active' : ''}">
          📋 Express Menu
        </a>
        ${loggedIn ? `
          <a href="/cart.html" class="${currentPage === 'cart.html' ? 'active' : ''}">
            🛒 Cart <span class="cart-nav-badge cart-count" style="display:none;">0</span>
          </a>
          <a href="/orders.html" class="${currentPage === 'orders.html' ? 'active' : ''}">
            📦 My Orders
          </a>
        ` : ''}
        ${admin ? `
          <a href="/admin.html" class="${currentPage === 'admin.html' ? 'active' : ''}">
            🛡️ Canteen Staff
          </a>
        ` : ''}
      </div>

      <div class="nav-actions">
        ${loggedIn
          ? `
            <div class="user-pill user-greeting">
              <span class="user-pill-avatar">${userInitial}</span>
              <span>${firstName}</span>
            </div>
            <button class="btn btn-outline btn-sm" onclick="logout()" aria-label="Log out of account">
              Logout
            </button>
          `
          : `
            <a href="/login.html" class="btn btn-outline btn-sm">Login</a>
            <a href="/register.html" class="btn btn-primary btn-sm">Sign Up</a>
          `
        }
        <button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Toggle navigation drawer" aria-expanded="false">
          ☰
        </button>
      </div>
    </div>
  `;

  document.body.prepend(nav);

  // Update live cart item count
  setTimeout(updateCartCount, 0);
}

function toggleMobileMenu() {
  const menu = document.getElementById('navMenu');
  const btn = document.querySelector('.mobile-menu-btn');
  if (menu && btn) {
    menu.classList.toggle('open');
    const isOpen = menu.classList.contains('open');
    btn.setAttribute('aria-expanded', isOpen);
    btn.textContent = isOpen ? '✕' : '☰';
  }
}

// Close mobile menu on outside click or resize
document.addEventListener('click', (e) => {
  const menu = document.getElementById('navMenu');
  const btn = document.querySelector('.mobile-menu-btn');
  if (menu && menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('open');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = '☰';
    }
  }
});

/* ───────── Footer ───────── */

function renderFooter() {
  const existingFooter = document.querySelector('.footer');
  if (existingFooter) existingFooter.remove();

  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.setAttribute('role', 'contentinfo');

  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">
            <span>🍽️ Campus</span> Canteen Express
          </div>
          <p class="footer-desc">
            Skip the lunchtime queue and maximize your break. Pre-order fresh campus meals,
            pick a guaranteed 10-minute Express Slot, and collect seamlessly using your private token.
          </p>
          <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.06); padding: 6px 12px; border-radius: 6px; font-size: 0.775rem; color: #86EFAC;">
            ⚡ Express Window: 12:00 PM – 1:00 PM (Today & Tomorrow)
          </div>
        </div>
        <div>
          <h4>Campus Quick Links</h4>
          <div class="footer-links">
            <a href="/index.html">Home</a>
            <a href="/menu.html">Express Menu</a>
            <a href="/cart.html">View Cart</a>
            <a href="/orders.html">My Orders</a>
          </div>
        </div>
        <div>
          <h4>Express Service</h4>
          <div class="footer-links">
            <a href="/menu.html">Today's Lunch (₹3 fee)</a>
            <a href="/menu.html">Tomorrow Pre-order (₹1 fee)</a>
            <a href="/index.html#how-it-works">How Token Pickup Works</a>
            <a href="/login.html">Canteen Staff Portal</a>
          </div>
        </div>
        <div>
          <h4>Student Support</h4>
          <div class="footer-links">
            <a href="#">Canteen Counter Help</a>
            <a href="#">Order Issues & Refunds</a>
            <a href="#">Terms & Conditions</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} Campus Canteen Express. Powered by MySQL 8.0 & Express.</span>
        <span>Crafted for college students & canteen staff 💚</span>
      </div>
    </div>
  `;

  document.body.appendChild(footer);
}

/* ───────── Initialize Page Shell ───────── */

function initPageShell() {
  renderNavbar();
  renderFooter();
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initPageShell);
