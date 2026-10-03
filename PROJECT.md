# Project: Campus Canteen Express

## Architecture
Campus Canteen Express is a full-stack, modular, production-style web application for campus food pre-ordering and express counter collection.
- **Frontend Architecture**: Pure HTML5, CSS3, and Vanilla JavaScript (ES modules) with zero frontend framework dependencies. Responsive down to 375px mobile viewport. Design system based on CSS custom properties (`--color-primary: #16A34A`, `--color-primary-dark: #15803D`, `--color-text: #172033`, etc.).
- **Backend Architecture**: Node.js with Express.js layered architecture (Controllers -> Services -> Repositories/Database Layer -> Utils/Validators).
- **Database Architecture**: SQLite (WAL mode enabled, foreign keys enforced) with MySQL-compatible DDL schema design (normalized 7 tables: `users`, `menu_items`, `menu_item_variants`, `pickup_slots`, `orders`, `order_items`, `payments`). Clean abstraction layer for easy migration to MySQL.
- **Security & Integrity**: bcrypt password hashing, JWT Bearer tokens, Helmet HTTP headers, CORS, rate limiting, parameterized SQL queries, server-side price recalculation (Subtotal + ₹3 Express Fee), price snapshotting, atomic transactional slot capacity management, and deterministic 4-character pickup token generation (`ABCDEFGHJKMNPQRSTUVWXY3456789`).
- **Payment Architecture**: Dual-mode Razorpay service supporting live key HMAC verification and an automated client-side/server-side Mock Payment fallback.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Database Schema & Migrations | 7 normalized tables (`users`, `menu_items`, `menu_item_variants`, `pickup_slots`, `orders`, `order_items`, `payments`) with foreign keys, indexes, timestamps | M1 | R1, R2, R4 |
| 2 | Seed Catalog & Initial Accounts | All 23 confirmed menu items with exact prices, categories, variants, prep times, default 10-min slots (12-2 PM), and demo admin/student accounts | M1 | R1, R3, R4, R6 |
| 3 | Authentication & Authorization | Student and Admin registration & login, bcrypt hashing, JWT tokens, role-based middleware (`verifyToken`, `requireAdmin`, `requireStudent`) | M2 | R1, R2 |
| 4 | Menu Management API | `GET /api/menu` (with filtering/search), admin `POST /api/menu`, `PUT /api/menu/:id`, `PATCH /api/menu/:id/availability`, `DELETE /api/menu/:id` | M2 | R1, R3 |
| 5 | Pickup Slot Booking API | Same-day 10-minute slots query, atomic capacity check and increment during order placement using DB transactions, slot release on cancellation | M2 | R1, R4 |
| 6 | Server-Side Order Pricing & Integrity | Server recalculation of subtotal + ₹3 Express Pickup Fee, item price & name snapshotting in `order_items`, rejection of client-supplied totals | M2 | R1, R4 |
| 7 | Order State Machine | Strict transition pipeline: `PLACED` -> `ACCEPTED` -> `PREPARING` -> `READY` -> `COLLECTED`. Reject invalid jumps; allow cancellation only before `PREPARING` | M2 | R1, R4 |
| 8 | Pickup Token Generation & Verification | 4-character unambiguous token (`ABCDEFGHJKMNPQRSTUVWXY3456789`), daily uniqueness, admin token verification API (`POST /api/admin/orders/verify-token`) | M2 | R1, R4 |
| 9 | Payment Integration & Mock Fallback | Razorpay payment creation & verification with mock fallback simulation when API keys are unconfigured | M2 | R2, R4 |
| 10 | Admin Analytics & Reporting API | Dashboard stats (today's orders, revenue, status breakdown, popular items, peak slots) | M2 | R1, R6 |
| 11 | Design System & CSS Assets | CSS variables (`#16A34A`, `#15803D`, `#172033`, `#F8FAFC`), typography, buttons, cards, modals, toast system, responsive layout (375px mobile) | M3 | R5 |
| 12 | Food Image Asset Sourcing & Fallbacks | Food images in `frontend/images/food/` for all 23 items with `object-fit: cover` and styled SVG placeholder fallback | M3 | R3, R5 |
| 13 | Student Pages & Workflows | Landing/Hero page, Auth (Login/Register with demo quick-fill), Menu browsing (search, category tabs, availability badges, floating cart), Cart & Checkout (slot picker, order summary, payment modal), My Orders / Order Tracking (visual status timeline, cancellation button) | M3 | R1, R5 |
| 14 | Admin Dashboard & Express Counter UI | Admin dashboard with KPI metric cards, live incoming orders list, action buttons for valid state transitions, manual token verification counter, menu CRUD management modal | M3 | R1, R5 |
| 15 | Responsive Mobile Navigation & UX Polish | Mobile drawer / hamburger navigation, loading states, empty cart states, animated toasts, error notifications | M3 | R5 |
| 16 | System Integration & End-to-End Wiring | Full frontend-to-backend API wiring, environment configuration, static asset serving | M4 | R1, R2, R6 |
| 17 | Project Documentation & Developer Experience | Comprehensive `README.md`, `docs/architecture.md`, `docs/database.md`, `docs/api.md`, `.env.example`, npm scripts (`dev`, `seed`, `test`, `test:e2e`) | M4 | R6 |
| 18 | Automated Test Suite (Tiers 1-4) | Jest + Supertest test suite covering Auth, Menu, Cart, Orders, Slots, State Machine, Payment, Token Verification, Admin Endpoints, and E2E Smoke Flow | Final (Phase 1) | Acceptance Criteria |
| 19 | Adversarial Coverage Hardening (Tier 5) | Concurrency race condition stress tests, price tampering rejection, invalid state jumps, token brute force resistance, payment replay prevention | Final (Phase 2) | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Schema, Models & Seed Data | SQLite database configuration, 7 normalized tables DDL, database connection/query module, seed script with exact 23 menu items & prices, initial slots, and demo users | none | DONE |
| M2 | Backend Core REST API & Business Logic | Express server, security middleware, JWT auth, menu API, transactional slot booking, server price calculation, order state machine, token generator & verifier, Razorpay mock service, admin analytics | M1 | DONE |
| M3 | Frontend Web App, Design System & Assets | CSS design system, HTML5 pages (Landing, Auth, Menu, Cart, Orders, Admin), Vanilla JS client modules, 23+ food image assets with SVG fallbacks, responsive layout (375px) | M2 | IN_PROGRESS |
| M4 | Integration, Polish, Docs & Demo Experience | Full end-to-end frontend/backend integration, error handling, `.env.example`, `README.md`, complete `docs/`, demo verification script | M3 | PLANNED |
| E2E | E2E Testing Track | Independent opaque-box test harness, Tier 1-4 test suites, automated E2E smoke test script, `TEST_READY.md` publication | Parallel to M1-M4 | DONE |
| Final | Full E2E Test Pass & Adversarial Hardening | Phase 1: 100% passing tests across Tiers 1-4. Phase 2: Adversarial hardening & stress verification (Tier 5) | M4, E2E | PLANNED |

## Interface Contracts
### Client ↔ Backend REST API
- `POST /api/auth/register` { name, email, password, role? } -> 201 { success: true, token, user }
- `POST /api/auth/login` { email, password } -> 200 { success: true, token, user }
- `GET /api/auth/me` [Bearer Token] -> 200 { success: true, user }
- `GET /api/menu` -> 200 { success: true, items: [...] }
- `POST /api/menu` [Admin] { name, description, category, price, preparation_time, is_available, variants? } -> 201 { success: true, item }
- `PUT /api/menu/:id` [Admin] { ... } -> 200 { success: true, item }
- `PATCH /api/menu/:id/availability` [Admin] { is_available } -> 200 { success: true, item }
- `DELETE /api/menu/:id` [Admin] -> 200 { success: true }
- `GET /api/slots/available?date=YYYY-MM-DD` -> 200 { success: true, slots: [...] }
- `POST /api/orders` [Bearer Token] { slot_id, items: [{ item_id, variant_id?, quantity }] } -> 201 { success: true, order: { id, order_number, pickup_token, total_amount, ... }, payment: { razorpay_order_id, is_mock } }
- `POST /api/orders/verify-payment` [Bearer Token] { order_id, razorpay_payment_id, razorpay_order_id, razorpay_signature } -> 200 { success: true, order }
- `GET /api/orders/my-orders` [Bearer Token] -> 200 { success: true, orders: [...] }
- `GET /api/orders/:id` [Bearer Token] -> 200 { success: true, order: { ..., items: [...], slot: {...} } }
- `POST /api/orders/:id/cancel` [Bearer Token] -> 200 { success: true, message: "Order cancelled" }
- `GET /api/admin/orders` [Admin] -> 200 { success: true, orders: [...] }
- `PATCH /api/admin/orders/:id/status` [Admin] { status: "ACCEPTED"|"PREPARING"|"READY"|"COLLECTED" } -> 200 { success: true, order }
- `POST /api/admin/orders/verify-token` [Admin] { pickup_token } -> 200 { success: true, order }
- `GET /api/admin/analytics/dashboard` [Admin] -> 200 { success: true, stats: { today_orders, today_revenue, status_breakdown, popular_items, peak_slots } }

## Code Layout
```
c:\Users\arpit\OneDrive\Documents\Campus-Canteen-Express_antigravity/
├── backend/
│   ├── config/
│   │   ├── database.js
│   │   └── index.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── menuController.js
│   │   ├── slotController.js
│   │   ├── orderController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   └── validator.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── menuRoutes.js
│   │   ├── slotRoutes.js
│   │   ├── orderRoutes.js
│   │   └── adminRoutes.js
│   ├── services/
│   │   ├── authService.js
│   │   ├── orderService.js
│   │   ├── tokenService.js
│   │   └── paymentService.js
│   ├── utils/
│   │   ├── logger.js
│   │   └── response.js
│   └── server.js
├── database/
│   ├── schema.sql
│   ├── init.js
│   ├── seed.js
│   └── canteen.db (runtime)
├── frontend/
│   ├── css/
│   │   ├── variables.css
│   │   ├── global.css
│   │   ├── components.css
│   │   ├── pages.css
│   │   └── responsive.css
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── cart.js
│   │   ├── menu.js
│   │   ├── orders.js
│   │   ├── admin.js
│   │   ├── toast.js
│   │   └── main.js
│   ├── images/
│   │   ├── food/ (23+ images)
│   │   └── icons/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── menu.html
│   ├── cart.html
│   ├── orders.html
│   └── admin.html
├── docs/
│   ├── architecture.md
│   ├── database.md
│   └── api.md
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```
