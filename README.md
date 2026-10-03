# Campus Canteen Express (CCE) 🍔⚡

Campus Canteen Express is a full-stack smart canteen pre-ordering and express pickup system with time-slot management, token-based verification, menu catalog browsing, mock/Razorpay payments, and an administrative dashboard.

The application uses **MySQL 8.0** as its primary relational database with high-performance connection pooling, ACID transactional integrity, and normalized InnoDB tables.

---

## 🏗️ Architecture & Database Configuration

### Database Engine: MySQL 8.0 (InnoDB)
- **Database Name**: `campus_canteen`
- **Character Set**: `utf8mb4`
- **Collation**: `utf8mb4_unicode_ci`
- **Default Port**: `3306`
- **Default User**: `campuscanteen`

### Connection Configuration (`.env`)
```env
PORT=5000
NODE_ENV=development

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=campuscanteen
DB_PASSWORD=campuscanteen
DB_NAME=campus_canteen
DB_CONNECTION_LIMIT=10

# Security & Business Logic
JWT_SECRET=super_secret_jwt_canteen_express_2026_key
JWT_EXPIRES_IN=24h
EXPRESS_PICKUP_FEE_TODAY=3.00
EXPRESS_PICKUP_FEE_TOMORROW=1.00
```

---

## 🗄️ Database Schema & Relational Model

The database schema consists of **7 normalized InnoDB tables**:

1. **`users`**: User accounts (Students, Admins, Canteen Staff) with bcrypt password hashing (`$2a$10$...`).
2. **`menu_items`**: 23 canonical canteen items across 6 categories (Sandwiches, Snacks, Meals, Rolls, Drinks, Desserts) with prep times and local image paths.
3. **`menu_item_variants`**: Size variants (Half/Full, Regular/Large, Normal/Cheese) for multi-portion items.
4. **`pickup_slots`**: 10-minute pickup windows strictly between 12:00 PM – 1:00 PM (6 slots per day, capacity 15 each).
5. **`orders`**: Student orders with timestamps, subtotal, express fees (₹3 today / ₹1 tomorrow), order status state machine, and SHA-256 hashed pickup tokens for admin counter verification.
6. **`order_items`**: Order line items capturing snapshot price, item name, variant name, and quantity at time of purchase.
7. **`payments`**: Payment records supporting Mock Payment Mode and live Razorpay transactions with payment state tracking.

---

## 🛠️ Database Setup, Migration & Seeding

### 1. Initialize Database Schema
To create all tables, indexes, constraints, and foreign keys:
```bash
npm run db:init
```
*(Executes `database/init.js` with `database/schema.mysql.sql`)*

### 2. Seed Initial Data
To populate the 4 test user accounts, 23 menu items, 8 variants, and 12 slots for today and tomorrow:
```bash
npm run db:seed
```

### 3. SQLite to MySQL Migration Script
If migrating data from a legacy SQLite `canteen.db` backup:
```bash
npm run db:migrate
```
*(Executes `database/migrate-sqlite-to-mysql.js` with row-by-row validation)*

---

## 🔍 Inspecting Data in MySQL Workbench 8.0 CE

1. Open **MySQL Workbench 8.0 CE**.
2. Click **+** to add a new connection:
   - **Connection Name**: `Campus Canteen Local`
   - **Hostname**: `localhost`
   - **Port**: `3306`
   - **Username**: `campuscanteen`
   - **Default Schema**: `campus_canteen`
3. Click **Store in Vault...** and enter password `campuscanteen` (or your configured password).
4. Click **Test Connection** -> **OK**.
5. Once connected, open a SQL tab and run:
```sql
USE campus_canteen;

-- View all menu items
SELECT id, name, category, base_price, prep_time_minutes, image_url 
FROM menu_items 
ORDER BY id;

-- View active pickup slots
SELECT id, slot_date, start_time, end_time, current_orders, max_capacity 
FROM pickup_slots 
ORDER BY slot_date, start_time;

-- View recent orders
SELECT id, order_number, user_id, pickup_date, order_type, subtotal, express_fee, total_amount, status, created_at 
FROM orders 
ORDER BY id DESC;
```

---

## 🚀 Running the Application

### Start the Backend API Server (Port 5000)
```bash
npm start
# Or in development mode with nodemon:
npm run dev
```

### Accessing the Web Application
Open your browser and navigate to:
- **Student Home / Login**: `http://localhost:5000`
- **Menu Catalog**: `http://localhost:5000/menu.html`
- **Express Checkout**: `http://localhost:5000/checkout.html`
- **My Orders**: `http://localhost:5000/orders.html`
- **Staff / Admin Dashboard**: `http://localhost:5000/admin.html`
- **API Health Check**: `http://localhost:5000/api/health`

---

## 🧪 Testing & Verification

### Run Automated Test Suite
```bash
npm test
```

### Run Feature Verification Script
```bash
node scratch/verify_enhancements.js
```

---

## 🔐 Default Test Accounts

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin / Staff** | `admin@canteen.local` | `Admin@123` |
| **Admin / Manager** | `admin@campus.edu` | `Admin@12345` |
| **Student** | `student@campus.edu` | `Student@12345` |
| **Student** | `student@canteen.local` | `Student@123` |
