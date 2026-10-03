# Original User Request

## Initial Request — 2026-08-18T17:15:01Z

Build **Campus Canteen Express** — a complete, polished, production-style full-stack web application for campus food pre-ordering and express pickup. Students pre-order food from their campus canteen website, choose a same-day pickup time slot, pay digitally, and collect their order at the Express Counter using a short human-readable pickup token (e.g. `A7K4`). A canteen admin dashboard lets staff manage incoming orders through a controlled state machine (PLACED → ACCEPTED → PREPARING → READY → COLLECTED), verify pickup tokens, and view analytics.

This is **not** a demo or static mockup — it must be a real, modular, maintainable, responsive, secure, end-to-end application that can be run locally, demonstrated to faculty, and extended later.

Working directory: `c:\Users\arpit\OneDrive\Documents\Campus-Canteen-Express_antigravity`

Integrity mode: development

---

## Requirements

### R1. Full-Stack Web Application with Student and Admin Workflows

Build a complete food pre-ordering system with two user roles: **STUDENT** and **ADMIN/CANTEEN_STAFF**.

**Student workflow:** Register → Login → Browse live menu with search/category filtering → Add items to cart with quantities/variants → Choose a same-day pickup time slot → Review order → Pay digitally → Receive a unique Order ID (e.g. `CCE-1047`) and Pickup Token (e.g. `A7K4`) → Track order status → Collect food at Express Counter.

**Admin workflow:** View dashboard with today's order stats and revenue → See incoming orders → Accept orders → Mark preparing → Mark ready → Verify pickup token by manual entry (no QR) → Mark collected → Manage menu items (add/edit/disable/pricing) → View basic analytics (orders by status, popular items, peak slots, revenue).

The order lifecycle must follow a strict state machine: PLACED → ACCEPTED → PREPARING → READY → COLLECTED. Invalid transitions must be rejected by the backend. Order cancellation is allowed only before PREPARING status.

### R2. Technology Stack and Architecture

**Frontend:** HTML5, CSS3, Vanilla JavaScript (no React/Vue/Angular). Responsive design. Modern semantic HTML. Fetch API for backend communication.

**Backend:** Node.js with Express.js.

**Database:** Use SQLite for local development with a MySQL-compatible schema design (foreign keys, indexes, proper normalization). Use an ORM/query builder (Prisma or better-sqlite3 with a clean abstraction layer) so the schema can be migrated to MySQL later.

**Auth:** bcrypt password hashing, JWT-based authentication, role-based authorization middleware.

**Payment:** Razorpay integration code with a mock fallback when API keys aren't configured. The mock should simulate the same UX flow (open payment modal → success/failure callback) so the app works without real Razorpay credentials.

**Security:** Helmet, CORS, rate limiting, input validation, parameterized queries, environment config via .env.

Maintain clean separation: `frontend/` (HTML pages, CSS, JS modules, images), `backend/` (server.js, config/, controllers/, routes/, middleware/, services/, utils/, validators/), `database/` (schema/, migrations/, seed/), `tests/`.

### R3. Menu Data and Food Images

Seed the database with the real campus canteen menu items at these confirmed prices (₹ = Indian Rupees):

Normal Sandwich ₹30, Grilled/Chilli Sandwich ₹50, Cheese Grilled Sandwich ₹80, Spring Roll ₹50, Chilli Potato ₹70/₹120, French Fries ₹60/₹120, Cheese Maggi ₹80, Maggi ₹50, Burger ₹40, Patty ₹30/₹40, Tea ₹15, Coffee ₹30, Noodles ₹70/₹120, Aloo Paratha ₹40, Thali ₹100, Cheese Paneer Roll ₹70, Pasta Roll ₹70, Mini Pizza ₹50, Cheese Medium Pizza ₹120, Cold Coffee ₹50, Shikanji ₹50, Pastry ₹40, Magnum Ice Cream ₹70.

Categories: Sandwiches, Snacks, Meals, Rolls, Drinks, Desserts.

Each item needs: name, description, category, price, variant options (for items with multiple sizes), preparation time (configurable, e.g. Burger 10 min, Tea 5 min, Pizza 15 min), and availability toggle.

For food images: download high-quality free stock photos from Unsplash/Pexels for each menu item. Store them in `frontend/images/food/`. Use consistent dimensions and `object-fit: cover`. If any image can't be obtained, use a styled placeholder — never show broken image icons.

### R4. Pickup Slots, Tokens, and Server-Side Order Integrity

**Pickup slots:** Backend-controlled same-day time slots (e.g. 10-minute windows from 12:00–2:00 PM). Each slot has max capacity and tracks current orders. Full slots are rejected. Slot booking must use database transactions to prevent race conditions/overbooking.

**Pickup tokens:** Generate short, human-readable, case-insensitive tokens (e.g. `A7K4`). Avoid ambiguous characters (O/0, I/1, l). Tokens must be unique per active day.

**Server-side integrity:** The backend must recalculate all order totals (subtotal + ₹3 Express Pickup Fee). Never trust frontend-supplied totals. Payment verification must be server-side. Store item name/price snapshots in order_items so historical orders aren't affected by menu price changes.

### R5. Visual Design and UX Polish

The application must look like a polished startup MVP, not a college static website.

**Design system (CSS variables):**
- Primary green: `#16A34A`, dark: `#15803D`
- Text: `#172033`, muted: `#64748B`
- Background: `#F8FAFC`, border: `#E5E7EB`, white: `#FFFFFF`
- Consistent typography, border radii, shadows, spacing, buttons, cards, form controls, status badges

**Homepage:** Hero section with headline "Skip the Queue. Enjoy Your Break.", CTAs (Order Now / How It Works), feature cards, Popular Today section, How It Works steps, student/canteen benefits, footer.

**UX requirements:** Toast notifications, loading states on buttons, empty states with helpful messages and CTAs, smooth hover/transition effects, floating cart widget on menu page, professional order status timeline, responsive mobile layout (no horizontal scrolling, no overflow).

**Accessibility:** Semantic HTML, proper labels, keyboard navigation, focus states, meaningful alt text, sufficient contrast, ARIA labels where useful.

### R6. Documentation and Demo Experience

Create a comprehensive `README.md` with: project overview, features, tech stack, architecture, folder structure, installation, env vars, database setup, seed instructions, running frontend/backend, testing, API overview, demo credentials, future improvements.

Create `docs/` with architecture, database schema, API documentation.

Create `.env.example` with all required variables (PORT, DATABASE_URL, JWT_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET).

The application must support a smooth demo experience: a faculty user should be able to register as student → browse/order → get token → switch to admin panel → see same order → manage status → verify token → mark collected — and see it all connected.

---

## Acceptance Criteria

### Application Startup
- [ ] Running `npm install` and `npm run dev` (or equivalent) starts the backend server without errors
- [ ] Database schema is created automatically or via a migration command
- [ ] `npm run seed` populates the database with all 23+ menu items at the confirmed prices, default pickup slots, and at least one admin and one student test account
- [ ] Frontend pages load without JavaScript console errors

### Authentication & Authorization
- [ ] A new user can register with name, email, password; duplicate email is rejected with a clear error
- [ ] A registered user can log in and receives a JWT; wrong password returns 401
- [ ] Protected API routes reject unauthenticated requests with 401
- [ ] Admin-only routes (order management, menu management, analytics) reject student tokens with 403
- [ ] Frontend validates required fields, email format, password length, and matching passwords before submission

### Menu & Search
- [ ] `GET /api/menu` returns all available menu items with name, description, category, price, variants, image path, preparation time, availability
- [ ] The menu page renders all items with food images (no broken image icons), category filters, and a real-time search bar
- [ ] Searching filters by name, description, and category; "No matching food found" is shown for zero results
- [ ] Unavailable items show "Currently Unavailable" with a disabled Add to Cart button
- [ ] Admin can toggle item availability via API, and the change is reflected on the menu page

### Cart & Checkout
- [ ] Items can be added, quantity increased/decreased, and removed from cart
- [ ] A floating cart widget on the menu page shows item count and subtotal
- [ ] The cart page shows item images, names, quantities, unit prices, and totals
- [ ] Empty cart shows a friendly message with a "Browse Menu" link
- [ ] Checkout displays available same-day pickup slots with remaining capacity; full slots show "FULL" and are unselectable

### Order Creation & Payment
- [ ] Submitting an order creates a backend order with server-recalculated totals (subtotal + ₹3 Express fee)
- [ ] Payment flow works with the Razorpay mock (modal opens → success callback → order confirmed) when no Razorpay keys are configured
- [ ] On success: unique Order ID (e.g. `CCE-1047`) and Pickup Token (e.g. `A7K4`) are displayed
- [ ] The pickup slot's order count is incremented atomically (transaction-protected); a slot at max capacity rejects new orders
- [ ] Order items store name and price snapshots independent of future menu changes

### Order Status & Tracking
- [ ] Student's "My Orders" page shows order history with ID, date, items, total, slot, token, and status
- [ ] Order status is displayed as a visual timeline: PLACED → ACCEPTED → PREPARING → READY → COLLECTED
- [ ] Backend rejects invalid status transitions (e.g. COLLECTED → PREPARING returns an error)
- [ ] Student can cancel an order only if status is PLACED or ACCEPTED; cancellation after PREPARING is rejected

### Admin Dashboard
- [ ] Admin dashboard shows today's order count, orders by status (pending/preparing/ready/collected), and today's revenue
- [ ] Incoming orders list shows Order ID, student name, pickup token, slot, items, total, status, and timestamp
- [ ] Admin can advance order status through valid transitions; only the valid next-action button is shown
- [ ] Token verification: entering a valid token for a READY order shows order details and a "Mark Collected" button
- [ ] Entering an invalid token, or a token for an already-collected order, shows an appropriate error message
- [ ] Admin can add/edit menu items (name, price, description, category, preparation time, availability)

### Security & Error Handling
- [ ] Passwords are stored as bcrypt hashes (never plaintext)
- [ ] API responses never expose stack traces or internal error details in production mode
- [ ] Rate limiting is active on auth endpoints
- [ ] `.env.example` exists with all required variables; `.env` is in `.gitignore`
- [ ] Network failures, 4xx, and 5xx errors show user-friendly messages (no blank pages)

### Responsive Design
- [ ] Menu, cart, checkout, order tracking, and admin pages are usable on mobile viewport (375px width) without horizontal scrolling
- [ ] Navigation adapts to mobile (hamburger menu or equivalent)
- [ ] Food cards, checkout form, and admin order list are readable and interactive on all screen sizes

### Automated Tests
- [ ] A test suite (Jest or Mocha) exists in `tests/` with passing tests for:
  - User registration and login (including duplicate email, wrong password)
  - Protected route authorization (student vs admin)
  - Menu retrieval and item availability toggle
  - Order creation (valid, invalid item, full slot)
  - Order status transitions (valid and invalid)
  - Token verification (valid, invalid, already collected, not ready)
  - Payment verification (valid and invalid)
- [ ] `npm test` runs the suite and all tests pass

### End-to-End Smoke Test
- [ ] A scripted end-to-end test (or documented test script) walks through: Register → Login → Browse menu → Search → Filter → Add items → Cart → Checkout → Select slot → Pay → Get token → Admin login → See order → Accept → Prepare → Ready → Verify token → Collect — and each step succeeds

### Documentation
- [ ] `README.md` includes installation steps, env setup, seed command, run commands, and demo credentials
- [ ] Following the README from a fresh clone results in a working application
- [ ] `docs/` directory contains database schema documentation and API endpoint reference
