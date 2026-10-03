/**
 * Campus Canteen Express — Shared Navigation & Footer Components
 * Renders consistent header/footer across all pages.
 */

/* ───────── Navigation ───────── */

function renderNavbar() {
  const user = getUser();
  const loggedIn = isLoggedIn();
  const admin = isAdmin();
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Main navigation');

  nav.innerHTML = `
    <div class="container">
      <a href="/index.html" class="navbar-brand" aria-label="Campus Canteen Express - Home">
        🍽️ <span>Campus</span>Canteen
      </a>

      <div class="navbar-nav" id="navMenu">
        <a href="/index.html" class="${currentPage === 'index.html' ? 'active' : ''}">Home</a>
        <a href="/menu.html" class="${currentPage === 'menu.html' ? 'active' : ''}">Menu</a>
        ${loggedIn ? `<a href="/cart.html" class="${currentPage === 'cart.html' ? 'active' : ''}">Cart <span class="cart-count" style="display:none;background:var(--primary);color:white;border-radius:50%;width:18px;height:18px;font-size:11px;display:inline-flex;align-items:center;justify-content:center;margin-left:4px;">0</span></a>` : ''}
        ${loggedIn ? `<a href="/orders.html" class="${currentPage === 'orders.html' ? 'active' : ''}">My Orders</a>` : ''}
        ${admin ? `<a href="/admin.html" class="${currentPage === 'admin.html' ? 'active' : ''}">Admin</a>` : ''}
      </div>

      <div class="nav-actions">
        ${loggedIn
          ? `<span class="text-sm text-muted user-greeting" style="margin-right:6px;">Hi, ${escapeHtml(user?.name?.split(' ')[0] || 'User')}</span>
             <button class="btn btn-outline btn-sm" onclick="logout()" aria-label="Log out">Logout</button>`
          : `<a href="/login.html" class="btn btn-outline btn-sm">Login</a>
             <a href="/register.html" class="btn btn-primary btn-sm">Sign Up</a>`
        }
        <button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Toggle menu" aria-expanded="false">
          ☰
        </button>
      </div>
    </div>
  `;

  document.body.prepend(nav);

  // Update cart count after navbar renders
  setTimeout(updateCartCount, 0);
}

function toggleMobileMenu() {
  const menu = document.getElementById('navMenu');
  const btn = document.querySelector('.mobile-menu-btn');
  if (menu) {
    menu.classList.toggle('open');
    const isOpen = menu.classList.contains('open');
    btn.setAttribute('aria-expanded', isOpen);
    btn.textContent = isOpen ? '✕' : '☰';
  }
}

/* ───────── Footer ───────── */

function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.setAttribute('role', 'contentinfo');

  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">🍽️ <span>Campus</span>Canteen Express</div>
          <p class="footer-desc">
            Skip the queue and enjoy your break. Pre-order food from your campus canteen,
            choose a pickup time, and collect it instantly from the Express Counter.
          </p>
        </div>
        <div>
          <h4>Quick Links</h4>
          <div class="footer-links">
            <a href="/index.html">Home</a>
            <a href="/menu.html">Menu</a>
            <a href="/cart.html">Cart</a>
            <a href="/orders.html">My Orders</a>
          </div>
        </div>
        <div>
          <h4>Support</h4>
          <div class="footer-links">
            <a href="#">Help Center</a>
            <a href="#">Contact Us</a>
            <a href="#">FAQs</a>
            <a href="#">Feedback</a>
          </div>
        </div>
        <div>
          <h4>Legal</h4>
          <div class="footer-links">
            <a href="#">Terms of Service</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Refund Policy</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} Campus Canteen Express. All rights reserved.</span>
        <span>Made with 💚 for campus life</span>
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

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', initPageShell);
